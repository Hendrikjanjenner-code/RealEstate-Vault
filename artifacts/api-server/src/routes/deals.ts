import { randomUUID } from "crypto";
import { Readable } from "stream";
import { toJson } from "../lib/serialize";
import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import {
  db,
  brokersTable,
  dealsTable,
  dealDocumentsTable,
  accessRequestsTable,
  activityTable,
  notificationsTable,
  savedDealsTable,
  type Deal,
} from "@workspace/db";
import {
  ListDealsQueryParams,
  ListDealsResponse,
  CreateDealBody,
  CreateDealResponse,
  GetDealParams,
  GetDealResponse,
  ToggleSaveDealParams,
  ToggleSaveDealResponse,
  ListDealDocumentsParams,
  ListDealDocumentsResponse,
  RequestDealAccessParams,
  RequestDealAccessBody,
  RequestDealAccessResponse,
  CreateDealDocumentParams,
  CreateDealDocumentBody,
  CreateDealDocumentResponse,
  UpdateDealDocumentParams,
  UpdateDealDocumentBody,
  UpdateDealDocumentResponse,
  DeleteDealDocumentParams,
  DeleteDealDocumentResponse,
  DownloadDealDocumentParams,
} from "@workspace/api-zod";
import { isBroker } from "../lib/brokerAuth";
import {
  ObjectStorageService,
  ObjectNotFoundError,
} from "../lib/objectStorage";

const objectStorageService = new ObjectStorageService();

const router: IRouter = Router();

type AccessStatus =
  | "granted"
  | "pending"
  | "approved"
  | "nda_sent"
  | "rejected"
  | "none";

function isOwner(deal: Deal, userId: string): boolean {
  return deal.brokerUserId != null && deal.brokerUserId === userId;
}

/**
 * Public shape of a data room document: storage internals (objectPath,
 * contentType) are never exposed; clients only see whether a file exists.
 */
function toPublicDocument<
  T extends { objectPath: string | null; contentType: string | null },
>(doc: T) {
  const { objectPath, contentType: _ct, ...rest } = doc;
  return { ...rest, hasFile: !!objectPath };
}

/** Any broker credential: passcode session OR authenticated user with the broker role. */
function hasBrokerCredential(req: Parameters<typeof isBroker>[0]): boolean {
  return isBroker(req) || (req.isAuthenticated() && req.user.role === "broker");
}

/**
 * Ownership gate for broker mutations on a deal's data room.
 * Deals owned by an identified broker may only be mutated by that
 * authenticated broker. Unowned (seeded/demo) deals may be managed by any
 * broker session, including the shared-passcode session which carries no
 * user identity.
 */
function canManageDealDocuments(
  req: Parameters<typeof isBroker>[0],
  deal: Deal,
): boolean {
  if (deal.brokerUserId != null) {
    return req.isAuthenticated() && req.user.id === deal.brokerUserId;
  }
  return hasBrokerCredential(req);
}

/**
 * Resolve the viewer's access status for a set of deals in one query.
 * "granted" = non-confidential, owned by the viewer, or NDA signed.
 */
export async function getAccessStatuses(
  deals: Deal[],
  userId: string,
): Promise<Map<number, AccessStatus>> {
  const statuses = new Map<number, AccessStatus>();
  const needLookup: number[] = [];

  for (const deal of deals) {
    if (!deal.confidential || isOwner(deal, userId)) {
      statuses.set(deal.id, "granted");
    } else {
      statuses.set(deal.id, "none");
      needLookup.push(deal.id);
    }
  }

  if (needLookup.length > 0) {
    const requests = await db
      .select()
      .from(accessRequestsTable)
      .where(
        and(
          inArray(accessRequestsTable.dealId, needLookup),
          eq(accessRequestsTable.requesterUserId, userId),
        ),
      )
      .orderBy(desc(accessRequestsTable.createdAt));

    for (const request of requests) {
      // Keep the most relevant status per deal: latest wins unless an
      // nda_signed request exists.
      const existing = statuses.get(request.dealId);
      if (existing === "granted") continue;
      if (request.status === "nda_signed") {
        statuses.set(request.dealId, "granted");
      } else if (existing === "none") {
        statuses.set(request.dealId, request.status as AccessStatus);
      }
    }
  }

  return statuses;
}

