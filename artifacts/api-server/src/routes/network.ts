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
import { and, desc, eq } from "drizzle-orm";
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
  ListBrokerDealsParams,
  ListBrokerDealsResponse,
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
  // The legacy broker directory shows sell-side brokers only; other
  // professional categories live under /professionals.
  const brokers = await db
    .select()
    .from(brokersTable)
    .where(eq(brokersTable.category, "brokers"))
    .orderBy(desc(brokersTable.score));
  res.json(ListBrokersResponse.parse(toJson(brokers)));
});

router.get("/brokers/me", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (req.user.role !== "broker") {
    res.status(403).json({ error: "Only brokers have a directory profile" });
    return;
  }

  const [profile] = await db
    .select()
    .from(brokersTable)
    .where(eq(brokersTable.userId, req.user.id));

  res.json(GetMyBrokerProfileResponse.parse({ profile: profile ? toJson(profile) : null }));
});

router.put("/brokers/me", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (req.user.role !== "broker") {
    res.status(403).json({ error: "Only brokers have a directory profile" });
    return;
  }

  const parsed = UpsertMyBrokerProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const values = {
    userId: req.user.id,
    isDemo: false,
    name: parsed.data.name,
    company: parsed.data.company,
    title: parsed.data.title,
    city: parsed.data.city,
    country: parsed.data.country,
    yearsExperience: parsed.data.yearsExperience ?? 0,
    specialisations: parsed.data.specialisations ?? [],
    bio: parsed.data.bio ?? null,
    avatarUrl: parsed.data.avatarUrl ?? null,
  };

  const [profile] = await db
    .insert(brokersTable)
    .values(values)
    .onConflictDoUpdate({
      target: brokersTable.userId,
      set: values,
    })
    .returning();

  res.json(UpsertMyBrokerProfileResponse.parse(toJson(profile)));
});

router.get("/brokers/:id", async (req, res): Promise<void> => {
  const params = UpdateMandateStatusParams.safeParse(req.params);
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

router.get("/brokers/:id/deals", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = UpdateMandateStatusParams.safeParse(req.params);
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

  // Listings are associated to the directory profile via brokerId (the
  // displayed broker), independent of which account manages them.
  // Only live listings are shown on the public profile.
  const deals = await db
    .select()
    .from(dealsTable)
    .where(
      and(
        eq(dealsTable.brokerId, broker.id),
        eq(dealsTable.status, "active"),
      ),
    )
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

  res.json(ListBrokerDealsResponse.parse(toJson(presented)));
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
  const params = UpdateMandateStatusParams.safeParse(req.params);
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
