import { toJson } from "../lib/serialize";
import { Router, type IRouter } from "express";
import { desc, eq, and, inArray } from "drizzle-orm";
import {
  db,
  brokersTable,
  brokerConnectionsTable,
  professionalReviewsTable,
  usersTable,
  type Broker,
  type ProfessionalReview,
} from "@workspace/db";
import {
  ListProfessionalsResponse,
  ListProfessionalCategoriesResponse,
  ListProfessionalReviewsParams,
  ListProfessionalReviewsResponse,
  CreateProfessionalReviewBody,
  CreateProfessionalReviewResponse,
  GetProfessionalTrustParams,
  GetProfessionalTrustResponse,
} from "@workspace/api-zod";
import { computeTrustReport, computeTrustReports } from "../lib/trustScore";

const router: IRouter = Router();

// Canonical professional categories. Served via /professionals/categories so
// frontends never hardcode this list.
export const PROFESSIONAL_CATEGORIES: ReadonlyArray<{ id: string; label: string }> = [
  { id: "brokers", label: "Brokers" },
  { id: "acquisition_brokers", label: "Acquisition Brokers" },
  { id: "legal_advisors", label: "Legal Advisors" },
  { id: "tax_advisors", label: "Tax Advisors" },
  { id: "financing_advisors", label: "Financing Advisors" },
  { id: "valuers", label: "Valuers" },
  { id: "technical_dd", label: "Technical Due Diligence" },
  { id: "commercial_dd", label: "Commercial Due Diligence" },
  { id: "notaries", label: "Notaries" },
  { id: "asset_managers", label: "Asset Managers" },
  { id: "other_specialists", label: "Other Specialists" },
];

const VERIFICATION_TIER_WEIGHT: Record<string, number> = {
  unverified: 0,
  verification_pending: 0,
  verified_professional: 1,
  verified_firm: 1,
  specialist_verified: 1.5,
};

export type ReviewAggregate = { avgRating: number | null; reviewCount: number };

// A review counts (for serving and for ranking) only when its verification
// can be trusted: 'connection' reviews must reference an ACCEPTED connection
// whose owner is the reviewer (validated against the connections table at
// aggregation time, not just the stored flag); 'seeded' editorial reviews are
// only honoured on demo profiles, never on real accounts. On real profiles,
// connection reviews written by demo accounts are ignored as well.
function isServableReview(
  review: ProfessionalReview,
  professional: Pick<Broker, "isDemo">,
  connectionsById: Map<number, { ownerUserId: string; status: string; brokerId: number }>,
  demoUserIds: Set<string>,
): boolean {
  if (!review.verifiedEngagement) return false;
  if (review.source === "connection") {
    if (review.connectionId == null || review.reviewerUserId == null) return false;
    const connection = connectionsById.get(review.connectionId);
    if (
      !connection ||
      connection.status !== "accepted" ||
      connection.ownerUserId !== review.reviewerUserId ||
      connection.brokerId !== review.professionalId
    ) {
      return false;
    }
    if (!professional.isDemo && demoUserIds.has(review.reviewerUserId)) return false;
    return true;
  }
  return review.source === "seeded" && professional.isDemo;
}

// Batched provenance lookup used to validate 'connection' reviews against the
// actual connections table and to identify demo reviewers.
async function getReviewProvenance(reviews: ProfessionalReview[]): Promise<{
  connectionsById: Map<number, { ownerUserId: string; status: string; brokerId: number }>;
  demoUserIds: Set<string>;
}> {
  const connectionIds = [
    ...new Set(
      reviews.map((r) => r.connectionId).filter((id): id is number => id != null),
    ),
  ];
  const reviewerIds = [
    ...new Set(
      reviews.map((r) => r.reviewerUserId).filter((id): id is string => id != null),
    ),
  ];
  const [connections, demoReviewers] = await Promise.all([
    connectionIds.length
      ? db
          .select({
            id: brokerConnectionsTable.id,
            ownerUserId: brokerConnectionsTable.ownerUserId,
            status: brokerConnectionsTable.status,
            brokerId: brokerConnectionsTable.brokerId,
          })
          .from(brokerConnectionsTable)
          .where(inArray(brokerConnectionsTable.id, connectionIds))
      : Promise.resolve([]),
    reviewerIds.length
      ? db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(and(inArray(usersTable.id, reviewerIds), eq(usersTable.isDemo, true)))
      : Promise.resolve([]),
  ]);
  return {
    connectionsById: new Map(connections.map((c) => [c.id, c])),
    demoUserIds: new Set(demoReviewers.map((u) => u.id)),
  };
}