/** Deal ids the viewer has saved, out of the given set. */
export async function getSavedDealIds(
  dealIds: number[],
  userId: string,
): Promise<Set<number>> {
  if (dealIds.length === 0) return new Set();
  const rows = await db
    .select({ dealId: savedDealsTable.dealId })
    .from(savedDealsTable)
    .where(
      and(
        eq(savedDealsTable.userId, userId),
        inArray(savedDealsTable.dealId, dealIds),
      ),
    );
  return new Set(rows.map((r) => r.dealId));
}

type DealWithProfile = Deal & { brokerProfileId: number | null };

/**
 * Overlay each deal's denormalized broker fields with the owning broker's
 * real directory profile (linked by auth user id), when one exists. Seeded
 * personas stay as-is for legacy deals without a linked profile.
 */
export async function overlayBrokerProfiles(deals: Deal[]): Promise<DealWithProfile[]> {
  const userIds = [
    ...new Set(deals.map((d) => d.brokerUserId).filter((id): id is string => id != null)),
  ];
  if (userIds.length === 0) {
    return deals.map((d) => ({ ...d, brokerProfileId: null }));
  }
  const profiles = await db
    .select()
    .from(brokersTable)
    .where(inArray(brokersTable.userId, userIds));
  const byUserId = new Map(profiles.map((p) => [p.userId as string, p]));
  return deals.map((deal) => {
    const profile = deal.brokerUserId ? byUserId.get(deal.brokerUserId) : undefined;
    if (!profile) return { ...deal, brokerProfileId: null };
    return {
      ...deal,
      brokerName: profile.name,
      brokerCompany: profile.company,
      brokerProfileId: profile.id,
    };
  });
}

/**
 * Strip confidential fields from a deal the viewer has no NDA-signed access
 * to: title, exact location, description, and financials are withheld
 * server-side.
 */
export function presentDeal(
  deal: Deal & { brokerProfileId?: number | null },
  accessStatus: AccessStatus,
  saved: boolean,
) {
  if (accessStatus === "granted") {
    return { ...deal, accessStatus, saved };
  }
  return {
    ...deal,
    accessStatus,
    saved,
    title: `Confidential ${deal.assetClass} Opportunity`,
    city: deal.region || "Undisclosed",
    description: null,
    askingPrice: null,
    priceMax: null,
    grossYield: null,
    netYield: null,
    occupancyPct: null,
  };
}

router.get("/deals", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const query = ListDealsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const { assetClass, country, dealType, search, savedOnly } = query.data;

  const conditions = [];
  if (assetClass) conditions.push(eq(dealsTable.assetClass, assetClass));
  if (country) conditions.push(eq(dealsTable.country, country));
  if (dealType) conditions.push(eq(dealsTable.dealType, dealType));
  if (savedOnly) {
    conditions.push(
      inArray(
        dealsTable.id,
        db
          .select({ dealId: savedDealsTable.dealId })
          .from(savedDealsTable)
          .where(eq(savedDealsTable.userId, req.user.id)),
      ),
    );
  }
  if (search) {
    conditions.push(
      or(
        ilike(dealsTable.title, `%${search}%`),
        ilike(dealsTable.city, `%${search}%`),
        ilike(dealsTable.teaser, `%${search}%`),
      ),
    );
  }

  const deals = await db
    .select()
    .from(dealsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(dealsTable.createdAt));

  const [statuses, savedIds, withProfiles] = await Promise.all([
    getAccessStatuses(deals, req.user.id),
    getSavedDealIds(
      deals.map((d) => d.id),
      req.user.id,
    ),
    overlayBrokerProfiles(deals),
  ]);
  const presented = withProfiles.map((deal) =>
    presentDeal(deal, statuses.get(deal.id) ?? "none", savedIds.has(deal.id)),
  );

  res.json(ListDealsResponse.parse(toJson(presented)));
});

