import { toJson } from "../lib/serialize";
import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import {
  db,
  dealsTable,
  dealDocumentsTable,
  accessRequestsTable,
  activityTable,
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

router.get("/deals", async (req, res): Promise<void> => {
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

  res.json(ListDealsResponse.parse(toJson(deals)));
});

router.post("/deals", async (req, res): Promise<void> => {
  const parsed = CreateDealBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [deal] = await db.insert(dealsTable).values(parsed.data).returning();
  await db.insert(activityTable).values({
    type: "deal_listed",
    description: `New listing: ${deal.title} (${deal.city}, ${deal.country})`,
  });

  res.status(201).json(CreateDealResponse.parse(toJson(deal)));
});

router.get("/deals/:id", async (req, res): Promise<void> => {
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

  res.json(GetDealResponse.parse(toJson(deal)));
});

router.patch("/deals/:id/save", async (req, res): Promise<void> => {
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

  res.json(ToggleSaveDealResponse.parse(toJson(deal)));
});

router.get("/deals/:id/documents", async (req, res): Promise<void> => {
  const params = ListDealDocumentsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const docs = await db
    .select()
    .from(dealDocumentsTable)
    .where(eq(dealDocumentsTable.dealId, params.data.id))
    .orderBy(dealDocumentsTable.id);

  res.json(ListDealDocumentsResponse.parse(toJson(docs)));
});

router.post("/deals/:id/access-requests", async (req, res): Promise<void> => {
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

  const [request] = await db
    .insert(accessRequestsTable)
    .values({
      dealId: deal.id,
      dealTitle: deal.title,
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

  res.status(201).json(RequestDealAccessResponse.parse(toJson(request)));
});

export default router;
