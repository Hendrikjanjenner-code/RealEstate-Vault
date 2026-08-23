import { toJson } from "../lib/serialize";
import { recordDealEvent } from "../lib/dealEvents";
import { Router, type IRouter, type Request } from "express";
import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import {
  db,
  dealsTable,
  dealDocumentsTable,
  accessRequestsTable,
  professionalEngagementsTable,
  feeProposalsTable,
  brokersTable,
  checklistTemplatesTable,
  checklistTemplateItemsTable,
  dealChecklistStatusTable,
  dealRisksTable,
  riskCommentsTable,
  ddItemsTable,
  dealEventsTable,
  activityTable,
  type Deal,
  type DealRisk,
  type RiskComment,
  type ChecklistTemplate,
  type ChecklistTemplateItem,
} from "@workspace/db";
import {
  GetDealAdvisoryParams,
  GetDealAdvisoryResponse,
  GetDealTimelineParams,
  GetDealTimelineResponse,
  ListDealRisksParams,
  ListDealRisksResponse,
  CreateDealRiskParams,
  CreateDealRiskBody,
  CreateDealRiskResponse,
  UpdateDealRiskParams,
  UpdateDealRiskBody,
  UpdateDealRiskResponse,
  CreateRiskCommentParams,
  CreateRiskCommentBody,
  CreateRiskCommentResponse,
  SetDealChecklistStatusParams,
  SetDealChecklistStatusBody,
  SetDealChecklistStatusResponse,
  ListChecklistTemplatesResponse,
  CreateChecklistTemplateBody,
  CreateChecklistTemplateResponse,
  DeleteChecklistTemplateParams,
} from "@workspace/api-zod";
import { canManageDealDocuments, getAccessStatuses } from "./deals";
import { DEAL_TEAM_ROLES } from "./deal-team";

const router: IRouter = Router();

/**
 * Mandatory wording shown with every Deal Health score. Deal Health is an
 * analytical readiness indicator, never advice.
 */
export const DEAL_HEALTH_DISCLAIMER =
  "Deal Health is an analytical readiness indicator based on available deal information and documents. It does not constitute legal, tax, financial or investment advice.";

const RISK_SEVERITIES = new Set([
  "critical",
  "high",
  "medium",
  "low",
  "informational",
]);
const RISK_STATUSES = new Set([
  "open",
  "under_review",
  "information_requested",
  "resolved",
  "accepted_risk",
  "not_applicable",
]);
const OPEN_RISK_STATUSES = ["open", "under_review", "information_requested"];
const APPOINTED_STATUSES = ["appointed", "active", "completed"];

async function loadDeal(id: number): Promise<Deal | undefined> {
  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, id));
  return deal;
}

/**
 * Advisory data (health, readiness, risks, timeline) is deal-wide analytics:
 * readable only by the deal manager and by viewers with granted access
 * (non-confidential deal, owner, or signed NDA). Engaged professionals are
 * deliberately excluded — their data-room access is category-scoped, and
 * advisory data is derived from documents across all categories, so exposing
 * it would leak restricted-category information.
 */
async function canReadAdvisory(req: Request, deal: Deal): Promise<boolean> {
  if (!req.isAuthenticated()) return false;
  if (canManageDealDocuments(req, deal)) return true;
  const statuses = await getAccessStatuses([deal], req.user.id);
  return statuses.get(deal.id) === "granted";
}

async function logActivity(type: string, description: string): Promise<void> {
  await db.insert(activityTable).values({ type, description });
}

// ---------------------------------------------------------------------------
// Checklist matching & document readiness
// ---------------------------------------------------------------------------

/**
 * Pick the most specific template applicable to the deal: each non-null
 * criterion must match the deal; more matching criteria wins. Ties break
 * deterministically towards the most recently created template.
 *
 * Deals do not (yet) carry a transaction-structure attribute, so a template
 * restricted by transactionStructure applies to no deal rather than every
 * deal — it only becomes active once deals gain that attribute.
 */
