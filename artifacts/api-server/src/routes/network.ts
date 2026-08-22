import { toJson } from "../lib/serialize";
import { coerceMandateStatus } from "../lib/legacyData";
import { dealMatchesMandate, sortByYieldFit } from "../lib/mandateMatching";
import {
  getAccessStatuses,
  getSavedDealIds,
  overlayBrokerProfiles,
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
  GetMyBrokerProfileResponse,
  UpsertMyBrokerProfileBody,
  UpsertMyBrokerProfileResponse,
  ListMandatesResponse,
  ListMandateMatchesParams,
  ListMandateMatchesResponse,
  CreateMandateBody,
  CreateMandateResponse,
  UpdateMandateStatusParams,
  UpdateMandateStatusBody,
  UpdateMandateStatusResponse,
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

router.get("/mandates", async (req, res): Promise<void> => {
  const [mandates, deals] = await Promise.all([
    db.select().from(mandatesTable).orderBy(desc(mandatesTable.createdAt)),
    db.select().from(dealsTable),
  ]);

  const viewerId = req.isAuthenticated() ? req.user.id : null;

  // Compute the matches count live so it always reflects the same logic
  // as the /mandates/:id/matches endpoint.
  const withMatches = mandates.map(({ ownerUserId, ...mandate }) => ({
    ...mandate,
    // Legacy rows (pre-enum, e.g. "fulfilled") are treated as closed.
    status: coerceMandateStatus(mandate.status),
    matches: deals.filter((deal) => dealMatchesMandate(deal, mandate)).length,
    isOwn: viewerId != null && ownerUserId === viewerId,
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
    .where(eq(mandatesTable.id, params.data.id))
    .then((rows) => rows);

  if (!mandate) {
    res.status(404).json({ error: "Mandate not found" });
    return;
  }

  const allDeals = await db
    .select()
    .from(dealsTable)
    .orderBy(desc(dealsTable.createdAt));
  const matching = sortByYieldFit(
    allDeals.filter((deal) => dealMatchesMandate(deal, mandate)),
    mandate,
  );

  const [statuses, savedIds, withProfiles] = await Promise.all([
    getAccessStatuses(matching, req.user.id),
    getSavedDealIds(
      matching.map((d) => d.id),
      req.user.id,
    ),
    overlayBrokerProfiles(matching),
  ]);
  const presented = withProfiles.map((deal) =>
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
    .values({
      ...parsed.data,
      ownerUserId: req.user.id,
      status: "active",
      matches: 0,
    })
    .returning();

  await db.insert(activityTable).values({
    type: "mandate_created",
    description: `New mandate: ${mandate.title} (${mandate.investorName})`,
  });

  res.status(201).json(
    CreateMandateResponse.parse(toJson({ ...mandate, isOwn: true })),
  );
});

router.patch("/mandates/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = UpdateMandateStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateMandateStatusBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(mandatesTable)
    .where(eq(mandatesTable.id, params.data.id));

  if (!existing) {
    res.status(404).json({ error: "Mandate not found" });
    return;
  }
  if (existing.ownerUserId == null || existing.ownerUserId !== req.user.id) {
    res.status(403).json({ error: "Only the mandate owner can change its status" });
    return;
  }

  const [updated] = await db
    .update(mandatesTable)
    .set({ status: body.data.status })
    .where(eq(mandatesTable.id, params.data.id))
    .returning();

  res.json(
    UpdateMandateStatusResponse.parse(toJson({ ...updated, isOwn: true })),
  );
});

router.get("/transactions", async (_req, res): Promise<void> => {
  const transactions = await db
    .select()
    .from(transactionsTable)
    .orderBy(desc(transactionsTable.closedAt));

  res.json(ListTransactionsResponse.parse(toJson(transactions)));
});

export default router;
