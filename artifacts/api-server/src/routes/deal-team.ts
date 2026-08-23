import { toJson } from "../lib/serialize";
import { Router, type IRouter, type Request } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  dealsTable,
  brokersTable,
  professionalEngagementsTable,
  feeProposalsTable,
  dealDocumentPermissionsTable,
  dealDocumentsTable,
  notificationsTable,
  activityTable,
  type Broker,
  type Deal,
  type ProfessionalEngagement,
  type DealDocumentPermission,
  type FeeProposal,
} from "@workspace/db";
import {
  GetDealTeamParams,
  GetDealTeamResponse,
  ListDealTeamCandidatesQueryParams,
  ListDealTeamCandidatesResponse,
  CreateTeamInvitationParams,
  CreateTeamInvitationBody,
  CreateTeamInvitationResponse,
  ListMyEngagementsResponse,
  UpdateEngagementParams,
  UpdateEngagementBody,
  UpdateEngagementResponse,
  CreateFeeProposalParams,
  CreateFeeProposalBody,
  CreateFeeProposalResponse,
  UpdateFeeProposalParams,
  UpdateFeeProposalBody,
  UpdateFeeProposalResponse,
} from "@workspace/api-zod";
import { canManageDealDocuments } from "./deals";
import { DATAROOM_ACTIVE_STATUSES } from "../lib/dealTeamAccess";
import {
  getReviewAggregates,
  presentProfessional,
  type ReviewAggregate,
} from "./professionals";

const router: IRouter = Router();

/**
 * Canonical deal team roles. Served by the API so clients never hardcode
 * the list; each role recruits from one marketplace category.
 */
export const DEAL_TEAM_ROLES: ReadonlyArray<{
  id: string;
  label: string;
  category: string;
}> = [
  { id: "selling_broker", label: "Selling Broker", category: "brokers" },
  { id: "acquisition_broker", label: "Acquisition Broker", category: "acquisition_brokers" },
  { id: "legal_counsel", label: "Legal Counsel", category: "legal_advisors" },
  { id: "tax_advisor", label: "Tax Advisor", category: "tax_advisors" },
  { id: "financing_advisor", label: "Financing Advisor", category: "financing_advisors" },
  { id: "valuer", label: "Valuer", category: "valuers" },
  { id: "technical_dd", label: "Technical Due Diligence", category: "technical_dd" },
  { id: "notary", label: "Notary", category: "notaries" },
];

// Only levels the platform actually enforces are offered: view (list only),
// download (list + file download), no_access.
const PERMISSION_LEVELS = new Set(["view", "download", "no_access"]);

/** Terminal statuses: no further transitions. */
const TERMINAL_STATUSES = new Set(["declined", "completed", "cancelled"]);

async function loadDeal(id: number): Promise<Deal | undefined> {
  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, id));
  return deal;
}

/**
 * Reasoned match score for a professional against a deal. Deliberately
 * blends reputation, verification, review quality and fit — transaction
 * volume is never an input.
 */
function matchProfessional(
  p: Broker,
  deal: Deal,
  aggregate: ReviewAggregate | undefined,
): { matchScore: number; matchReasons: string[] } {
  const reasons: string[] = [];
  // Platform reputation score is on a 0–10 scale.
  let score = p.score * 3.5;
  reasons.push(`Reputation score ${p.score}/10 on the platform`);

  const tierWeights: Record<string, number> = {
    verified_firm: 15,
    specialist_verified: 15,
    verified_professional: 12,
    verification_pending: 4,
  };
  const tier = tierWeights[p.verificationStatus] ?? 0;
  if (tier > 0) {
    score += tier;
    reasons.push(`Verification status: ${p.verificationStatus.replace(/_/g, " ")}`);
  }

  if (aggregate?.avgRating != null) {
    score += aggregate.avgRating * 2;
    reasons.push(
      `Rated ${aggregate.avgRating.toFixed(1)}/10 across ${aggregate.reviewCount} verified engagement review${aggregate.reviewCount === 1 ? "" : "s"}`,
    );
  }

  const countries = p.countries ?? [];
  if (p.country === deal.country || countries.includes(deal.country)) {
    score += 15;
    reasons.push(`Active in ${deal.country}, where the asset is located`);
  }

  const assetClasses = p.assetClasses ?? [];
  if (assetClasses.includes(deal.assetClass)) {
    score += 10;
    reasons.push(`Covers the ${deal.assetClass} asset class`);
  }

  if (p.avgResponseHours != null && p.avgResponseHours <= 24) {
    score += p.avgResponseHours <= 6 ? 5 : 3;
    reasons.push(`Typically responds within ${p.avgResponseHours}h`);
  }

  return { matchScore: Math.round(Math.min(100, score) * 10) / 10, matchReasons: reasons };
}