function pickTemplate(
  deal: Deal,
  templates: ChecklistTemplate[],
): ChecklistTemplate | null {
  let best: ChecklistTemplate | null = null;
  let bestSpecificity = -1;
  for (const t of templates) {
    let specificity = 0;
    let ok = true;
    for (const [tVal, dVal] of [
      [t.assetClass, deal.assetClass],
      [t.country, deal.country],
      [t.dealType, deal.dealType],
      [t.transactionStructure, deal.transactionStructure],
    ] as const) {
      if (tVal == null) continue;
      if (tVal.toLowerCase() !== (dVal ?? "").toLowerCase()) {
        ok = false;
        break;
      }
      specificity += 1;
    }
    if (
      ok &&
      (specificity > bestSpecificity ||
        (specificity === bestSpecificity && best != null && t.id > best.id))
    ) {
      best = t;
      bestSpecificity = specificity;
    }
  }
  return best;
}

interface ReadinessItem {
  itemId: number;
  name: string;
  category: string;
  required: boolean;
  status: string;
  note: string | null;
}

interface Readiness {
  templateId: number | null;
  templateName: string | null;
  readinessPct: number;
  items: ReadinessItem[];
}

/**
 * Compute document readiness for a deal from templates + data room +
 * overrides. Only templates created by the deal's own manager are considered,
 * so one broker's templates can never influence another broker's deals.
 */
async function computeReadiness(deal: Deal): Promise<Readiness> {
  if (!deal.brokerUserId) {
    return { templateId: null, templateName: null, readinessPct: 0, items: [] };
  }
  const templates = await db
    .select()
    .from(checklistTemplatesTable)
    .where(eq(checklistTemplatesTable.createdByUserId, deal.brokerUserId));
  const template = pickTemplate(deal, templates);
  if (!template) {
    return { templateId: null, templateName: null, readinessPct: 0, items: [] };
  }
  const [items, docs, overrides] = await Promise.all([
    db
      .select()
      .from(checklistTemplateItemsTable)
      .where(eq(checklistTemplateItemsTable.templateId, template.id))
      .orderBy(asc(checklistTemplateItemsTable.sortOrder), asc(checklistTemplateItemsTable.id)),
    db
      .select({ category: dealDocumentsTable.category })
      .from(dealDocumentsTable)
      .where(eq(dealDocumentsTable.dealId, deal.id)),
    db
      .select()
      .from(dealChecklistStatusTable)
      .where(eq(dealChecklistStatusTable.dealId, deal.id)),
  ]);
  const docCategories = new Set(docs.map((d) => d.category.toLowerCase()));
  const overrideMap = new Map(overrides.map((o) => [o.templateItemId, o]));

  const readinessItems: ReadinessItem[] = items.map((item) => {
    const override = overrideMap.get(item.id);
    const computed = docCategories.has(item.category.toLowerCase())
      ? "available"
      : "missing";
    return {
      itemId: item.id,
      name: item.name,
      category: item.category,
      required: item.required,
      status: override?.status ?? computed,
      note: override?.note ?? null,
    };
  });

  const required = readinessItems.filter((i) => i.required);
  const scoreBase = required.length > 0 ? required : readinessItems;
  const ready = scoreBase.filter((i) => i.status === "available").length;
  const readinessPct =
    scoreBase.length === 0 ? 0 : Math.round((ready / scoreBase.length) * 100);

  return {
    templateId: template.id,
    templateName: template.name,
    readinessPct,
    items: readinessItems,
  };
}

// ---------------------------------------------------------------------------
// Deal Health computation
// ---------------------------------------------------------------------------