router.post("/deals", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (req.user.role !== "broker") {
    res.status(403).json({ error: "Only brokers can list deals" });
    return;
  }
  const parsed = CreateDealBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Prefer the broker's directory profile; fall back to their auth account.
  const [profile] = await db
    .select()
    .from(brokersTable)
    .where(eq(brokersTable.userId, req.user.id));
  const brokerName =
    profile?.name ||
    [req.user.firstName, req.user.lastName].filter(Boolean).join(" ") ||
    req.user.email ||
    "Broker";

  const [deal] = await db
    .insert(dealsTable)
    .values({
      brokerUserId: req.user.id,
      brokerName,
      brokerCompany: profile?.company ?? null,
      ...parsed.data,
    })
    .returning();
  await db.insert(activityTable).values({
    type: "deal_listed",
    description: `New listing: ${deal.title} (${deal.city}, ${deal.country})`,
  });

  const [withProfile] = await overlayBrokerProfiles([deal]);
  res
    .status(201)
    .json(CreateDealResponse.parse(toJson({ ...withProfile, saved: false })));
});

router.get("/deals/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = RequestDealAccessParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deal] = await db
    .select()
    .from(dealsTable)
    .where(eq(dealsTable.id, params.data.id));

  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }

  const [statuses, savedIds, [withProfile]] = await Promise.all([
    getAccessStatuses([deal], req.user.id),
    getSavedDealIds([deal.id], req.user.id),
    overlayBrokerProfiles([deal]),
  ]);
  res.json(
    GetDealResponse.parse(
      toJson(
        presentDeal(
          withProfile,
          statuses.get(deal.id) ?? "none",
          savedIds.has(deal.id),
        ),
      ),
    ),
  );
});

router.patch("/deals/:id/save", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = RequestDealAccessParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deal] = await db
    .select()
    .from(dealsTable)
    .where(eq(dealsTable.id, params.data.id));

  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }

  if (isOwner(deal, req.user.id)) {
    res.status(400).json({ error: "You already own this listing" });
    return;
  }

  const existing = await db
    .select()
    .from(savedDealsTable)
    .where(
      and(
        eq(savedDealsTable.dealId, deal.id),
        eq(savedDealsTable.userId, req.user.id),
      ),
    );

  let saved: boolean;
  if (existing.length > 0) {
    await db
      .delete(savedDealsTable)
      .where(
        and(
          eq(savedDealsTable.userId, req.user.id),
          eq(savedDealsTable.dealId, deal.id),
        ),
      );
    saved = false;
  } else {
    await db
      .insert(savedDealsTable)
      .values({ userId: req.user.id, dealId: deal.id })
      .onConflictDoNothing();
    saved = true;
  }

  const [statuses, [withProfile]] = await Promise.all([
    getAccessStatuses([deal], req.user.id),
    overlayBrokerProfiles([deal]),
  ]);
  res.json(
    ToggleSaveDealResponse.parse(
      toJson(presentDeal(withProfile, statuses.get(deal.id) ?? "none", saved)),
    ),
  );
});

router.get("/deals/:id/documents", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = RequestDealAccessParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deal] = await db
    .select()
    .from(dealsTable)
    .where(eq(dealsTable.id, params.data.id));
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }

  const statuses = await getAccessStatuses([deal], req.user.id);
  const granted = statuses.get(deal.id) === "granted";

  const docs = await db
    .select()
    .from(dealDocumentsTable)
    .where(eq(dealDocumentsTable.dealId, params.data.id))
    .orderBy(dealDocumentsTable.id);

  // NDA-required documents are withheld entirely until access is granted.
  const visible = granted ? docs : docs.filter((doc) => !doc.ndaRequired);

  res.json(ListDealDocumentsResponse.parse(toJson(visible.map(toPublicDocument))));
});

