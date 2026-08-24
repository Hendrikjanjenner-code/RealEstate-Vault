import { Router, type IRouter, type Request } from "express";
import { desc, eq, and, inArray } from "drizzle-orm";
import {
  db,
  dealsTable,
  accessRequestsTable,
  loisTable,
  notificationsTable,
  activityTable,
  type Deal,
  type Loi,
} from "@workspace/db";
import {
  LOI_TITLE,
  LOI_DEFAULTS,
  buildLoiParagraphs,
  type LoiFacts,
} from "@workspace/loi-terms";
import {
  GetLoiDraftParams,
  GetLoiDraftResponse,
  ListDealLoisParams,
  ListDealLoisResponse,
  SubmitLoiParams,
  SubmitLoiBody,
  SubmitLoiResponse,
  UpdateLoiStatusParams,
  UpdateLoiStatusBody,
  UpdateLoiStatusResponse,
} from "@workspace/api-zod";
import { toJson } from "../lib/serialize";

const router: IRouter = Router();

/**
 * Strict deal-manager check: only the identified listing broker. No
 * any-broker fallback — LOIs contain confidential bid information.
 */
function isDealManager(req: Request, deal: Deal): boolean {
  return (
    req.isAuthenticated() &&
    deal.brokerUserId != null &&
    req.user.id === deal.brokerUserId
  );
}

/**
 * The nda_signed access request that entitles this user to prepare an LOI
 * for the deal, or null when the NDA has not been signed.
 */
async function signedNdaRequest(
  dealId: number,
  userId: string,
): Promise<{ id: number; requesterName: string; requesterCompany: string } | null> {
  const [request] = await db
    .select({
      id: accessRequestsTable.id,
      requesterName: accessRequestsTable.requesterName,
      requesterCompany: accessRequestsTable.requesterCompany,
    })
    .from(accessRequestsTable)
    .where(
      and(
        eq(accessRequestsTable.dealId, dealId),
        eq(accessRequestsTable.requesterUserId, userId),
        eq(accessRequestsTable.status, "nda_signed"),
      ),
    )
    .orderBy(desc(accessRequestsTable.createdAt))
    .limit(1);
  return request ?? null;
}

function loiFacts(
  deal: Deal,
  investorName: string,
  investorCompany: string,
): LoiFacts {
  return {
    dealTitle: deal.title,
    city: deal.city,
    country: deal.country,
    assetClass: deal.assetClass,
    transactionStructure: deal.transactionStructure,
    askingPrice: deal.askingPrice,
    currency: deal.currency,
    brokerName: deal.brokerName,
    brokerCompany: deal.brokerCompany,
    investorName,
    investorCompany,
  };
}

function presentLoi(loi: Loi) {
  const { investorUserId: _hidden, documentText, createdAt: _c, ...rest } = loi;
  return { ...rest, documentText: JSON.parse(documentText) as string[] };
}

async function loadDeal(dealId: number): Promise<Deal | null> {
  const [deal] = await db
    .select()
    .from(dealsTable)
    .where(eq(dealsTable.id, dealId));
  return deal ?? null;
}

// Pre-generated LOI draft, filled with deal facts. NDA-signed investors only.
router.get("/deals/:id/loi-draft", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = GetLoiDraftParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const deal = await loadDeal(params.data.id);
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }
  const nda = await signedNdaRequest(deal.id, req.user.id);
  if (!nda) {
    res
      .status(403)
      .json({ error: "Sign the NDA for this deal before preparing an LOI" });
    return;
  }
  const paragraphs = buildLoiParagraphs(
    loiFacts(deal, nda.requesterName, nda.requesterCompany),
    null,
  );
  res.json(
    GetLoiDraftResponse.parse({
      title: LOI_TITLE,
      paragraphs,
      currency: deal.currency,
      askingPrice: deal.askingPrice,
      defaults: LOI_DEFAULTS,
    }),
  );
});