export async function getReviewAggregates(
  professionals: Pick<Broker, "id" | "isDemo">[],
): Promise<Map<number, ReviewAggregate>> {
  const aggregates = new Map<number, ReviewAggregate>();
  if (professionals.length === 0) return aggregates;
  const byId = new Map(professionals.map((p) => [p.id, p]));
  const reviews = await db
    .select()
    .from(professionalReviewsTable)
    .where(eq(professionalReviewsTable.verifiedEngagement, true));

  const { connectionsById, demoUserIds } = await getReviewProvenance(reviews);

  const grouped = new Map<number, ProfessionalReview[]>();
  for (const review of reviews) {
    const professional = byId.get(review.professionalId);
    if (
      !professional ||
      !isServableReview(review, professional, connectionsById, demoUserIds)
    ) {
      continue;
    }
    const list = grouped.get(review.professionalId) ?? [];
    list.push(review);
    grouped.set(review.professionalId, list);
  }
  for (const [id, list] of grouped) {
    const avg =
      list.reduce((sum, r) => sum + r.ratingOverall, 0) / list.length;
    aggregates.set(id, {
      avgRating: Math.round(avg * 10) / 10,
      reviewCount: list.length,
    });
  }
  return aggregates;
}

export function presentProfessional(
  professional: Broker,
  aggregate: ReviewAggregate | undefined,
) {
  return {
    ...professional,
    avgRating: aggregate?.avgRating ?? null,
    reviewCount: aggregate?.reviewCount ?? 0,
  };
}

// Ranking deliberately blends reputation score, verification tier and review
// quality. Transaction volume is NOT a ranking input on its own — a large
// closed volume must never outrank verified quality.
function rankScore(p: Broker, aggregate: ReviewAggregate | undefined): number {
  const tier = VERIFICATION_TIER_WEIGHT[p.verificationStatus] ?? 0;
  const reviewSignal =
    aggregate?.avgRating != null
      ? aggregate.avgRating * Math.min(1, aggregate.reviewCount / 3)
      : 0;
  return p.score + tier + reviewSignal * 0.3;
}