interface HealthComponent {
  key: string;
  label: string;
  score: number;
  weight: number;
  dataUsed: string[];
  missingData: string[];
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function riskPenalty(risks: DealRisk[], category?: string): number {
  const open = risks.filter(
    (r) =>
      OPEN_RISK_STATUSES.includes(r.status) &&
      (category == null || r.category === category),
  );
  let penalty = 0;
  for (const r of open) {
    penalty +=
      r.severity === "critical"
        ? 35
        : r.severity === "high"
          ? 20
          : r.severity === "medium"
            ? 10
            : r.severity === "low"
              ? 5
              : 0;
  }
  return penalty;
}

interface HealthInput {
  deal: Deal;
  readiness: Readiness;
  risks: DealRisk[];
  docCategories: string[];
  appointedRoles: Set<string>;
  ndaSignedCount: number;
  pendingRequests: number;
  /** DD center completion % (0-100), or null when no DD items exist yet. */
  ddCompletionPct: number | null;
}

function computeHealth(input: HealthInput): {
  overallScore: number;
  components: HealthComponent[];
} {
  const { deal, readiness, risks, docCategories, appointedRoles } = input;
  const components: HealthComponent[] = [];

  // Financial: completeness of the deal's financial profile + financial risks.
  const financialFields: Array<[string, unknown]> = [
    ["Asking price", deal.askingPrice],
    ["Gross yield", deal.grossYield],
    ["Net yield", deal.netYield],
    ["Lettable area", deal.areaSqm],
    ["Occupancy", deal.occupancyPct],
    ["Construction year", deal.constructionYear],
  ];
  const presentFin = financialFields.filter(([, v]) => v != null);
  components.push({
    key: "financial",
    label: "Financial",
    score: clamp(
      (presentFin.length / financialFields.length) * 100 -
        riskPenalty(risks, "financial"),
    ),
    weight: 0.25,
    dataUsed: presentFin.map(([n]) => n),
    missingData: financialFields.filter(([, v]) => v == null).map(([n]) => n),
  });

  // Documentation: checklist readiness (or absence of a template).
  components.push({
    key: "documentation",
    label: "Documentation",
    score: clamp(
      readiness.templateId != null
        ? readiness.readinessPct
        : Math.min(docCategories.length * 20, 60),
    ),
    weight: 0.2,
    dataUsed:
      readiness.templateId != null
        ? [`Checklist "${readiness.templateName}"`, "Data room documents"]
        : docCategories.length > 0
          ? ["Data room document categories"]
          : [],
    missingData:
      readiness.templateId != null
        ? readiness.items
            .filter((i) => i.status !== "available")
            .map((i) => i.name)
        : ["No applicable checklist template configured"],
  });

  // Legal readiness: legal docs, legal counsel & notary on the team, legal risks.
  const hasLegalDocs = docCategories.some((c) => /legal|contract|title/i.test(c));
  const legalScore =
    (hasLegalDocs ? 40 : 0) +
    (appointedRoles.has("legal_counsel") ? 40 : 0) +
    (appointedRoles.has("notary") ? 20 : 0);
  components.push({
    key: "legal",
    label: "Legal Readiness",
    score: clamp(legalScore - riskPenalty(risks, "legal") - riskPenalty(risks, "tax")),
    weight: 0.15,
    dataUsed: [
      ...(hasLegalDocs ? ["Legal documents in data room"] : []),
      ...(appointedRoles.has("legal_counsel") ? ["Legal counsel appointed"] : []),
      ...(appointedRoles.has("notary") ? ["Notary appointed"] : []),
    ],
    missingData: [
      ...(hasLegalDocs ? [] : ["Legal documents"]),
      ...(appointedRoles.has("legal_counsel") ? [] : ["Legal counsel appointment"]),
      ...(appointedRoles.has("notary") ? [] : ["Notary appointment"]),
    ],
  });

  // Financing readiness.
  const hasFinancingDocs = docCategories.some((c) => /financ|loan|debt/i.test(c));
  components.push({
    key: "financing",
    label: "Financing Readiness",
    score: clamp(
      (hasFinancingDocs ? 50 : 0) +
        (appointedRoles.has("financing_advisor") ? 50 : 0) -
        riskPenalty(risks, "financing"),
    ),
    weight: 0.15,
    dataUsed: [
      ...(hasFinancingDocs ? ["Financing documents in data room"] : []),
      ...(appointedRoles.has("financing_advisor")
        ? ["Financing advisor appointed"]
        : []),
    ],
    missingData: [
      ...(hasFinancingDocs ? [] : ["Financing documents"]),
      ...(appointedRoles.has("financing_advisor")
        ? []
        : ["Financing advisor appointment"]),
    ],
  });

  // Due diligence readiness. When the DD center is in use, its checklist
  // completion carries half the component score; the structural signals
  // (documents + team) carry the other half.
  const hasTechnicalDocs = docCategories.some((c) => /technical|environment|survey|valuation/i.test(c));
  const ddStructural =
    (hasTechnicalDocs ? 40 : 0) +
    (appointedRoles.has("technical_dd") ? 40 : 0) +
    (appointedRoles.has("valuer") ? 20 : 0);
  const ddBase =
    input.ddCompletionPct != null
      ? ddStructural * 0.5 + input.ddCompletionPct * 0.5
      : ddStructural;
  components.push({
    key: "dd",
    label: "Due Diligence Readiness",
    score: clamp(ddBase - riskPenalty(risks, "technical")),
    weight: 0.15,
    dataUsed: [
      ...(input.ddCompletionPct != null
        ? [`DD checklist ${input.ddCompletionPct}% complete`]
        : []),
      ...(hasTechnicalDocs ? ["Technical documents in data room"] : []),
      ...(appointedRoles.has("technical_dd") ? ["Technical DD appointed"] : []),
      ...(appointedRoles.has("valuer") ? ["Valuer appointed"] : []),
    ],
    missingData: [
      ...(hasTechnicalDocs ? [] : ["Technical / valuation documents"]),
      ...(appointedRoles.has("technical_dd") ? [] : ["Technical DD appointment"]),
      ...(appointedRoles.has("valuer") ? [] : ["Valuer appointment"]),
    ],
  });

  // Transaction readiness: market interest and overall risk hygiene.
  const openRisks = risks.filter((r) => OPEN_RISK_STATUSES.includes(r.status));
  const criticalOpen = openRisks.filter((r) => r.severity === "critical").length;
  components.push({
    key: "transaction",
    label: "Transaction Readiness",
    score: clamp(
      (deal.status === "active" ? 30 : 10) +
        Math.min(input.ndaSignedCount * 15, 30) +
        Math.min(appointedRoles.size * 10, 30) +
        (criticalOpen === 0 ? 10 : 0) +
        (input.ddCompletionPct != null && input.ddCompletionPct >= 75 ? 10 : 0) -
        input.pendingRequests * 5,
    ),
    weight: 0.1,
    dataUsed: [
      `Deal status: ${deal.status}`,
      `${input.ndaSignedCount} signed NDA(s)`,
      `${appointedRoles.size} team role(s) filled`,
      ...(input.ddCompletionPct != null
        ? [`DD checklist ${input.ddCompletionPct}% complete`]
        : []),
    ],
    missingData: input.pendingRequests > 0 ? [`${input.pendingRequests} unanswered access request(s)`] : [],
  });

  const overallScore = clamp(
    components.reduce((sum, c) => sum + c.score * c.weight, 0),
  );
  return { overallScore, components };
}

// ---------------------------------------------------------------------------
// GET /deals/:id/advisory
// ---------------------------------------------------------------------------
router.get("/deals/:id/advisory", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = GetDealAdvisoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const deal = await loadDeal(params.data.id);
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }
  if (!(await canReadAdvisory(req, deal))) {
    res.status(403).json({ error: "No access to this deal's advisory data" });
    return;
  }
  const canManage = canManageDealDocuments(req, deal);