// Submit an LOI: the rendered text is stored verbatim at submission time.
router.post("/deals/:id/lois", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = SubmitLoiParams.safeParse(req.params);
  const body = SubmitLoiBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({
      error: params.success ? body.error?.message : params.error.message,
    });
    return;
  }
  const deal = await loadDeal(params.data.id);
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }
  const nda = await signedNdaRequest(deal.id, req.user.id);
  if (!nda) {
    res
      .status(403)
      .json({ error: "Sign the NDA for this deal before submitting an LOI" });
    return;
  }
  const [open] = await db
    .select({ id: loisTable.id })
    .from(loisTable)
    .where(
      and(
        eq(loisTable.dealId, deal.id),
        eq(loisTable.investorUserId, req.user.id),
        inArray(loisTable.status, ["submitted", "under_review", "accepted"]),
      ),
    )
    .limit(1);
  if (open) {
    res.status(409).json({ error: "You already have an open LOI for this deal" });
    return;
  }

  const paragraphs = buildLoiParagraphs(
    loiFacts(deal, nda.requesterName, nda.requesterCompany),
    {
      offerPrice: body.data.offerPrice,
      conditions: body.data.conditions?.trim() || null,
      exclusivityDays: body.data.exclusivityDays,
      validityDays: body.data.validityDays,
    },
  );

  // The partial unique index (lois_open_per_investor_idx) enforces "one open
  // LOI per investor per deal" even under concurrent submissions; a race
  // surfaces here as a unique violation which we map to 409.
  let loi: Loi;
  try {
    [loi] = await db
      .insert(loisTable)
      .values({
      dealId: deal.id,
      accessRequestId: nda.id,
      investorUserId: req.user.id,
      investorName: nda.requesterName,
      investorCompany: nda.requesterCompany,
      documentText: JSON.stringify(paragraphs),
      offerPrice: body.data.offerPrice,
      currency: deal.currency,
      conditions: body.data.conditions?.trim() || null,
      exclusivityDays: body.data.exclusivityDays,
      validityDays: body.data.validityDays,
        status: "submitted",
      })
      .returning();
  } catch (err) {
    if (
      err instanceof Error &&
      /lois_open_per_investor_idx|duplicate key/.test(
        `${err.message} ${(err as { cause?: Error }).cause?.message ?? ""}`,
      )
    ) {
      res
        .status(409)
        .json({ error: "You already have an open LOI for this deal" });
      return;
    }
    throw err;
  }

  await db.insert(activityTable).values({
    type: "loi_submitted",
    description: `${loi.investorName} submitted a Letter of Intent for ${deal.title}`,
  });
  if (deal.brokerUserId) {
    await db.insert(notificationsTable).values({
      userId: deal.brokerUserId,
      type: "loi_submitted",
      message: `${loi.investorName} (${loi.investorCompany}) submitted a Letter of Intent for ${deal.title}.`,
      dealId: deal.id,
      accessRequestId: nda.id,
    });
  }

  res.status(201).json(SubmitLoiResponse.parse(toJson(presentLoi(loi))));
});

// LOIs for a deal: manager sees all, an investor sees only their own.
router.get("/deals/:id/lois", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = ListDealLoisParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const deal = await loadDeal(params.data.id);
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }
  const canManage = isDealManager(req, deal);
  const lois = await db
    .select()
    .from(loisTable)
    .where(
      canManage
        ? eq(loisTable.dealId, deal.id)
        : and(
            eq(loisTable.dealId, deal.id),
            eq(loisTable.investorUserId, req.user.id),
          ),
    )
    .orderBy(desc(loisTable.submittedAt));
  res.json(
    ListDealLoisResponse.parse(
      toJson({ lois: lois.map(presentLoi), canManage }),
    ),
  );
});

const LOI_TRANSITIONS: Record<string, string[]> = {
  submitted: ["under_review", "accepted", "rejected"],
  under_review: ["accepted", "rejected"],
  accepted: [],
  rejected: [],
};

