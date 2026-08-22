import { randomUUID } from "crypto";
import { toJson } from "../lib/serialize";
import { Router, type IRouter } from "express";
import { desc, eq, inArray } from "drizzle-orm";
import {
  db,
  accessRequestsTable,
  activityTable,
  dealsTable,
  notificationsTable,
} from "@workspace/db";
import { isBroker } from "../lib/brokerAuth";
import {
  ListAccessRequestsResponse,
  UpdateAccessRequestParams,
  UpdateAccessRequestBody,
  UpdateAccessRequestResponse,
  SignAccessRequestNdaParams,
  SignAccessRequestNdaBody,
  SignAccessRequestNdaResponse,
} from "@workspace/api-zod";
import { NDA_TITLE, NDA_PREAMBLE, NDA_CLAUSES } from "@workspace/nda-terms";

const router: IRouter = Router();

// Enforced lifecycle: a request cannot jump straight to nda_signed.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ["approved", "rejected"],
  approved: ["nda_sent", "rejected"],
  nda_sent: ["nda_signed", "rejected"],
  nda_signed: [],
  rejected: [],
};

router.get("/access-requests", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  let requests;
  if (req.user.role === "broker") {
    // Brokers only see requests on deals they own.
    const ownedDeals = await db
      .select({ id: dealsTable.id })
      .from(dealsTable)
      .where(eq(dealsTable.brokerUserId, req.user.id));
    const dealIds = ownedDeals.map((d) => d.id);
    requests = dealIds.length
      ? await db
          .select()
          .from(accessRequestsTable)
          .where(inArray(accessRequestsTable.dealId, dealIds))
          .orderBy(desc(accessRequestsTable.createdAt))
      : [];
  } else {
    // Investors only see their own requests. Confidential deal titles stay
    // masked until the NDA is signed.
    const rows = await db
      .select({
        request: accessRequestsTable,
        confidential: dealsTable.confidential,
        assetClass: dealsTable.assetClass,
      })
      .from(accessRequestsTable)
      .leftJoin(dealsTable, eq(accessRequestsTable.dealId, dealsTable.id))
      .where(eq(accessRequestsTable.requesterUserId, req.user.id))
      .orderBy(desc(accessRequestsTable.createdAt));
    requests = rows.map(({ request, confidential, assetClass }) =>
      confidential && request.status !== "nda_signed"
        ? {
            ...request,
            dealTitle: `Confidential ${assetClass ?? ""} Opportunity`.replace("  ", " "),
          }
        : request,
    );
  }

  // Strip the download capability — it must never appear in listings.
  const safe = requests.map(
    ({ downloadToken: _t, ndaSignedAt: _s, requestKey: _k, ...rest }) => rest,
  );
  res.json(ListAccessRequestsResponse.parse(toJson(safe)));
});