async function presentEngagements(
  engagements: { engagement: ProfessionalEngagement; professional: Broker }[],
) {
  const engagementIds = engagements.map((e) => e.engagement.id);
  const [permissions, fees, aggregates] = await Promise.all([
    engagementIds.length
      ? db
          .select()
          .from(dealDocumentPermissionsTable)
          .where(inArray(dealDocumentPermissionsTable.engagementId, engagementIds))
      : Promise.resolve([] as DealDocumentPermission[]),
    engagementIds.length
      ? db
          .select()
          .from(feeProposalsTable)
          .where(inArray(feeProposalsTable.engagementId, engagementIds))
          .orderBy(desc(feeProposalsTable.createdAt))
      : Promise.resolve([] as FeeProposal[]),
    getReviewAggregates(engagements.map((e) => e.professional)),
  ]);

  return engagements.map(({ engagement, professional }) => ({
    engagement,
    professional: presentProfessional(
      professional,
      aggregates.get(professional.id),
    ),
    permissions: permissions
      .filter((p) => p.engagementId === engagement.id)
      .map((p) => ({ category: p.category, permission: p.permission })),
    feeProposals: fees.filter((f) => f.engagementId === engagement.id),
  }));
}

async function notify(
  userId: string | null | undefined,
  type: string,
  message: string,
  dealId: number,
): Promise<void> {
  if (!userId) return;
  await db.insert(notificationsTable).values({ userId, type, message, dealId });
}

async function logActivity(type: string, description: string): Promise<void> {
  await db.insert(activityTable).values({ type, description });
}

// ---------------------------------------------------------------------------
// GET /deals/:id/team
// ---------------------------------------------------------------------------
router.get("/deals/:id/team", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = GetDealTeamParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const deal = await loadDeal(params.data.id);
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }

  const canManage = canManageDealDocuments(req, deal);
  const rows = await db
    .select({
      engagement: professionalEngagementsTable,
      professional: brokersTable,
    })
    .from(professionalEngagementsTable)
    .innerJoin(
      brokersTable,
      eq(professionalEngagementsTable.professionalId, brokersTable.id),
    )
    .where(eq(professionalEngagementsTable.dealId, params.data.id))
    .orderBy(desc(professionalEngagementsTable.createdAt));

  // Data isolation: only the deal manager sees the full pipeline, including
  // fee proposals and per-member permissions. An engaged professional only
  // ever sees their own engagement — never other members' identities, terms
  // or data-room rights. Everyone else is denied outright.
  let visible = rows;
  if (!canManage) {
    visible = rows.filter((r) => r.professional.userId === req.user.id);
    if (visible.length === 0) {
      res
        .status(403)
        .json({ error: "You are not a member of this deal's team" });
      return;
    }
  }

  const members = await presentEngagements(visible);

  // Document category names are deal information; only the manager needs
  // them (to configure permissions).
  const documentCategories = canManage
    ? [
        ...new Set(
          (
            await db
              .select({ category: dealDocumentsTable.category })
              .from(dealDocumentsTable)
              .where(eq(dealDocumentsTable.dealId, deal.id))
          ).map((d) => d.category),
        ),
      ]
    : [];

  res.json(
    GetDealTeamResponse.parse(
      toJson({
        roles: DEAL_TEAM_ROLES,
        members,
        canManage,
        documentCategories,
      }),
    ),
  );
});