  const [readiness, risks, docs, engagements, requests, ddItems] = await Promise.all([
    computeReadiness(deal),
    db.select().from(dealRisksTable).where(eq(dealRisksTable.dealId, deal.id)),
    db
      .select({ category: dealDocumentsTable.category })
      .from(dealDocumentsTable)
      .where(eq(dealDocumentsTable.dealId, deal.id)),
    db
      .select()
      .from(professionalEngagementsTable)
      .where(eq(professionalEngagementsTable.dealId, deal.id)),
    db
      .select()
      .from(accessRequestsTable)
      .where(eq(accessRequestsTable.dealId, deal.id)),
    db
      .select({ status: ddItemsTable.status })
      .from(ddItemsTable)
      .where(eq(ddItemsTable.dealId, deal.id)),
  ]);

  const ddCompletionPct =
    ddItems.length === 0
      ? null
      : Math.round(
          (ddItems.filter((i) => i.status === "done" || i.status === "na").length /
            ddItems.length) *
            100,
        );

  const docCategories = [...new Set(docs.map((d) => d.category))];
  const appointedRoles = new Set(
    engagements
      .filter((e) => APPOINTED_STATUSES.includes(e.status))
      .map((e) => e.role),
  );
  const ndaSignedCount = requests.filter((r) => r.status === "nda_signed").length;
  const pendingRequests = requests.filter((r) => r.status === "pending").length;