router.patch("/access-requests/:id", async (req, res): Promise<void> => {
  const params = UpdateAccessRequestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateAccessRequestBody.safeParse(req.body);
  if (!body.success || !(body.data.status in ALLOWED_TRANSITIONS)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }

  const [existing] = await db
    .select()
    .from(accessRequestsTable)
    .where(eq(accessRequestsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Access request not found" });
    return;
  }

  const [deal] = await db
    .select()
    .from(dealsTable)
    .where(eq(dealsTable.id, existing.dealId));

  const signing = body.data.status === "nda_signed";
  const brokerAuthed =
    isBroker(req) ||
    (req.isAuthenticated() &&
      req.user.role === "broker" &&
      deal?.brokerUserId === req.user.id);

  // Investors self-sign using their requestKey — no session required.
  const isRequester =
    signing &&
    !!existing.requestKey &&
    body.data.requestKey === existing.requestKey;

  if (signing && !brokerAuthed && !isRequester) {
    // A wrong requestKey is a 403 (credential present but invalid).
    // No credential at all is a 401.
    const hasCredential = !!body.data.requestKey || isBroker(req) || req.isAuthenticated();
    res.status(hasCredential ? 403 : 401).json({
      error: body.data.requestKey
        ? "Invalid request key"
        : "Authentication required",
    });
    return;
  }

  if (!signing && !brokerAuthed) {
    // Unauthenticated attempt → 401; authenticated but wrong role → 403.
    const hasCredential = isBroker(req) || req.isAuthenticated();
    res.status(hasCredential ? 403 : 401).json({
      error: hasCredential ? "Broker authentication required" : "Unauthorized",
    });
    return;
  }

  const allowed = ALLOWED_TRANSITIONS[existing.status] ?? [];
  if (!allowed.includes(body.data.status)) {
    res.status(409).json({
      error: `Cannot move request from "${existing.status}" to "${body.data.status}"`,
    });
    return;
  }

  const downloadToken = signing ? randomUUID() : undefined;

  const [request] = await db
    .update(accessRequestsTable)
    .set({
      status: body.data.status,
      ...(signing ? { downloadToken, ndaSignedAt: new Date() } : {}),
    })
    .where(eq(accessRequestsTable.id, params.data.id))
    .returning();

  if (signing) {
    await db.insert(activityTable).values({
      type: "nda_signed",
      description: `${request.requesterName} signed the NDA for ${request.dealTitle}`,
    });
    // Alert the listing broker that the NDA was signed (unless they signed
    // it themselves on the investor's behalf).
    if (deal?.brokerUserId && deal.brokerUserId !== (req.isAuthenticated() ? req.user.id : null)) {
      await db.insert(notificationsTable).values({
        userId: deal.brokerUserId,
        type: "nda_signed",
        message: `${request.requesterName} signed the NDA for ${request.dealTitle}.`,
        dealId: request.dealId,
        accessRequestId: request.id,
      });
    }
  }

  // Notify the requesting investor when their request status changes.
  if (request.requesterUserId && request.status !== existing.status) {
    const displayTitle =
      deal?.confidential && request.status !== "nda_signed"
        ? `Confidential ${deal.assetClass ?? ""} Opportunity`.replace("  ", " ")
        : request.dealTitle;
    const messageByStatus: Record<string, string> = {
      approved: `Your access request for ${displayTitle} was approved.`,
      nda_sent: `The NDA for ${displayTitle} is ready for your signature.`,
      rejected: `Your access request for ${displayTitle} was declined.`,
      pending: `Your access request for ${displayTitle} was moved back to pending.`,
    };
    await db.insert(notificationsTable).values({
      userId: request.requesterUserId,
      type: "access_request_status",
      message:
        messageByStatus[request.status] ??
        `Your access request for ${displayTitle} was updated.`,
      dealId: request.dealId,
      accessRequestId: request.id,
    });
  }

  // Never echo the stored token except to the caller who just signed.
  const {
    downloadToken: _stored,
    ndaSignedAt: _at,
    requestKey: _key,
    ...safe
  } = request;
  res.json(
    UpdateAccessRequestResponse.parse(
      toJson({ ...safe, downloadToken: signing ? downloadToken : null }),
    ),
  );
});

// Investor signs the NDA on their own request: nda_sent -> nda_signed.
router.post("/access-requests/:id/sign", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = SignAccessRequestNdaParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = SignAccessRequestNdaBody.safeParse(req.body);
  if (!body.success || !body.data.signerName.trim() || !body.data.agreed) {
    res
      .status(400)
      .json({ error: "Signer name and agreement are required" });
    return;
  }

  const [existing] = await db
    .select()
    .from(accessRequestsTable)
    .where(eq(accessRequestsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Access request not found" });
    return;
  }
  if (existing.requesterUserId !== req.user.id) {
    res
      .status(403)
      .json({ error: "Only the requesting investor can sign this NDA" });
    return;
  }
  if (existing.status !== "nda_sent") {
    res.status(409).json({ error: "This request is not awaiting signature" });
    return;
  }

  const signedAt = new Date();
  const [request] = await db
    .update(accessRequestsTable)
    .set({
      status: "nda_signed",
      signerName: body.data.signerName.trim(),
      signedAt,
    })
    .where(eq(accessRequestsTable.id, params.data.id))
    .returning();

  await db.insert(activityTable).values({
    type: "nda_signed",
    description: `${request.signerName} signed the NDA for ${request.dealTitle}`,
  });

  // Alert the listing broker that the NDA was signed.
  const [deal] = await db
    .select()
    .from(dealsTable)
    .where(eq(dealsTable.id, request.dealId));
  if (deal?.brokerUserId) {
    await db.insert(notificationsTable).values({
      userId: deal.brokerUserId,
      type: "nda_signed",
      message: `${request.signerName} signed the NDA for ${request.dealTitle}.`,
      dealId: request.dealId,
      accessRequestId: request.id,
    });
  }

  res.json(SignAccessRequestNdaResponse.parse(toJson(request)));
});

// Downloadable/printable record of a signed NDA. Returns a self-contained
// HTML page (viewable in the browser, printable to PDF); `?download=1` serves
// it as a file attachment. Visible only to the requesting investor and the
// listing broker.
router.get(
  "/access-requests/:id/nda-record",
  async (req, res): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid access request id" });
      return;
    }

    const [request] = await db
      .select()
      .from(accessRequestsTable)
      .where(eq(accessRequestsTable.id, id));
    if (!request) {
      res.status(404).json({ error: "Access request not found" });
      return;
    }

    const [deal] = await db
      .select()
      .from(dealsTable)
      .where(eq(dealsTable.id, request.dealId));

    const isRequester = request.requesterUserId === req.user.id;
    const isListingBroker =
      deal != null &&
      deal.brokerUserId != null &&
      deal.brokerUserId === req.user.id;

    if (!isRequester && !isListingBroker) {
      res.status(403).json({
        error:
          "Only the requesting investor or listing broker can view this record",
      });
      return;
    }

    if (
      request.status !== "nda_signed" ||
      !request.signedAt ||
      !request.signerName
    ) {
      res.status(409).json({ error: "This NDA has not been signed yet" });
      return;
    }

    const signedAtUtc = request.signedAt
      .toISOString()
      .replace("T", " ")
      .replace(/\.\d+Z$/, " UTC");
    const html = renderNdaRecordHtml({
      dealTitle: request.dealTitle,
      brokerName: deal?.brokerName ?? null,
      brokerCompany: deal?.brokerCompany ?? null,
      signerName: request.signerName,
      requesterName: request.requesterName,
      requesterCompany: request.requesterCompany,
      signedAt: signedAtUtc,
      requestId: request.id,
    });

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (req.query.download === "1") {
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="nda-record-${request.id}.html"`,
      );
    }
    res.send(html);
  },
);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderNdaRecordHtml(record: {
  dealTitle: string;
  brokerName: string | null;
  brokerCompany: string | null;
  signerName: string;
  requesterName: string;
  requesterCompany: string;
  signedAt: string;
  requestId: number;
}): string {
  const e = escapeHtml;
  const clauses = NDA_CLAUSES.map(
    (c, i) => `<p class="clause"><strong>${i + 1}.</strong> ${e(c)}</p>`,
  ).join("\n      ");
  const brokerLine = record.brokerName
    ? `${e(record.brokerName)}${record.brokerCompany ? ` — ${e(record.brokerCompany)}` : ""}`
    : "RealEstate Vault Listing Broker";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Signed NDA Record — ${e(record.dealTitle)}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; background: #f4f2ee; margin: 0; padding: 2rem 1rem; }
  .sheet { max-width: 720px; margin: 0 auto; background: #fff; border: 1px solid #d9d4c8; padding: 3rem; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
  .brand { font-size: 0.75rem; letter-spacing: 0.25em; text-transform: uppercase; color: #8a7a4d; margin-bottom: 0.5rem; }
  h1 { font-size: 1.6rem; margin: 0 0 0.25rem; }
  .subtitle { color: #666; font-size: 0.9rem; margin-bottom: 2rem; }
  h2 { font-size: 0.8rem; letter-spacing: 0.15em; text-transform: uppercase; color: #8a7a4d; border-bottom: 1px solid #e5e0d5; padding-bottom: 0.4rem; margin-top: 2rem; }
  .clause { line-height: 1.6; font-size: 0.95rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.95rem; }
  td { padding: 0.45rem 0; vertical-align: top; }
  td.label { width: 40%; color: #666; }
  .signature { margin-top: 1rem; padding: 1rem 1.25rem; border: 1px solid #e5e0d5; background: #faf9f6; }
  .signature .name { font-family: 'Brush Script MT', cursive; font-size: 1.8rem; }
  .footer { margin-top: 2.5rem; font-size: 0.75rem; color: #999; }
  .actions { max-width: 720px; margin: 0 auto 1rem; display: flex; gap: 0.5rem; justify-content: flex-end; }
  .actions a, .actions button { font-family: inherit; font-size: 0.85rem; padding: 0.5rem 1rem; border: 1px solid #8a7a4d; background: #fff; color: #8a7a4d; cursor: pointer; text-decoration: none; border-radius: 4px; }
  @media print { body { background: #fff; padding: 0; } .sheet { border: none; box-shadow: none; padding: 0; } .actions { display: none; } }
</style>
</head>
<body>
  <div class="actions">
    <a href="?download=1">Download</a>
    <button onclick="window.print()">Print / Save as PDF</button>
  </div>
  <div class="sheet">
    <div class="brand">RealEstate Vault — Signed NDA Record</div>
    <h1>${e(NDA_TITLE)}</h1>
    <div class="subtitle">Record #${record.requestId} · Executed electronically</div>

    <h2>Parties &amp; Deal</h2>
    <table>
      <tr><td class="label">Investment Opportunity</td><td><strong>${e(record.dealTitle)}</strong></td></tr>
      <tr><td class="label">Listing Broker</td><td>${brokerLine}</td></tr>
      <tr><td class="label">Receiving Party</td><td>${e(record.requesterName)} — ${e(record.requesterCompany)}</td></tr>
    </table>

    <h2>Agreement Terms</h2>
    <p class="clause">${e(NDA_PREAMBLE)}</p>
      ${clauses}

    <h2>Electronic Signature</h2>
    <div class="signature">
      <div class="name">${e(record.signerName)}</div>
      <table>
        <tr><td class="label">Signed by</td><td>${e(record.signerName)}</td></tr>
        <tr><td class="label">On behalf of</td><td>${e(record.requesterCompany)}</td></tr>
        <tr><td class="label">Date &amp; time of signature</td><td>${e(record.signedAt)}</td></tr>
      </table>
    </div>

    <div class="footer">
      This document is a system-generated record of an NDA executed electronically via RealEstate Vault.
      The typed name above constitutes the signer's electronic signature.
    </div>
  </div>
</body>
</html>`;
}

export default router;