router.post("/deals/:id/access-requests", async (req, res): Promise<void> => {
  // Anonymous investors may request access; no session required.
  const params = RequestDealAccessParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = RequestDealAccessBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [deal] = await db
    .select()
    .from(dealsTable)
    .where(eq(dealsTable.id, params.data.id));

  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }

  // Authenticated owners cannot request access to their own deal.
  if (req.isAuthenticated() && isOwner(deal, req.user.id)) {
    res.status(400).json({ error: "You already own this listing" });
    return;
  }

  // Deduplicate only for authenticated investors who have a session.
  if (req.isAuthenticated()) {
    const existing = await db
      .select()
      .from(accessRequestsTable)
      .where(
        and(
          eq(accessRequestsTable.dealId, deal.id),
          eq(accessRequestsTable.requesterUserId, req.user.id),
        ),
      );
    if (existing.some((r) => r.status !== "rejected")) {
      res
        .status(409)
        .json({ error: "You already have an active request for this deal" });
      return;
    }
  }

  // requestKey lets the investor self-sign the NDA later without a session.
  const requestKey = randomUUID();

  const [request] = await db
    .insert(accessRequestsTable)
    .values({
      dealId: deal.id,
      dealTitle: deal.title,
      requesterUserId: req.isAuthenticated() ? req.user.id : null,
      requesterName: body.data.requesterName,
      requesterCompany: body.data.requesterCompany,
      message: body.data.message,
      status: "pending",
      requestKey,
    })
    .returning();

  await db
    .update(dealsTable)
    .set({ accessRequests: sql`${dealsTable.accessRequests} + 1` })
    .where(eq(dealsTable.id, deal.id));

  await db.insert(activityTable).values({
    type: "access_request",
    description: `${body.data.requesterName} (${body.data.requesterCompany}) requested access to ${deal.title}`,
  });

  // Alert the listing broker that a new access request arrived.
  if (deal.brokerUserId) {
    await db.insert(notificationsTable).values({
      userId: deal.brokerUserId,
      type: "access_request_received",
      message: `${body.data.requesterName} (${body.data.requesterCompany}) requested access to ${deal.title}.`,
      dealId: deal.id,
      accessRequestId: request.id,
    });
  }

  // Don't echo the confidential title back to a requester who isn't granted.
  const presented = deal.confidential
    ? { ...request, dealTitle: `Confidential ${deal.assetClass} Opportunity` }
    : request;
  res.status(201).json(RequestDealAccessResponse.parse(toJson(presented)));
});

// ── Broker: create/upload a document into a deal's data room ─────────────────
const DOWNLOAD_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