// ---------------------------------------------------------------------------
// GET /deal-team/candidates?dealId=&role=&country=&q=
// ---------------------------------------------------------------------------
router.get("/deal-team/candidates", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const query = ListDealTeamCandidatesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const role = DEAL_TEAM_ROLES.find((r) => r.id === query.data.role);
  if (!role) {
    res.status(400).json({ error: "Unknown deal team role" });
    return;
  }
  const deal = await loadDeal(query.data.dealId);
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }
  if (!canManageDealDocuments(req, deal)) {
    res.status(403).json({ error: "Only the deal manager can search candidates" });
    return;
  }

  const professionals = await db
    .select()
    .from(brokersTable)
    .where(eq(brokersTable.category, role.category));

  const q = query.data.q?.trim().toLowerCase();
  const country = query.data.country?.trim();
  const filtered = professionals.filter((p) => {
    if (country && p.country !== country && !(p.countries ?? []).includes(country)) {
      return false;
    }
    if (q) {
      const haystack = [
        p.name,
        p.company,
        p.title,
        p.city,
        p.country,
        ...(p.specialisations ?? []),
        ...(p.credentials ?? []),
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const aggregates = await getReviewAggregates(filtered);
  const candidates = filtered
    .map((p) => {
      const match = matchProfessional(p, deal, aggregates.get(p.id));
      return {
        professional: presentProfessional(p, aggregates.get(p.id)),
        ...match,
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore);

  res.json(ListDealTeamCandidatesResponse.parse(toJson(candidates)));
});

// ---------------------------------------------------------------------------
// POST /deals/:id/team/invitations
// ---------------------------------------------------------------------------
router.post("/deals/:id/team/invitations", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = CreateTeamInvitationParams.safeParse(req.params);
  const body = CreateTeamInvitationBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({
      error: (params.success ? body : params).error?.message ?? "Invalid input",
    });
    return;
  }
  const role = DEAL_TEAM_ROLES.find((r) => r.id === body.data.role);
  if (!role) {
    res.status(400).json({ error: "Unknown deal team role" });
    return;
  }
  for (const p of body.data.permissions) {
    if (!PERMISSION_LEVELS.has(p.permission)) {
      res.status(400).json({ error: `Unknown permission level: ${p.permission}` });
      return;
    }
  }
  const deal = await loadDeal(params.data.id);
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }
  if (!canManageDealDocuments(req, deal)) {
    res.status(403).json({ error: "Only the deal manager can invite professionals" });
    return;
  }
  const [professional] = await db
    .select()
    .from(brokersTable)
    .where(eq(brokersTable.id, body.data.professionalId));
  if (!professional) {
    res.status(404).json({ error: "Professional not found" });
    return;
  }
  if (professional.category !== role.category) {
    res.status(400).json({
      error: `This professional is not in the ${role.label} category`,
    });
    return;
  }
  const existing = await db
    .select()
    .from(professionalEngagementsTable)
    .where(
      and(
        eq(professionalEngagementsTable.dealId, deal.id),
        eq(professionalEngagementsTable.role, role.id),
        eq(professionalEngagementsTable.professionalId, professional.id),
      ),
    );
  if (existing.length > 0) {
    res.status(409).json({
      error: "This professional already has an engagement for this role",
    });
    return;
  }

  const aggregates = await getReviewAggregates([professional]);
  const match = matchProfessional(professional, deal, aggregates.get(professional.id));

  const invitedByName =
    [req.user.firstName, req.user.lastName].filter(Boolean).join(" ") ||
    req.user.email ||
    "Deal manager";

  const [engagement] = await db
    .insert(professionalEngagementsTable)
    .values({
      dealId: deal.id,
      professionalId: professional.id,
      role: role.id,
      invitedByUserId: req.user.id,
      invitedByName,
      scope: body.data.scope ?? null,
      message: body.data.message ?? null,
      status: "invited",
      matchScore: match.matchScore,
      matchReasons: match.matchReasons,
    })
    .returning();

  if (body.data.permissions.length > 0) {
    await db.insert(dealDocumentPermissionsTable).values(
      body.data.permissions.map((p) => ({
        engagementId: engagement.id,
        category: p.category,
        permission: p.permission,
      })),
    );
  }
  if (body.data.feeProposal) {
    await db.insert(feeProposalsTable).values({
      engagementId: engagement.id,
      proposedByUserId: req.user.id,
      proposedByName: invitedByName,
      feeType: body.data.feeProposal.feeType,
      amount: body.data.feeProposal.amount ?? null,
      currency: body.data.feeProposal.currency ?? "EUR",
      percentage: body.data.feeProposal.percentage ?? null,
      vatIncluded: body.data.feeProposal.vatIncluded ?? false,
      paymentTerms: body.data.feeProposal.paymentTerms ?? null,
      scopeDescription: body.data.feeProposal.scopeDescription ?? null,
    });
  }

  await notify(
    professional.userId,
    "team_invitation",
    `You have been invited as ${role.label} on "${deal.title}"`,
    deal.id,
  );
  await logActivity(
    "team_invitation_sent",
    `${professional.name} invited as ${role.label} on ${deal.title}`,
  );

  const [presented] = await presentEngagements([
    { engagement, professional },
  ]);
  res.status(201).json(CreateTeamInvitationResponse.parse(toJson(presented)));
});

// ---------------------------------------------------------------------------
// GET /engagements/mine
// ---------------------------------------------------------------------------
router.get("/engagements/mine", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const rows = await db
    .select({
      engagement: professionalEngagementsTable,
      professional: brokersTable,
      deal: dealsTable,
    })
    .from(professionalEngagementsTable)
    .innerJoin(
      brokersTable,
      eq(professionalEngagementsTable.professionalId, brokersTable.id),
    )
    .innerJoin(dealsTable, eq(professionalEngagementsTable.dealId, dealsTable.id))
    .where(eq(brokersTable.userId, req.user.id))
    .orderBy(desc(professionalEngagementsTable.createdAt));

  const engagementIds = rows.map((r) => r.engagement.id);
  const [permissions, fees] = await Promise.all([
    engagementIds.length
      ? db
          .select()
          .from(dealDocumentPermissionsTable)
          .where(inArray(dealDocumentPermissionsTable.engagementId, engagementIds))
      : Promise.resolve([] as DealDocumentPermission[]),
    engagementIds.length
      ? db
          .select()
          .from(feeProposalsTable)
          .where(inArray(feeProposalsTable.engagementId, engagementIds))
          .orderBy(desc(feeProposalsTable.createdAt))
      : Promise.resolve([] as FeeProposal[]),
  ]);

  const result = rows.map(({ engagement, deal }) => ({
    engagement,
    // Only a summary of the deal is exposed here; full deal data remains
    // gated by the deal endpoints and data-room permissions.
    deal: {
      id: deal.id,
      title: deal.title,
      assetClass: deal.assetClass,
      country: deal.country,
      city: deal.city,
      confidential: deal.confidential,
      askingPrice: deal.askingPrice,
      currency: deal.currency,
    },
    permissions: permissions
      .filter((p) => p.engagementId === engagement.id)
      .map((p) => ({ category: p.category, permission: p.permission })),
    feeProposals: fees.filter((f) => f.engagementId === engagement.id),
  }));

  res.json(ListMyEngagementsResponse.parse(toJson(result)));
});