  const { overallScore, components } = computeHealth({
    deal,
    readiness,
    risks,
    docCategories,
    appointedRoles,
    ndaSignedCount,
    pendingRequests,
    ddCompletionPct,
  });

  const openRisks = risks.filter((r) => OPEN_RISK_STATUSES.includes(r.status));
  const riskSummary = {
    total: risks.length,
    open: openRisks.length,
    critical: openRisks.filter((r) => r.severity === "critical").length,
    high: openRisks.filter((r) => r.severity === "high").length,
  };
  const teamSummary = {
    appointed: appointedRoles.size,
    totalRoles: DEAL_TEAM_ROLES.length,
  };

  // Next best actions, most impactful first. Manager-oriented actions only
  // appear for the manager.
  const nextActions: Array<{ title: string; description: string; tab: string }> = [];
  if (canManage) {
    if (riskSummary.critical > 0) {
      nextActions.push({
        title: "Resolve critical attention points",
        description: `${riskSummary.critical} critical open risk(s) require review before the deal can progress.`,
        tab: "health",
      });
    }
    if (pendingRequests > 0) {
      nextActions.push({
        title: "Respond to access requests",
        description: `${pendingRequests} investor access request(s) are waiting for a decision.`,
        tab: "overview",
      });
    }
    const missingRequired = readiness.items.filter(
      (i) => i.required && i.status !== "available",
    );
    if (missingRequired.length > 0) {
      nextActions.push({
        title: "Complete the document checklist",
        description: `${missingRequired.length} required document(s) missing or needing attention: ${missingRequired
          .slice(0, 3)
          .map((i) => i.name)
          .join(", ")}${missingRequired.length > 3 ? "…" : ""}`,
        tab: "dataroom",
      });
    }
    if (!appointedRoles.has("legal_counsel")) {
      nextActions.push({
        title: "Appoint legal counsel",
        description: "No legal counsel is appointed on the deal team yet.",
        tab: "team",
      });
    }
    if (readiness.templateId == null) {
      nextActions.push({
        title: "Configure a document checklist",
        description: `No checklist template matches ${deal.assetClass} / ${deal.country} / ${deal.dealType} yet. Create one to track document readiness.`,
        tab: "dataroom",
      });
    }
  }

  res.json(
    GetDealAdvisoryResponse.parse(
      toJson({
        overallScore,
        components,
        disclaimer: DEAL_HEALTH_DISCLAIMER,
        readiness,
        riskSummary,
        teamSummary,
        nextActions: nextActions.slice(0, 4),
        canManage,
      }),
    ),
  );
});

