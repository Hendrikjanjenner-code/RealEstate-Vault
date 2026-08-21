import { toJson } from "../lib/serialize";
import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import {
  db,
  dealsTable,
  dealDocumentsTable,
  accessRequestsTable,
  activityTable,
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
} from "@workspace/api-zod";

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
 * Resolve the viewer's access status for a set of deals in one query.
 * "granted" = non-confidential, owned by the viewer, or NDA signed.
 */
async function getAccessStatuses(
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

/**
 * Strip confidential fields from a deal the viewer has no NDA-signed access
 * to: title, exact location, description, and financials are withheld
 * server-side.
 */
function presentDeal(deal: Deal, accessStatus: AccessStatus) {
  if (accessStatus === "granted") {
    return { ...deal, accessStatus };
  }
  return {
    ...deal,
    accessStatus,
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
  if (savedOnly) conditions.push(eq(dealsTable.saved, true));
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

  const statuses = await getAccessStatuses(deals, req.user.id);
  const presented = deals.map((deal) =>
    presentDeal(deal, statuses.get(deal.id) ?? "none"),
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

  const brokerName =
    [req.user.firstName, req.user.lastName].filter(Boolean).join(" ") ||
    req.user.email ||
    "Broker";

  const [deal] = await db
    .insert(dealsTable)
    .values({
      ...parsed.data,
      brokerUserId: req.user.id,
      brokerName,
    })
    .returning();
  await db.insert(activityTable).values({
    type: "deal_listed",
    description: `New listing: ${deal.title} (${deal.city}, ${deal.country})`,
  });

  res.status(201).json(CreateDealResponse.parse(toJson(deal)));
});

router.get("/deals/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = GetDealParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deal] = await db
    .update(dealsTable)
    .set({ views: sql`${dealsTable.views} + 1` })
    .where(eq(dealsTable.id, params.data.id))
    .returning();

  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }

  const statuses = await getAccessStatuses([deal], req.user.id);
  res.json(
    GetDealResponse.parse(
      toJson(presentDeal(deal, statuses.get(deal.id) ?? "none")),
    ),
  );
});

router.patch("/deals/:id/save", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = ToggleSaveDealParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deal] = await db
    .update(dealsTable)
    .set({ saved: sql`NOT ${dealsTable.saved}` })
    .where(eq(dealsTable.id, params.data.id))
    .returning();

  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }

  const statuses = await getAccessStatuses([deal], req.user.id);
  res.json(
    ToggleSaveDealResponse.parse(
      toJson(presentDeal(deal, statuses.get(deal.id) ?? "none")),
    ),
  );
});

router.get("/deals/:id/documents", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = ListDealDocumentsParams.safeParse(req.params);
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

  res.json(ListDealDocumentsResponse.parse(toJson(visible)));
});

router.post("/deals/:id/access-requests", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
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

  if (isOwner(deal, req.user.id)) {
    res.status(400).json({ error: "You already own this listing" });
    return;
  }

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

  const [request] = await db
    .insert(accessRequestsTable)
    .values({
      dealId: deal.id,
      dealTitle: deal.title,
      requesterUserId: req.user.id,
      requesterName: body.data.requesterName,
      requesterCompany: body.data.requesterCompany,
      message: body.data.message,
      status: "pending",
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

  // Don't echo the confidential title back to a requester who isn't granted.
  const presented = deal.confidential
    ? { ...request, dealTitle: `Confidential ${deal.assetClass} Opportunity` }
    : request;
  res.status(201).json(RequestDealAccessResponse.parse(toJson(presented)));
});

export default router;