// ---------------------------------------------------------------------------
// PATCH /engagements/:id — lifecycle transitions
// ---------------------------------------------------------------------------
type EngagementParty = "manager" | "professional";

async function resolveEngagementParty(
  req: Request,
  engagement: ProfessionalEngagement,
  professional: Broker,
  deal: Deal,
): Promise<EngagementParty | null> {
  if (professional.userId != null && professional.userId === req.user!.id) {
    return "professional";
  }
  if (canManageDealDocuments(req, deal)) return "manager";
  return null;
}

const PROFESSIONAL_TRANSITIONS: Record<string, Set<string>> = {
  interested: new Set(["invited", "info_requested"]),
  request_info: new Set(["invited", "interested"]),
  decline: new Set(["invited", "interested", "info_requested", "proposal_sent", "negotiation"]),
};
const MANAGER_TRANSITIONS: Record<string, Set<string>> = {
  appoint: new Set(["invited", "interested", "proposal_sent", "negotiation"]),
  activate: new Set(["appointed"]),
  cancel: new Set(["invited", "interested", "info_requested", "proposal_sent", "negotiation", "appointed", "active"]),
  complete: new Set(["active"]),
};
const ACTION_TO_STATUS: Record<string, string> = {
  interested: "interested",
  request_info: "info_requested",
  decline: "declined",
  appoint: "appointed",
  activate: "active",
  cancel: "cancelled",
  complete: "completed",
};