// ---------------------------------------------------------------------------
// GET /deals/:id/timeline
// ---------------------------------------------------------------------------
router.get("/deals/:id/timeline", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = GetDealTimelineParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const deal = await loadDeal(params.data.id);
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }
  if (!(await canReadAdvisory(req, deal))) {
    res.status(403).json({ error: "No access to this deal's timeline" });
    return;
  }
  const canManage = canManageDealDocuments(req, deal);

  const [docs, requests, engagements, risks, storedEvents] = await Promise.all([
    db
      .select()
      .from(dealDocumentsTable)
      .where(eq(dealDocumentsTable.dealId, deal.id)),
    db
      .select()
      .from(accessRequestsTable)
      .where(eq(accessRequestsTable.dealId, deal.id)),
    db
      .select({
        engagement: professionalEngagementsTable,
        professional: brokersTable,
      })
      .from(professionalEngagementsTable)
      .innerJoin(
        brokersTable,
        eq(professionalEngagementsTable.professionalId, brokersTable.id),
      )
      .where(eq(professionalEngagementsTable.dealId, deal.id)),
    db.select().from(dealRisksTable).where(eq(dealRisksTable.dealId, deal.id)),
    db
      .select()
      .from(dealEventsTable)
      .where(eq(dealEventsTable.dealId, deal.id)),
  ]);

  interface Event {
    kind: string;
    title: string;
    detail: string | null;
    occurredAt: Date;
  }
  const events: Event[] = [
    {
      kind: "published",
      title: "Deal published",
      detail: deal.title,
      occurredAt: deal.createdAt,
    },
  ];
  for (const doc of docs) {
    events.push({
      kind: "document_added",
      title: `Document added: ${doc.name}`,
      detail: doc.category,
      occurredAt: doc.uploadedAt,
    });
  }
  for (const r of requests) {
    // Requester identities are manager-only information.
    events.push({
      kind: "access_requested",
      title: "Access requested",
      detail: canManage ? (r.requesterName ?? null) : null,
      occurredAt: r.createdAt,
    });
    if (r.ndaSignedAt) {
      events.push({
        kind: "nda_signed",
        title: "NDA signed",
        detail: canManage ? (r.signerName ?? r.requesterName ?? null) : null,
        occurredAt: r.ndaSignedAt,
      });
    }
  }
  for (const { engagement, professional } of engagements) {
    const role =
      DEAL_TEAM_ROLES.find((r) => r.id === engagement.role)?.label ??
      engagement.role;
    events.push({
      kind: "team_invited",
      title: `${role} invited`,
      detail: professional.name,
      occurredAt: engagement.createdAt,
    });
    if (APPOINTED_STATUSES.includes(engagement.status)) {
      events.push({
        kind: "team_status",
        title: `${role} appointed`,
        detail: professional.name,
        occurredAt: engagement.updatedAt,
      });
    }
  }
  for (const risk of risks) {
    events.push({
      kind: "risk_raised",
      title: `Attention point raised: ${risk.title}`,
      detail: `${risk.severity} · ${risk.category}`,
      occurredAt: risk.createdAt,
    });
  }
  // Persisted, immutable audit events: state-overwriting mutations (risk
  // status/severity changes, checklist overrides, document edits/deletions,
  // access decisions) each recorded a row, so intermediate history is kept.
  for (const ev of storedEvents) {
    if (ev.visibility === "manager" && !canManage) continue;
    events.push({
      kind: ev.kind,
      title: ev.title,
      detail: ev.detail,
      occurredAt: ev.occurredAt,
    });
  }

  events.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  res.json(GetDealTimelineResponse.parse(toJson(events)));
});

// ---------------------------------------------------------------------------
// Risks
// ---------------------------------------------------------------------------

async function presentRisks(risks: DealRisk[]): Promise<unknown[]> {
  const comments =
    risks.length === 0
      ? []
      : await db
          .select()
          .from(riskCommentsTable)
          .where(
            inArray(
              riskCommentsTable.riskId,
              risks.map((r) => r.id),
            ),
          )
          .orderBy(asc(riskCommentsTable.createdAt));
  const byRisk = new Map<number, RiskComment[]>();
  for (const c of comments) {
    byRisk.set(c.riskId, [...(byRisk.get(c.riskId) ?? []), c]);
  }
  return risks.map((r) => ({ ...r, comments: byRisk.get(r.id) ?? [] }));
}

router.get("/deals/:id/risks", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = ListDealRisksParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const deal = await loadDeal(params.data.id);
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }
  if (!(await canReadAdvisory(req, deal))) {
    res.status(403).json({ error: "No access to this deal's risks" });
    return;
  }
  const risks = await db
    .select()
    .from(dealRisksTable)
    .where(eq(dealRisksTable.dealId, deal.id))
    .orderBy(desc(dealRisksTable.createdAt));
  res.json(ListDealRisksResponse.parse(toJson(await presentRisks(risks))));
});

router.post("/deals/:id/risks", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = CreateDealRiskParams.safeParse(req.params);
  const body = CreateDealRiskBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({
      error: (params.success ? body : params).error?.message ?? "Invalid input",
    });
    return;
  }
  const deal = await loadDeal(params.data.id);
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }
  if (!canManageDealDocuments(req, deal)) {
    res.status(403).json({ error: "Only the deal manager can record risks" });
    return;
  }
  if (!RISK_SEVERITIES.has(body.data.severity)) {
    res.status(400).json({ error: "Invalid severity" });
    return;
  }
  const authorName =
    [req.user.firstName, req.user.lastName].filter(Boolean).join(" ") ||
    req.user.email ||
    "Deal manager";
  const [risk] = await db
    .insert(dealRisksTable)
    .values({
      dealId: deal.id,
      title: body.data.title,
      description: body.data.description ?? null,
      category: body.data.category,
      severity: body.data.severity,
      source: body.data.source ?? "Manual entry",
      assignedToName: body.data.assignedToName ?? null,
      createdByUserId: req.user.id,
      createdByName: authorName,
    })
    .returning();
  await logActivity(
    "deal_risk",
    `Attention point raised on ${deal.title}: ${risk.title} (${risk.severity})`,
  );
  res
    .status(201)
    .json(CreateDealRiskResponse.parse(toJson({ ...risk, comments: [] })));
});