router.post("/deals/:id/documents", async (req, res): Promise<void> => {
  if (!hasBrokerCredential(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = CreateDealDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = CreateDealDocumentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [deal] = await db
    .select()
    .from(dealsTable)
    .where(eq(dealsTable.id, params.data.id));
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }

  if (!canManageDealDocuments(req, deal)) {
    res.status(403).json({ error: "You are not the listing broker for this deal" });
    return;
  }

  const [doc] = await db
    .insert(dealDocumentsTable)
    .values({
      dealId: params.data.id,
      name: body.data.name,
      category: body.data.category ?? null,
      sizeKb: body.data.sizeKb ?? null,
      ndaRequired: body.data.ndaRequired ?? false,
      objectPath: body.data.objectPath ?? null,
      contentType: body.data.contentType ?? null,
    })
    .returning();

  res
    .status(201)
    .json(CreateDealDocumentResponse.parse(toJson(toPublicDocument(doc))));
});

// ── Broker: update a document's metadata (name, category, NDA flag) ──────────
router.patch(
  "/deals/:id/documents/:docId",
  async (req, res): Promise<void> => {
    if (!hasBrokerCredential(req)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const params = UpdateDealDocumentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpdateDealDocumentBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const [deal] = await db
      .select()
      .from(dealsTable)
      .where(eq(dealsTable.id, params.data.id));
    if (!deal) {
      res.status(404).json({ error: "Deal not found" });
      return;
    }

    if (!canManageDealDocuments(req, deal)) {
      res
        .status(403)
        .json({ error: "You are not the listing broker for this deal" });
      return;
    }

    const updates: Partial<{
      name: string;
      category: string;
      ndaRequired: boolean;
    }> = {};
    if (body.data.name !== undefined) updates.name = body.data.name;
    if (body.data.category !== undefined) updates.category = body.data.category;
    if (body.data.ndaRequired !== undefined)
      updates.ndaRequired = body.data.ndaRequired;
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const [doc] = await db
      .update(dealDocumentsTable)
      .set(updates)
      .where(
        and(
          eq(dealDocumentsTable.id, params.data.docId),
          eq(dealDocumentsTable.dealId, params.data.id),
        ),
      )
      .returning();
    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    res.json(UpdateDealDocumentResponse.parse(toJson(toPublicDocument(doc))));
  },
);

// ── Broker: delete a document from the data room ─────────────────────────────
router.delete(
  "/deals/:id/documents/:docId",
  async (req, res): Promise<void> => {
    if (!hasBrokerCredential(req)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const params = DeleteDealDocumentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [deal] = await db
      .select()
      .from(dealsTable)
      .where(eq(dealsTable.id, params.data.id));
    if (!deal) {
      res.status(404).json({ error: "Deal not found" });
      return;
    }

    if (!canManageDealDocuments(req, deal)) {
      res
        .status(403)
        .json({ error: "You are not the listing broker for this deal" });
      return;
    }

    const [doc] = await db
      .delete(dealDocumentsTable)
      .where(
        and(
          eq(dealDocumentsTable.id, params.data.docId),
          eq(dealDocumentsTable.dealId, params.data.id),
        ),
      )
      .returning();
    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    res.json(
      DeleteDealDocumentResponse.parse({ error: `Deleted ${doc.name}` }),
    );
  },
);

// ── Investor / broker: download a data-room document ─────────────────────────
router.get(
  "/deals/:id/documents/:docId/download",
  async (req, res): Promise<void> => {
    const params = DownloadDealDocumentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [doc] = await db
      .select()
      .from(dealDocumentsTable)
      .where(
        and(
          eq(dealDocumentsTable.id, params.data.docId),
          eq(dealDocumentsTable.dealId, params.data.id),
        ),
      );
    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    // NDA gate: accept either an unguessable server-issued download token
    // (from the requestKey signing flow) or a session-linked nda_signed request.
    if (doc.ndaRequired) {
      const token = typeof req.query.token === "string" ? req.query.token : "";
      let hasAccess = false;

      if (token) {
        // Token-based access: investor presents the capability token issued at signing.
        const [accessRequest] = await db
          .select()
          .from(accessRequestsTable)
          .where(
            and(
              eq(accessRequestsTable.downloadToken, token),
              eq(accessRequestsTable.dealId, doc.dealId),
            ),
          );
        const signedAt = accessRequest?.ndaSignedAt?.getTime() ?? 0;
        hasAccess =
          !!accessRequest &&
          accessRequest.status === "nda_signed" &&
          Date.now() - signedAt <= DOWNLOAD_TOKEN_TTL_MS;
      } else if (req.isAuthenticated()) {
        // Session-based fallback: authenticated investor with a signed request.
        const [sessionRequest] = await db
          .select()
          .from(accessRequestsTable)
          .where(
            and(
              eq(accessRequestsTable.requesterUserId, req.user.id),
              eq(accessRequestsTable.dealId, doc.dealId),
              eq(accessRequestsTable.status, "nda_signed"),
            ),
          );
        hasAccess = !!sessionRequest;
      }
      // Unauthenticated users with no token → hasAccess stays false → 403 below.

      if (!hasAccess) {
        res.status(403).json({
          error: "This document requires a signed NDA. Request access first.",
        });
        return;
      }
    } else if (!req.isAuthenticated()) {
      // Non-NDA docs still require a basic auth check so anonymous browsers
      // cannot enumerate or download unlocked data room files.
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (!doc.objectPath) {
      res.status(404).json({
        error: "No file is attached to this document yet.",
      });
      return;
    }

    try {
      const objectFile = await objectStorageService.getObjectEntityFile(
        doc.objectPath,
      );
      const response = await objectStorageService.downloadObject(objectFile);

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));
      if (doc.contentType) {
        res.setHeader("Content-Type", doc.contentType);
      }
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${doc.name.replace(/["\\]/g, "")}"`,
      );

      if (response.body) {
        const nodeStream = Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        );
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json({ error: "File not found in storage" });
        return;
      }
      req.log.error({ err: error }, "Error downloading document");
      res.status(500).json({ error: "Failed to download document" });
    }
  },
);

export default router;