router.patch("/engagements/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = UpdateEngagementParams.safeParse(req.params);
  const body = UpdateEngagementBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({
      error: (params.success ? body : params).error?.message ?? "Invalid input",
    });
    return;
  }
  const [row] = await db
    .select({
      engagement: professionalEngagementsTable,
      professional: brokersTable,
      deal: dealsTable,
    })
    .from(professionalEngagementsTable)
    .innerJoin(
      brokersTable,
      eq(professionalEngagementsTable.professionalId, brokersTable.id),
    )
    .innerJoin(dealsTable, eq(professionalEngagementsTable.dealId, dealsTable.id))
    .where(eq(professionalEngagementsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Engagement not found" });
    return;
  }
  const party = await resolveEngagementParty(
    req,
    row.engagement,
    row.professional,
    row.deal,
  );
  if (!party) {
    res.status(403).json({ error: "You are not a party to this engagement" });
    return;
  }
  if (TERMINAL_STATUSES.has(row.engagement.status)) {
    res.status(400).json({ error: "This engagement is already closed" });
    return;
  }

  const allowed =
    party === "professional"
      ? PROFESSIONAL_TRANSITIONS[body.data.action]
      : MANAGER_TRANSITIONS[body.data.action];
  if (!allowed) {
    res.status(403).json({
      error: `A ${party} cannot perform the "${body.data.action}" action`,
    });
    return;
  }
  if (!allowed.has(row.engagement.status)) {
    res.status(400).json({
      error: `Cannot ${body.data.action} an engagement in status "${row.engagement.status}"`,
    });
    return;
  }

  const nextStatus = ACTION_TO_STATUS[body.data.action];
  // Atomic compare-and-set: the status predicate guards against concurrent
  // transitions (e.g. a manager cancelling while the professional responds).
  const [updated] = await db
    .update(professionalEngagementsTable)
    .set({
      status: nextStatus,
      message: body.data.message ?? row.engagement.message,
      respondedAt:
        party === "professional" ? new Date() : row.engagement.respondedAt,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(professionalEngagementsTable.id, row.engagement.id),
        eq(professionalEngagementsTable.status, row.engagement.status),
      ),
    )
    .returning();
  if (!updated) {
    res.status(409).json({
      error:
        "The engagement changed while you were acting on it. Refresh and try again.",
    });
    return;
  }

  const roleLabel =
    DEAL_TEAM_ROLES.find((r) => r.id === row.engagement.role)?.label ??
    row.engagement.role;
  if (party === "professional") {
    await notify(
      row.engagement.invitedByUserId,
      "engagement_update",
      `${row.professional.name} is now "${nextStatus.replace(/_/g, " ")}" for ${roleLabel} on "${row.deal.title}"`,
      row.deal.id,
    );
  } else {
    await notify(
      row.professional.userId,
      "engagement_update",
      `Your ${roleLabel} engagement on "${row.deal.title}" is now "${nextStatus.replace(/_/g, " ")}"`,
      row.deal.id,
    );
  }
  await logActivity(
    "engagement_status",
    `${row.professional.name} (${roleLabel}) on ${row.deal.title}: ${row.engagement.status} → ${nextStatus}`,
  );

  res.json(UpdateEngagementResponse.parse(toJson(updated)));
});

// ---------------------------------------------------------------------------
// POST /engagements/:id/fee-proposals
// ---------------------------------------------------------------------------
router.post("/engagements/:id/fee-proposals", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = CreateFeeProposalParams.safeParse(req.params);
  const body = CreateFeeProposalBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({
      error: (params.success ? body : params).error?.message ?? "Invalid input",
    });
    return;
  }
  const [row] = await db
    .select({
      engagement: professionalEngagementsTable,
      professional: brokersTable,
      deal: dealsTable,
    })
    .from(professionalEngagementsTable)
    .innerJoin(
      brokersTable,
      eq(professionalEngagementsTable.professionalId, brokersTable.id),
    )
    .innerJoin(dealsTable, eq(professionalEngagementsTable.dealId, dealsTable.id))
    .where(eq(professionalEngagementsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Engagement not found" });
    return;
  }
  const party = await resolveEngagementParty(
    req,
    row.engagement,
    row.professional,
    row.deal,
  );
  if (!party) {
    res.status(403).json({ error: "You are not a party to this engagement" });
    return;
  }
  if (TERMINAL_STATUSES.has(row.engagement.status)) {
    res.status(400).json({ error: "This engagement is already closed" });
    return;
  }

  // A new proposal supersedes any earlier open one.
  const priorOpen = await db
    .select()
    .from(feeProposalsTable)
    .where(
      and(
        eq(feeProposalsTable.engagementId, row.engagement.id),
        eq(feeProposalsTable.status, "proposed"),
      ),
    );
  if (priorOpen.length > 0) {
    await db
      .update(feeProposalsTable)
      .set({ status: "superseded" })
      .where(
        inArray(
          feeProposalsTable.id,
          priorOpen.map((p) => p.id),
        ),
      );
  }

  const proposerName =
    party === "professional"
      ? row.professional.name
      : row.engagement.invitedByName;

  const [proposal] = await db
    .insert(feeProposalsTable)
    .values({
      engagementId: row.engagement.id,
      proposedByUserId: req.user.id,
      proposedByName: proposerName,
      feeType: body.data.feeType,
      amount: body.data.amount ?? null,
      currency: body.data.currency ?? "EUR",
      percentage: body.data.percentage ?? null,
      vatIncluded: body.data.vatIncluded ?? false,
      paymentTerms: body.data.paymentTerms ?? null,
      scopeDescription: body.data.scopeDescription ?? null,
    })
    .returning();

  // Fee exchange moves a pre-appointment engagement into negotiation.
  if (["invited", "interested", "info_requested", "proposal_sent"].includes(row.engagement.status)) {
    const next = priorOpen.length > 0 || row.engagement.status === "proposal_sent"
      ? "negotiation"
      : "proposal_sent";
    await db
      .update(professionalEngagementsTable)
      .set({ status: next, updatedAt: new Date() })
      .where(eq(professionalEngagementsTable.id, row.engagement.id));
  }

  await notify(
    party === "professional"
      ? row.engagement.invitedByUserId
      : row.professional.userId,
    "fee_proposal",
    `New fee proposal on "${row.deal.title}" from ${proposerName}`,
    row.deal.id,
  );
  await logActivity(
    "fee_proposal",
    `Fee proposal (${body.data.feeType}) on ${row.deal.title} by ${proposerName}`,
  );

  res.status(201).json(CreateFeeProposalResponse.parse(toJson(proposal)));
});