router.patch("/risks/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = UpdateDealRiskParams.safeParse(req.params);
  const body = UpdateDealRiskBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({
      error: (params.success ? body : params).error?.message ?? "Invalid input",
    });
    return;
  }
  const [risk] = await db
    .select()
    .from(dealRisksTable)
    .where(eq(dealRisksTable.id, params.data.id));
  if (!risk) {
    res.status(404).json({ error: "Risk not found" });
    return;
  }
  const deal = await loadDeal(risk.dealId);
  if (!deal || !canManageDealDocuments(req, deal)) {
    res.status(403).json({ error: "Only the deal manager can update risks" });
    return;
  }
  if (body.data.status != null && !RISK_STATUSES.has(body.data.status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }
  if (body.data.severity != null && !RISK_SEVERITIES.has(body.data.severity)) {
    res.status(400).json({ error: "Invalid severity" });
    return;
  }
  const [updated] = await db
    .update(dealRisksTable)
    .set({
      status: body.data.status ?? risk.status,
      severity: body.data.severity ?? risk.severity,
      assignedToName: body.data.assignedToName ?? risk.assignedToName,
      updatedAt: new Date(),
    })
    .where(eq(dealRisksTable.id, risk.id))
    .returning();
  if (body.data.status && body.data.status !== risk.status) {
    await recordDealEvent({
      dealId: deal.id,
      kind: "risk_status",
      title: `Attention point ${body.data.status.replace(/_/g, " ")}: ${risk.title}`,
      detail: `${risk.status.replace(/_/g, " ")} → ${body.data.status.replace(/_/g, " ")}`,
      req,
    });
    await logActivity(
      "deal_risk",
      `Attention point on ${deal.title} moved to ${body.data.status.replace(/_/g, " ")}: ${risk.title}`,
    );
  }
  if (body.data.severity && body.data.severity !== risk.severity) {
    await recordDealEvent({
      dealId: deal.id,
      kind: "risk_severity",
      title: `Attention point severity changed: ${risk.title}`,
      detail: `${risk.severity} → ${body.data.severity}`,
      req,
    });
  }
  const [presented] = await presentRisks([updated]);
  res.json(UpdateDealRiskResponse.parse(toJson(presented)));
});

router.post("/risks/:id/comments", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = CreateRiskCommentParams.safeParse(req.params);
  const body = CreateRiskCommentBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({
      error: (params.success ? body : params).error?.message ?? "Invalid input",
    });
    return;
  }
  const [risk] = await db
    .select()
    .from(dealRisksTable)
    .where(eq(dealRisksTable.id, params.data.id));
  if (!risk) {
    res.status(404).json({ error: "Risk not found" });
    return;
  }
  const deal = await loadDeal(risk.dealId);
  if (!deal || !(await canReadAdvisory(req, deal))) {
    res.status(403).json({ error: "No access to this deal's risks" });
    return;
  }
  const authorName =
    [req.user.firstName, req.user.lastName].filter(Boolean).join(" ") ||
    req.user.email ||
    "User";
  const [comment] = await db
    .insert(riskCommentsTable)
    .values({
      riskId: risk.id,
      authorUserId: req.user.id,
      authorName,
      body: body.data.body,
    })
    .returning();
  res.status(201).json(CreateRiskCommentResponse.parse(toJson(comment)));
});