// Manager-only status transitions.
router.patch("/lois/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = UpdateLoiStatusParams.safeParse(req.params);
  const body = UpdateLoiStatusBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({
      error: params.success ? body.error?.message : params.error.message,
    });
    return;
  }
  const [loi] = await db
    .select()
    .from(loisTable)
    .where(eq(loisTable.id, params.data.id));
  if (!loi) {
    res.status(404).json({ error: "LOI not found" });
    return;
  }
  const deal = await loadDeal(loi.dealId);
  if (!deal || !isDealManager(req, deal)) {
    res.status(403).json({ error: "Only the deal manager can review LOIs" });
    return;
  }
  if (!LOI_TRANSITIONS[loi.status]?.includes(body.data.status)) {
    res.status(409).json({
      error: `Cannot move an LOI from ${loi.status} to ${body.data.status}`,
    });
    return;
  }
  const decided = body.data.status === "accepted" || body.data.status === "rejected";
  // Conditional update: transition only from the status we validated against,
  // so a concurrent decision can never be overwritten from stale state.
  const [updated] = await db
    .update(loisTable)
    .set({ status: body.data.status, decidedAt: decided ? new Date() : null })
    .where(and(eq(loisTable.id, loi.id), eq(loisTable.status, loi.status)))
    .returning();
  if (!updated) {
    res.status(409).json({
      error: "This LOI was updated by someone else — reload and try again",
    });
    return;
  }

  const statusLabel = body.data.status.replace(/_/g, " ");
  await db.insert(activityTable).values({
    type: "loi_status",
    description: `LOI from ${loi.investorName} for ${deal.title} marked ${statusLabel}`,
  });
  await db.insert(notificationsTable).values({
    userId: loi.investorUserId,
    type: "loi_status",
    message: `Your Letter of Intent for ${deal.title} is now ${statusLabel}.`,
    dealId: deal.id,
    accessRequestId: loi.accessRequestId,
  });

  res.json(UpdateLoiStatusResponse.parse(toJson(presentLoi(updated))));
});

// Printable/downloadable record of a submitted LOI (self-contained HTML,
// mirroring the signed-NDA record). Investor who submitted it or the deal
// manager only.
router.get("/lois/:id/record", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid LOI id" });
    return;
  }
  const [loi] = await db.select().from(loisTable).where(eq(loisTable.id, id));
  if (!loi) {
    res.status(404).json({ error: "LOI not found" });
    return;
  }
  const deal = await loadDeal(loi.dealId);
  const isSubmitter = loi.investorUserId === req.user.id;
  if (!isSubmitter && !(deal && isDealManager(req, deal))) {
    res.status(403).json({
      error: "Only the submitting investor or deal manager can view this record",
    });
    return;
  }

  const paragraphs = JSON.parse(loi.documentText) as string[];
  const submittedAtUtc = loi.submittedAt
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d+Z$/, " UTC");
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(LOI_TITLE)} — ${esc(deal?.title ?? "Deal")}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; max-width: 720px; margin: 48px auto; padding: 0 24px; line-height: 1.6; }
  h1 { font-size: 22px; letter-spacing: 0.04em; text-transform: uppercase; border-bottom: 2px solid #1a1a1a; padding-bottom: 12px; }
  .meta { font-size: 13px; color: #555; margin-bottom: 32px; }
  .meta div { margin: 2px 0; }
  p { margin: 14px 0; font-size: 15px; }
  .status { display: inline-block; padding: 2px 10px; border: 1px solid #888; border-radius: 999px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
  footer { margin-top: 40px; font-size: 12px; color: #777; border-top: 1px solid #ccc; padding-top: 12px; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
<h1>${esc(LOI_TITLE)}</h1>
<div class="meta">
  <div><strong>Property:</strong> ${esc(deal?.title ?? `Deal #${loi.dealId}`)}</div>
  <div><strong>Prospective purchaser:</strong> ${esc(loi.investorName)}, ${esc(loi.investorCompany)}</div>
  <div><strong>Submitted:</strong> ${esc(submittedAtUtc)}</div>
  <div><strong>Status:</strong> <span class="status">${esc(loi.status.replace(/_/g, " "))}</span></div>
</div>
${paragraphs.map((p) => `<p>${esc(p)}</p>`).join("\n")}
<footer>LOI record #${loi.id} — the text above is preserved verbatim as submitted via Closa.</footer>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (req.query.download === "1") {
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="loi-record-${loi.id}.html"`,
    );
  }
  res.send(html);
});

export default router;