// ---------------------------------------------------------------------------
// PATCH /fee-proposals/:id — accept / reject (counterparty only)
// ---------------------------------------------------------------------------
router.patch("/fee-proposals/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = UpdateFeeProposalParams.safeParse(req.params);
  const body = UpdateFeeProposalBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({
      error: (params.success ? body : params).error?.message ?? "Invalid input",
    });
    return;
  }
  const [proposal] = await db
    .select()
    .from(feeProposalsTable)
    .where(eq(feeProposalsTable.id, params.data.id));
  if (!proposal) {
    res.status(404).json({ error: "Fee proposal not found" });
    return;
  }
  const [row] = await db
    .select({
      engagement: professionalEngagementsTable,
      professional: brokersTable,
      deal: dealsTable,
    })
    .from(professionalEngagementsTable)
    .innerJoin(
      brokersTable,
      eq(professionalEngagementsTable.professionalId, brokersTable.id),
    )
    .innerJoin(dealsTable, eq(professionalEngagementsTable.dealId, dealsTable.id))
    .where(eq(professionalEngagementsTable.id, proposal.engagementId));
  if (!row) {
    res.status(404).json({ error: "Engagement not found" });
    return;
  }
  const party = await resolveEngagementParty(
    req,
    row.engagement,
    row.professional,
    row.deal,
  );
  if (!party) {
    res.status(403).json({ error: "You are not a party to this engagement" });
    return;
  }
  if (proposal.proposedByUserId === req.user.id) {
    res.status(403).json({ error: "You cannot decide on your own proposal" });
    return;
  }
  if (proposal.status !== "proposed") {
    res.status(400).json({ error: "This proposal is no longer open" });
    return;
  }

  const [updated] = await db
    .update(feeProposalsTable)
    .set({ status: body.data.status })
    .where(eq(feeProposalsTable.id, proposal.id))
    .returning();

  if (body.data.status === "accepted" && !TERMINAL_STATUSES.has(row.engagement.status)) {
    await db
      .update(professionalEngagementsTable)
      .set({ status: "negotiation", updatedAt: new Date() })
      .where(
        and(
          eq(professionalEngagementsTable.id, row.engagement.id),
          inArray(professionalEngagementsTable.status, [
            "proposal_sent",
            "invited",
            "interested",
            "info_requested",
          ]),
        ),
      );
  }

  await notify(
    proposal.proposedByUserId,
    "fee_proposal",
    `Your fee proposal on "${row.deal.title}" was ${body.data.status}`,
    row.deal.id,
  );
  await logActivity(
    "fee_proposal_decision",
    `Fee proposal on ${row.deal.title}: ${body.data.status}`,
  );

  res.json(UpdateFeeProposalResponse.parse(toJson(updated)));
});

export default router;
