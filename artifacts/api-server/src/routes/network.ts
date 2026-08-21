import { toJson } from "../lib/serialize";
import { dealMatchesMandate } from "../lib/mandateMatching";
import {
  getAccessStatuses,
  getSavedDealIds,
  presentDeal,
} from "./deals";
import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import {
  db,
  brokersTable,
  dealsTable,
  mandatesTable,
  transactionsTable,
  activityTable,
} from "@workspace/db";
import {
  ListBrokersResponse,
  GetBrokerParams,
  GetBrokerResponse,
  ListMandatesResponse,
  ListMandateMatchesParams,
  ListMandateMatchesResponse,
  CreateMandateBody,
  CreateMandateResponse,
  ListTransactionsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/brokers", async (_req, res): Promise<void> => {
  const brokers = await db
    .select()
    .from(brokersTable)
    .orderBy(desc(brokersTable.score));

  res.json(ListBrokersResponse.parse(toJson(brokers)));
});

router.get("/brokers/:id", async (req, res): Promise<void> => {
  const params = GetBrokerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [broker] = await db
    .select()
    .from(brokersTable)
    .where(eq(brokersTable.id, params.data.id));

  if (!broker) {
    res.status(404).json({ error: "Broker not found" });
    return;
  }

  res.json(GetBrokerResponse.parse(toJson(broker)));
});

router.get("/mandates", async (_req, res): Promise<void> => {
  const [mandates, deals] = await Promise.all([
    db.select().from(mandatesTable).orderBy(desc(mandatesTable.createdAt)),
    db.select().from(dealsTable),
  ]);

  // Compute the matches count live so it always reflects the same logic
  // as the /mandates/:id/matches endpoint.
  const withMatches = mandates.map((mandate) => ({
    ...mandate,
    matches: deals.filter((deal) => dealMatchesMandate(deal, mandate)).length,
  }));

  res.json(ListMandatesResponse.parse(toJson(withMatches)));
});

router.get("/mandates/:id/matches", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = ListMandateMatchesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [mandate] = await db
    .select()
    .from(mandatesTable)
    .where(eq(mandatesTable.id, params.data.id));

  if (!mandate) {
    res.status(404).json({ error: "Mandate not found" });
    return;
  }

  const allDeals = await db
    .select()
    .from(dealsTable)
    .orderBy(desc(dealsTable.createdAt));
  const matching = allDeals.filter((deal) => dealMatchesMandate(deal, mandate));

  const [statuses, savedIds] = await Promise.all([
    getAccessStatuses(matching, req.user.id),
    getSavedDealIds(
      matching.map((d) => d.id),
      req.user.id,
    ),
  ]);
  const presented = matching.map((deal) =>
    presentDeal(deal, statuses.get(deal.id) ?? "none", savedIds.has(deal.id)),
  );

  res.json(ListMandateMatchesResponse.parse(toJson(presented)));
});

router.post("/mandates", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (req.user.role !== "investor") {
    res.status(403).json({ error: "Only investors can create mandates" });
    return;
  }

  const parsed = CreateMandateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [mandate] = await db
    .insert(mandatesTable)
    .values({ ...parsed.data, status: "active", matches: 0 })
    .returning();

  await db.insert(activityTable).values({
    type: "mandate_created",
    description: `New mandate: ${mandate.title} (${mandate.investorName})`,
  });

  res.status(201).json(CreateMandateResponse.parse(toJson(mandate)));
});

router.get("/transactions", async (_req, res): Promise<void> => {
  const transactions = await db
    .select()
    .from(transactionsTable)
    .orderBy(desc(transactionsTable.closedAt));

  res.json(ListTransactionsResponse.parse(toJson(transactions)));
});

export default router;