router.get("/professionals", async (req, res): Promise<void> => {
  const category =
    typeof req.query.category === "string" && req.query.category.length > 0
      ? req.query.category
      : null;
  const country =
    typeof req.query.country === "string" && req.query.country.length > 0
      ? req.query.country
      : null;
  const q =
    typeof req.query.q === "string" && req.query.q.trim().length > 0
      ? req.query.q.trim().toLowerCase()
      : null;

  const professionals = await db
    .select()
    .from(brokersTable)
    .where(category ? and(eq(brokersTable.category, category)) : undefined)
    .orderBy(desc(brokersTable.score));

  const filtered = professionals.filter((p) => {
    if (
      country &&
      p.country !== country &&
      !p.countries.includes(country)
    ) {
      return false;
    }
    if (q) {
      const haystack = `${p.name} ${p.company} ${p.city}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const [aggregates, trustReports] = await Promise.all([
    getReviewAggregates(filtered),
    computeTrustReports(filtered),
  ]);
  const ranked = filtered
    .map((p) => ({ p, aggregate: aggregates.get(p.id) }))
    .sort(
      (a, b) => rankScore(b.p, b.aggregate) - rankScore(a.p, a.aggregate),
    )
    .map(({ p, aggregate }) => ({
      ...presentProfessional(p, aggregate),
      trustScore: trustReports.get(p.id)?.score ?? null,
      trustTier: trustReports.get(p.id)?.tier ?? null,
    }));

  res.json(ListProfessionalsResponse.parse(toJson(ranked)));
});

router.get("/professionals/:id/trust", async (req, res): Promise<void> => {
  const params = GetProfessionalTrustParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const report = await computeTrustReport(params.data.id);
  if (!report) {
    res.status(404).json({ error: "Professional not found" });
    return;
  }
  res.json(GetProfessionalTrustResponse.parse(toJson(report)));
});

router.get("/professionals/categories", async (_req, res): Promise<void> => {
  const professionals = await db
    .select({ category: brokersTable.category })
    .from(brokersTable);
  const counts = new Map<string, number>();
  for (const { category } of professionals) {
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const categories = PROFESSIONAL_CATEGORIES.map((c) => ({
    ...c,
    count: counts.get(c.id) ?? 0,
  }));
  res.json(ListProfessionalCategoriesResponse.parse(categories));
});

router.get("/professionals/:id/reviews", async (req, res): Promise<void> => {
  const params = ListProfessionalReviewsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [professional] = await db
    .select()
    .from(brokersTable)
    .where(eq(brokersTable.id, params.data.id));
  if (!professional) {
    res.status(404).json({ error: "Professional not found" });
    return;
  }

  // Only reviews whose verification can be trusted are ever served.
  const allReviews = await db
    .select()
    .from(professionalReviewsTable)
    .where(
      and(
        eq(professionalReviewsTable.professionalId, params.data.id),
        eq(professionalReviewsTable.verifiedEngagement, true),
      ),
    )
    .orderBy(desc(professionalReviewsTable.createdAt));
  const { connectionsById, demoUserIds } = await getReviewProvenance(allReviews);
  const reviews = allReviews.filter((review) =>
    isServableReview(review, professional, connectionsById, demoUserIds),
  );

  res.json(ListProfessionalReviewsResponse.parse(toJson(reviews)));
});

router.post("/professionals/:id/reviews", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = ListProfessionalReviewsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = CreateProfessionalReviewBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [professional] = await db
    .select()
    .from(brokersTable)
    .where(eq(brokersTable.id, params.data.id));
  if (!professional) {
    res.status(404).json({ error: "Professional not found" });
    return;
  }

  // Eligibility is derived server-side: the reviewer must have an ACCEPTED
  // connection with this professional. The client can never assert
  // verification. (Deal Team engagements extend this rule later.)
  const [connection] = await db
    .select()
    .from(brokerConnectionsTable)
    .where(
      and(
        eq(brokerConnectionsTable.brokerId, professional.id),
        eq(brokerConnectionsTable.ownerUserId, req.user.id),
        eq(brokerConnectionsTable.status, "accepted"),
      ),
    );
  if (!connection) {
    res.status(403).json({
      error: "Reviews require a completed engagement with this professional",
    });
    return;
  }

  const existing = await db
    .select()
    .from(professionalReviewsTable)
    .where(
      and(
        eq(professionalReviewsTable.professionalId, professional.id),
        eq(professionalReviewsTable.reviewerUserId, req.user.id),
      ),
    );
  if (existing.length > 0) {
    res.status(409).json({ error: "You have already reviewed this professional" });
    return;
  }

  const reviewerName =
    [req.user.firstName, req.user.lastName].filter(Boolean).join(" ") ||
    req.user.email ||
    "Verified counterparty";

  const [review] = await db
    .insert(professionalReviewsTable)
    .values({
      professionalId: professional.id,
      reviewerName,
      reviewerCompany: null,
      reviewerUserId: req.user.id,
      source: "connection",
      connectionId: connection.id,
      verifiedEngagement: true,
      ratingExpertise: body.data.ratingExpertise,
      ratingCommunication: body.data.ratingCommunication,
      ratingSpeed: body.data.ratingSpeed,
      ratingQuality: body.data.ratingQuality,
      ratingProfessionalism: body.data.ratingProfessionalism,
      ratingDealUnderstanding: body.data.ratingDealUnderstanding,
      ratingOverall: body.data.ratingOverall,
      comment: body.data.comment ?? null,
    })
    .returning();

  res.status(201).json(CreateProfessionalReviewResponse.parse(toJson(review)));
});

export default router;