// ---------------------------------------------------------------------------
// Checklist status override + templates
// ---------------------------------------------------------------------------
router.post("/deals/:id/checklist-status", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = SetDealChecklistStatusParams.safeParse(req.params);
  const body = SetDealChecklistStatusBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({
      error: (params.success ? body : params).error?.message ?? "Invalid input",
    });
    return;
  }
  const deal = await loadDeal(params.data.id);
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }
  if (!canManageDealDocuments(req, deal)) {
    res
      .status(403)
      .json({ error: "Only the deal manager can update the checklist" });
    return;
  }
  const [item] = await db
    .select()
    .from(checklistTemplateItemsTable)
    .where(eq(checklistTemplateItemsTable.id, body.data.templateItemId));
  if (!item) {
    res.status(404).json({ error: "Checklist item not found" });
    return;
  }
  await db
    .insert(dealChecklistStatusTable)
    .values({
      dealId: deal.id,
      templateItemId: item.id,
      status: body.data.status,
      note: body.data.note ?? null,
      updatedByUserId: req.user.id,
    })
    .onConflictDoUpdate({
      target: [
        dealChecklistStatusTable.dealId,
        dealChecklistStatusTable.templateItemId,
      ],
      set: {
        status: body.data.status,
        note: body.data.note ?? null,
        updatedByUserId: req.user.id,
        updatedAt: new Date(),
      },
    });
  await recordDealEvent({
    dealId: deal.id,
    kind: "checklist_status",
    title: `Checklist item marked ${body.data.status.replace(/_/g, " ")}: ${item.name}`,
    detail: body.data.note ?? null,
    req,
  });
  res.json(
    SetDealChecklistStatusResponse.parse(toJson(await computeReadiness(deal))),
  );
});

function isBroker(req: Request): boolean {
  return req.isAuthenticated() && req.user.role === "broker";
}

async function presentTemplates(
  templates: ChecklistTemplate[],
): Promise<unknown[]> {
  const items =
    templates.length === 0
      ? []
      : await db
          .select()
          .from(checklistTemplateItemsTable)
          .where(
            inArray(
              checklistTemplateItemsTable.templateId,
              templates.map((t) => t.id),
            ),
          )
          .orderBy(
            asc(checklistTemplateItemsTable.sortOrder),
            asc(checklistTemplateItemsTable.id),
          );
  const byTemplate = new Map<number, ChecklistTemplateItem[]>();
  for (const item of items) {
    byTemplate.set(item.templateId, [
      ...(byTemplate.get(item.templateId) ?? []),
      item,
    ]);
  }
  return templates.map((t) => ({ ...t, items: byTemplate.get(t.id) ?? [] }));
}

router.get("/checklist-templates", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!isBroker(req)) {
    res.status(403).json({ error: "Checklist templates are broker tooling" });
    return;
  }
  // Templates are scoped to the broker who created them: brokers only see
  // and match their own templates, so no broker can influence another's deals.
  const templates = await db
    .select()
    .from(checklistTemplatesTable)
    .where(eq(checklistTemplatesTable.createdByUserId, req.user.id))
    .orderBy(desc(checklistTemplatesTable.createdAt));
  res.json(
    ListChecklistTemplatesResponse.parse(
      toJson(await presentTemplates(templates)),
    ),
  );
});

router.post("/checklist-templates", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!isBroker(req)) {
    res.status(403).json({ error: "Checklist templates are broker tooling" });
    return;
  }
  const body = CreateChecklistTemplateBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [template] = await db
    .insert(checklistTemplatesTable)
    .values({
      name: body.data.name,
      assetClass: body.data.assetClass ?? null,
      country: body.data.country ?? null,
      dealType: body.data.dealType ?? null,
      transactionStructure: body.data.transactionStructure ?? null,
      createdByUserId: req.user.id,
    })
    .returning();
  await db.insert(checklistTemplateItemsTable).values(
    body.data.items.map((item, index) => ({
      templateId: template.id,
      category: item.category,
      name: item.name,
      description: item.description ?? null,
      required: item.required ?? true,
      sortOrder: index,
    })),
  );
  const [presented] = await presentTemplates([template]);
  res.status(201).json(CreateChecklistTemplateResponse.parse(toJson(presented)));
});

router.delete("/checklist-templates/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = DeleteChecklistTemplateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [template] = await db
    .select()
    .from(checklistTemplatesTable)
    .where(eq(checklistTemplatesTable.id, params.data.id));
  if (!template) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  if (template.createdByUserId !== req.user.id) {
    res
      .status(403)
      .json({ error: "Only the template owner can delete a template" });
    return;
  }
  await db
    .delete(checklistTemplateItemsTable)
    .where(eq(checklistTemplateItemsTable.templateId, template.id));
  await db
    .delete(checklistTemplatesTable)
    .where(eq(checklistTemplatesTable.id, template.id));
  res.json({ message: "Template deleted" });
});

export default router;
