import { Router, type IRouter, type Request } from "express";
import {
  db,
  dealsTable,
  dealDocumentsTable,
  ddWorkstreamsTable,
  ddItemsTable,
  dealQuestionsTable,
  aiFindingsTable,
  dealRisksTable,
  professionalEngagementsTable,
  brokersTable,
  notificationsTable,
  type Deal,
  type DdWorkstream,
  type DdItem,
  type DealQuestion,
} from "@workspace/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  GetDealDdCenterParams,
  GetDealDdCenterResponse,
  CreateDdItemParams,
  CreateDdItemBody,
  CreateDdItemResponse,
  UpdateDdItemParams,
  UpdateDdItemBody,
  UpdateDdItemResponse,
  UpdateDdWorkstreamParams,
  UpdateDdWorkstreamBody,
  UpdateDdWorkstreamResponse,
  ListDealQuestionsParams,
  ListDealQuestionsResponse,
  CreateDealQuestionParams,
  CreateDealQuestionBody,
  CreateDealQuestionResponse,
  UpdateDealQuestionParams,
  UpdateDealQuestionBody,
  UpdateDealQuestionResponse,
  ClassifyAiFindingParams,
  ClassifyAiFindingBody,
  ClassifyAiFindingResponse,
} from "@workspace/api-zod";
import { getAccessStatuses } from "./deals";
import {
  getEngagementDocAccess,
  permissionAllowsView,
} from "../lib/dealTeamAccess";
import { loadDeal, actorName } from "./deal-ai";
import { recordDealEvent } from "../lib/dealEvents";

const router: IRouter = Router();

const toJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// ---------------------------------------------------------------------------
// Access policy — DD center, Q&A and finding classification are confidential
// deal content: strict deal manager (assigned listing broker only, no
// any-broker fallback) plus granted viewers (signed NDA / owner /
// non-confidential deal).
// ---------------------------------------------------------------------------
function isDealManager(req: Request, deal: Deal): boolean {
  return (
    req.isAuthenticated() &&
    deal.brokerUserId != null &&
    req.user.id === deal.brokerUserId
  );
}

async function requireDdAccess(
  req: Request,
  deal: Deal,
): Promise<"manager" | "granted" | "professional" | null> {
  if (!req.isAuthenticated()) return null;
  if (isDealManager(req, deal)) return "manager";
  const statuses = await getAccessStatuses([deal], req.user.id);
  if (statuses.get(deal.id) === "granted") return "granted";
  // Appointed/active professionals on the deal team need the DD center and
  // Q&A to do their work, even without investor-style NDA access.
  if (await activeEngagementFor(deal.id, req.user.id)) return "professional";
  return null;
}

/** Appointed/active professional engagement of this user on the deal, if any. */
async function activeEngagementFor(
  dealId: number,
  userId: string,
): Promise<{ id: number; role: string } | null> {
  const [row] = await db
    .select({
      id: professionalEngagementsTable.id,
      role: professionalEngagementsTable.role,
    })
    .from(professionalEngagementsTable)
    .innerJoin(
      brokersTable,
      eq(professionalEngagementsTable.professionalId, brokersTable.id),
    )
    .where(
      and(
        eq(professionalEngagementsTable.dealId, dealId),
        eq(brokersTable.userId, userId),
        inArray(professionalEngagementsTable.status, ["appointed", "active"]),
      ),
    );
  return row ?? null;
}

/**
 * Document ids on the deal that a professional viewer may see, derived from
 * their engagement's per-category data-room permissions. "all" for managers
 * and granted viewers.
 */
async function viewableDocIds(
  deal: Deal,
  userId: string,
  access: "manager" | "granted" | "professional",
): Promise<"all" | Set<number>> {
  if (access !== "professional") return "all";
  const perms = await getEngagementDocAccess(deal.id, userId);
  const docs = await db
    .select({ id: dealDocumentsTable.id, category: dealDocumentsTable.category })
    .from(dealDocumentsTable)
    .where(eq(dealDocumentsTable.dealId, deal.id));
  const allowed = new Set<number>();
  for (const d of docs) {
    if (perms && permissionAllowsView(perms.get(d.category))) allowed.add(d.id);
  }
  return allowed;
}

function canSeeDoc(allowed: "all" | Set<number>, docId: number): boolean {
  return allowed === "all" || allowed.has(docId);
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

// ---------------------------------------------------------------------------
// Workstream templates
// ---------------------------------------------------------------------------
interface WorkstreamTemplate {
  key: string;
  label: string;
  role: string | null; // deal-team role naturally responsible
  docPattern: RegExp;
  findingCategories: string[];
  items: Array<{ title: string; required?: boolean; description?: string }>;
}

const BASE_WORKSTREAMS: WorkstreamTemplate[] = [
  {
    key: "financial",
    label: "Financial",
    role: "financing_advisor",
    docPattern: /financ|rent roll|budget|audit/i,
    findingCategories: ["financial_value"],
    items: [
      { title: "Audited annual accounts (3 years)", required: true },
      { title: "Rent roll & lease overview", required: true },
      { title: "Service charge reconciliation" },
      { title: "Capex history & plan", required: true },
      { title: "Outstanding debt & security overview" },
    ],
  },
  {
    key: "legal",
    label: "Legal",
    role: "legal_counsel",
    docPattern: /legal|contract|title|deed|lease/i,
    findingCategories: ["clause", "legal", "party"],
    items: [
      { title: "Title deed & land registry extract", required: true },
      { title: "Lease agreements review", required: true },
      { title: "Litigation & disputes check", required: true },
      { title: "Permits & zoning compliance" },
      { title: "Change-of-control clauses" },
    ],
  },
  {
    key: "tax",
    label: "Tax",
    role: "tax_advisor",
    docPattern: /tax|vat|fiscal/i,
    findingCategories: ["tax"],
    items: [
      { title: "Transfer tax / RETT analysis", required: true },
      { title: "VAT position of the asset", required: true },
      { title: "Tax structure memo (share vs asset deal)" },
      { title: "Historic tax filings check" },
    ],
  },
  {
    key: "technical",
    label: "Technical",
    role: "technical_dd",
    docPattern: /technical|survey|structur|maintenance|installat/i,
    findingCategories: ["attention_point"],
    items: [
      { title: "Technical building survey", required: true },
      { title: "Maintenance backlog assessment", required: true },
      { title: "Installations & elevators inspection" },
      { title: "Fire safety compliance", required: true },
    ],
  },
  {
    key: "commercial",
    label: "Commercial",
    role: null,
    docPattern: /market|tenant|commercial|valuation/i,
    findingCategories: ["expiration"],
    items: [
      { title: "Tenant covenant analysis", required: true },
      { title: "Market rent benchmark" },
      { title: "Vacancy & reletting risk assessment" },
      { title: "Independent valuation report", required: true },
    ],
  },
  {
    key: "environmental",
    label: "Environmental",
    role: null,
    docPattern: /environment|soil|energy|esg|sustainab/i,
    findingCategories: [],
    items: [
      { title: "Soil & groundwater investigation", required: true },
      { title: "Energy labels & ESG compliance", required: true },
      { title: "Asbestos survey" },
      { title: "Flood / climate risk screening" },
    ],
  },
  {
    key: "operational",
    label: "Operational",
    role: null,
    docPattern: /operat|insurance|service contract/i,
    findingCategories: ["missing_information"],
    items: [
      { title: "Service & supplier contracts review" },
      { title: "Insurance policies & claims history", required: true },
      { title: "Property management agreement" },
    ],
  },
];

const HOTEL_WORKSTREAMS: WorkstreamTemplate[] = [
  {
    key: "hotel_operational",
    label: "Hotel Operational",
    role: null,
    docPattern: /hotel|str |occupancy|adr|revpar|f&b/i,
    findingCategories: [],
    items: [
      { title: "STR / benchmarking report", required: true },
      { title: "Occupancy, ADR & RevPAR history", required: true },
      { title: "F&B performance analysis" },
      { title: "FF&E reserve adequacy", required: true },
    ],
  },
  {
    key: "management_agreement",
    label: "Management Agreement",
    role: "legal_counsel",
    docPattern: /management agreement|hma|operator/i,
    findingCategories: ["clause"],
    items: [
      { title: "HMA terms & fee structure review", required: true },
      { title: "Performance test & termination rights", required: true },
      { title: "Key money & owner obligations" },
    ],
  },
  {
    key: "franchise_review",
    label: "Franchise Review",
    role: null,
    docPattern: /franchise|brand/i,
    findingCategories: [],
    items: [
      { title: "Franchise agreement & brand standards", required: true },
      { title: "PIP (Property Improvement Plan) exposure", required: true },
      { title: "Territory & renewal terms" },
    ],
  },
];

function templatesFor(deal: Deal): WorkstreamTemplate[] {
  const isHotel = /hotel/i.test(deal.assetClass ?? "");
  return isHotel ? [...BASE_WORKSTREAMS, ...HOTEL_WORKSTREAMS] : BASE_WORKSTREAMS;
}

/** Idempotently provision the deal's default workstreams + checklist items. */
async function provisionWorkstreams(deal: Deal): Promise<void> {
  const existing = await db
    .select({ key: ddWorkstreamsTable.key })
    .from(ddWorkstreamsTable)
    .where(eq(ddWorkstreamsTable.dealId, deal.id));
  const have = new Set(existing.map((w) => w.key));
  const missing = templatesFor(deal).filter((t) => !have.has(t.key));
  if (missing.length === 0) return;
  await db.transaction(async (tx) => {
    for (const [i, t] of missing.entries()) {
      const [ws] = await tx
        .insert(ddWorkstreamsTable)
        .values({ dealId: deal.id, key: t.key, label: t.label, sortOrder: i })
        .onConflictDoNothing()
        .returning();
      if (!ws) continue;
      await tx.insert(ddItemsTable).values(
        t.items.map((it) => ({
          workstreamId: ws.id,
          dealId: deal.id,
          title: it.title,
          description: it.description ?? null,
          required: it.required ?? false,
        })),
      );
    }
  });
}

const DONE_STATUSES = ["done", "na"];

function completionPct(items: DdItem[]): number {
  if (items.length === 0) return 0;
  const done = items.filter((i) => DONE_STATUSES.includes(i.status)).length;
  return Math.round((done / items.length) * 100);
}

function presentItem(
  i: DdItem,
  docNames: Map<number, string>,
  allowedDocs: "all" | Set<number>,
) {
  const docVisible = i.documentId != null && canSeeDoc(allowedDocs, i.documentId);
  return {
    id: i.id,
    workstreamId: i.workstreamId,
    dealId: i.dealId,
    title: i.title,
    description: i.description,
    required: i.required,
    status: i.status,
    note: i.note,
    // Redact both the id and the name of documents the viewer cannot see —
    // exposing the id alone would allow enumeration against document routes.
    documentId: docVisible ? i.documentId : null,
    documentName: docVisible ? (docNames.get(i.documentId!) ?? null) : null,
    updatedByName: i.updatedByName,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// GET /deals/:id/dd
// ---------------------------------------------------------------------------
router.get("/deals/:id/dd", async (req, res): Promise<void> => {
  const params = GetDealDdCenterParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const deal = await loadDeal(params.data.id);
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }
  const access = await requireDdAccess(req, deal);
  if (!access) {
    res.status(403).json({ error: "Due diligence requires granted access to this deal." });
    return;
  }
  await provisionWorkstreams(deal);

  const [workstreams, items, docs, questions, findings, risks, engagements] =
    await Promise.all([
      db
        .select()
        .from(ddWorkstreamsTable)
        .where(eq(ddWorkstreamsTable.dealId, deal.id))
        .orderBy(asc(ddWorkstreamsTable.sortOrder), asc(ddWorkstreamsTable.id)),
      db
        .select()
        .from(ddItemsTable)
        .where(eq(ddItemsTable.dealId, deal.id))
        .orderBy(asc(ddItemsTable.id)),
      db
        .select({
          id: dealDocumentsTable.id,
          name: dealDocumentsTable.name,
          category: dealDocumentsTable.category,
        })
        .from(dealDocumentsTable)
        .where(eq(dealDocumentsTable.dealId, deal.id)),
      db
        .select({ category: dealQuestionsTable.category, status: dealQuestionsTable.status })
        .from(dealQuestionsTable)
        .where(eq(dealQuestionsTable.dealId, deal.id)),
      db
        .select({ category: aiFindingsTable.category })
        .from(aiFindingsTable)
        .where(eq(aiFindingsTable.dealId, deal.id)),
      db
        .select({ category: dealRisksTable.category })
        .from(dealRisksTable)
        .where(eq(dealRisksTable.dealId, deal.id)),
      db
        .select({
          id: professionalEngagementsTable.id,
          role: professionalEngagementsTable.role,
          status: professionalEngagementsTable.status,
          name: brokersTable.name,
          company: brokersTable.company,
        })
        .from(professionalEngagementsTable)
        .innerJoin(
          brokersTable,
          eq(professionalEngagementsTable.professionalId, brokersTable.id),
        )
        .where(eq(professionalEngagementsTable.dealId, deal.id)),
    ]);

  // Professionals only see documents their engagement permits; managers and
  // granted viewers see all deal documents.
  const allowedDocs = await viewableDocIds(deal, req.user!.id, access);
  const visibleDocs = docs.filter((d) => canSeeDoc(allowedDocs, d.id));
  const docNames = new Map(visibleDocs.map((d) => [d.id, d.name]));
  const templates = new Map(templatesFor(deal).map((t) => [t.key, t]));
  const activeEngagements = engagements.filter((e) =>
    ["appointed", "active"].includes(e.status),
  );
  const engagementById = new Map(activeEngagements.map((e) => [e.id, e]));

  const viewerEngagement =
    access === "professional"
      ? await activeEngagementFor(deal.id, req.user!.id)
      : null;
  const presented = workstreams.map((ws) => {
    const t = templates.get(ws.key);
    const wsItems = items.filter((i) => i.workstreamId === ws.id);
    // Responsible: explicit assignment first, otherwise the appointed
    // professional whose deal-team role naturally owns this workstream.
    let responsible = null as null | {
      engagementId: number;
      role: string;
      name: string | null;
      company: string | null;
    };
    const explicit =
      ws.responsibleEngagementId != null
        ? engagementById.get(ws.responsibleEngagementId)
        : undefined;
    const fallback =
      !explicit && t?.role
        ? activeEngagements.find((e) => e.role === t.role)
        : undefined;
    const resp = explicit ?? fallback;
    // Server-derived capability: manager always; a professional only for the
    // workstream they are responsible for (explicitly or via role fallback).
    const canUpdateItems =
      access === "manager" ||
      (viewerEngagement != null &&
        (ws.responsibleEngagementId === viewerEngagement.id ||
          (ws.responsibleEngagementId == null &&
            t?.role === viewerEngagement.role)));
    if (resp) {
      responsible = {
        engagementId: resp.id,
        role: resp.role,
        name: resp.name,
        company: resp.company,
      };
    }
    return {
      id: ws.id,
      dealId: ws.dealId,
      key: ws.key,
      label: ws.label,
      status: ws.status,
      responsible,
      completionPct: completionPct(wsItems),
      items: wsItems.map((i) => presentItem(i, docNames, allowedDocs)),
      openQuestions: questions.filter(
        (q) => q.category === ws.key && q.status !== "closed",
      ).length,
      findingsCount:
        findings.filter((f) => t?.findingCategories.includes(f.category)).length +
        risks.filter((r) => r.category === ws.key).length,
      documentsCount: t
        ? visibleDocs.filter((d) => t.docPattern.test(d.category) || t.docPattern.test(d.name)).length
        : 0,
      canUpdateItems,
    };
  });

  const allItems = items;
  res.json(
    GetDealDdCenterResponse.parse(
      toJson({
        dealId: deal.id,
        completionPct: completionPct(allItems),
        canManage: access === "manager",
        workstreams: presented,
      }),
    ),
  );
});

// ---------------------------------------------------------------------------
// POST /deals/:id/dd/items (manager only)
// ---------------------------------------------------------------------------
router.post("/deals/:id/dd/items", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = CreateDdItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = CreateDdItemBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const deal = await loadDeal(params.data.id);
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }
  if (!isDealManager(req, deal)) {
    res.status(403).json({ error: "Only the deal manager can add checklist items." });
    return;
  }
  const [ws] = await db
    .select()
    .from(ddWorkstreamsTable)
    .where(
      and(
        eq(ddWorkstreamsTable.id, body.data.workstreamId),
        eq(ddWorkstreamsTable.dealId, deal.id),
      ),
    );
  if (!ws) {
    res.status(404).json({ error: "Workstream not found on this deal" });
    return;
  }
  const [item] = await db
    .insert(ddItemsTable)
    .values({
      workstreamId: ws.id,
      dealId: deal.id,
      title: body.data.title.trim(),
      description: body.data.description ?? null,
      required: body.data.required ?? false,
      updatedByUserId: req.user.id,
      updatedByName: actorName(req),
    })
    .returning();
  await recordDealEvent({
    dealId: deal.id,
    kind: "dd_item_added",
    title: `DD item added: ${item.title}`,
    detail: `Workstream: ${ws.label}`,
    category: ws.key,
    visibility: "manager",
    req,
  });
  res.status(201).json(
    CreateDdItemResponse.parse(toJson(presentItem(item, new Map(), "all"))),
  );
});

// ---------------------------------------------------------------------------
// PATCH /dd/items/:id (manager or responsible professional)
// ---------------------------------------------------------------------------
router.patch("/dd/items/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = UpdateDdItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateDdItemBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [item] = await db
    .select()
    .from(ddItemsTable)
    .where(eq(ddItemsTable.id, params.data.id));
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  const deal = await loadDeal(item.dealId);
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }
  const manager = isDealManager(req, deal);
  if (!manager) {
    // A responsible professional may update items in their workstream.
    const engagement = await activeEngagementFor(deal.id, req.user.id);
    if (!engagement) {
      res.status(403).json({ error: "No permission to update this item." });
      return;
    }
    const [ws] = await db
      .select()
      .from(ddWorkstreamsTable)
      .where(eq(ddWorkstreamsTable.id, item.workstreamId));
    const template = templatesFor(deal).find((t) => t.key === ws?.key);
    const isResponsible =
      ws?.responsibleEngagementId === engagement.id ||
      (ws?.responsibleEngagementId == null && template?.role === engagement.role);
    if (!isResponsible) {
      res.status(403).json({ error: "Only the workstream's responsible professional can update this item." });
      return;
    }
  }
  // Linked document must belong to the same deal, and non-managers may only
  // link documents their data-room permissions allow them to see.
  if (body.data.documentId != null) {
    const [doc] = await db
      .select({ id: dealDocumentsTable.id })
      .from(dealDocumentsTable)
      .where(
        and(
          eq(dealDocumentsTable.id, body.data.documentId),
          eq(dealDocumentsTable.dealId, deal.id),
        ),
      );
    if (!doc) {
      res.status(400).json({ error: "Document does not belong to this deal." });
      return;
    }
    if (!manager) {
      const allowed = await viewableDocIds(deal, req.user.id, "professional");
      if (!canSeeDoc(allowed, doc.id)) {
        res.status(403).json({ error: "You do not have access to this document." });
        return;
      }
    }
  }
  const [updated] = await db
    .update(ddItemsTable)
    .set({
      ...(body.data.status !== undefined ? { status: body.data.status } : {}),
      ...(body.data.note !== undefined ? { note: body.data.note } : {}),
      ...(body.data.documentId !== undefined
        ? { documentId: body.data.documentId }
        : {}),
      updatedByUserId: req.user.id,
      updatedByName: actorName(req),
      updatedAt: new Date(),
    })
    .where(eq(ddItemsTable.id, item.id))
    .returning();
  const nowDone =
    body.data.status != null &&
    DONE_STATUSES.includes(body.data.status) &&
    !DONE_STATUSES.includes(item.status);
  if (nowDone) {
    await recordDealEvent({
      dealId: deal.id,
      kind: "dd_item_completed",
      title: `DD item completed: ${updated.title}`,
      detail: updated.note ?? undefined,
      visibility: "manager",
      req,
    });
    if (!manager) {
      await notify(
        deal.brokerUserId,
        "dd_item_completed",
        `DD item completed on ${deal.title}: ${updated.title}`,
        deal.id,
      );
    }
  } else if (body.data.status != null && body.data.status !== item.status) {
    await recordDealEvent({
      dealId: deal.id,
      kind: "dd_item_status",
      title: `DD item ${updated.title} → ${body.data.status}`,
      visibility: "manager",
      req,
    });
  }
  const docNames = new Map<number, string>();
  const respAllowed = manager
    ? ("all" as const)
    : await viewableDocIds(deal, req.user.id, "professional");
  if (updated.documentId != null && canSeeDoc(respAllowed, updated.documentId)) {
    const [doc] = await db
      .select({ id: dealDocumentsTable.id, name: dealDocumentsTable.name })
      .from(dealDocumentsTable)
      .where(eq(dealDocumentsTable.id, updated.documentId));
    if (doc) docNames.set(doc.id, doc.name);
  }
  res.json(
    UpdateDdItemResponse.parse(toJson(presentItem(updated, docNames, respAllowed))),
  );
});

// ---------------------------------------------------------------------------
// PATCH /dd/workstreams/:id (manager only)
// ---------------------------------------------------------------------------
router.patch("/dd/workstreams/:id", async (req, res): Promise<void> => {
  const params = UpdateDdWorkstreamParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateDdWorkstreamBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [ws] = await db
    .select()
    .from(ddWorkstreamsTable)
    .where(eq(ddWorkstreamsTable.id, params.data.id));
  if (!ws) {
    res.status(404).json({ error: "Workstream not found" });
    return;
  }
  const deal = await loadDeal(ws.dealId);
  if (!deal || !isDealManager(req, deal)) {
    res.status(403).json({ error: "Only the deal manager can update workstreams." });
    return;
  }
  if (body.data.responsibleEngagementId != null) {
    const [eng] = await db
      .select({ id: professionalEngagementsTable.id })
      .from(professionalEngagementsTable)
      .where(
        and(
          eq(professionalEngagementsTable.id, body.data.responsibleEngagementId),
          eq(professionalEngagementsTable.dealId, deal.id),
          inArray(professionalEngagementsTable.status, ["appointed", "active"]),
        ),
      );
    if (!eng) {
      res.status(400).json({ error: "Engagement is not an appointed professional on this deal." });
      return;
    }
  }
  const [updated] = await db
    .update(ddWorkstreamsTable)
    .set({
      ...(body.data.status !== undefined ? { status: body.data.status } : {}),
      ...(body.data.responsibleEngagementId !== undefined
        ? { responsibleEngagementId: body.data.responsibleEngagementId }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(ddWorkstreamsTable.id, ws.id))
    .returning();
  if (body.data.status != null && body.data.status !== ws.status) {
    await recordDealEvent({
      dealId: deal.id,
      kind: "dd_workstream_status",
      title: `DD workstream ${updated.label} → ${body.data.status}`,
      category: updated.key,
      visibility: "manager",
      req,
    });
  }
  const items = await db
    .select()
    .from(ddItemsTable)
    .where(eq(ddItemsTable.workstreamId, updated.id));
  res.json(
    UpdateDdWorkstreamResponse.parse(
      toJson({
        id: updated.id,
        dealId: updated.dealId,
        key: updated.key,
        label: updated.label,
        status: updated.status,
        responsible: null,
        completionPct: completionPct(items),
        items: items.map((i) => presentItem(i, new Map(), "all")),
        openQuestions: 0,
        findingsCount: 0,
        documentsCount: 0,
        // This endpoint is manager-only, so the manager capability applies.
        canUpdateItems: true,
      }),
    ),
  );
});

// ---------------------------------------------------------------------------
// Q&A
// ---------------------------------------------------------------------------
async function presentQuestion(
  q: DealQuestion,
  req: Request,
  allowedDocs: "all" | Set<number>,
) {
  let assignedToName: string | null = null;
  if (q.assignedEngagementId != null) {
    const [eng] = await db
      .select({ name: brokersTable.name })
      .from(professionalEngagementsTable)
      .innerJoin(
        brokersTable,
        eq(professionalEngagementsTable.professionalId, brokersTable.id),
      )
      .where(eq(professionalEngagementsTable.id, q.assignedEngagementId));
    assignedToName = eng?.name ?? null;
  }
  let answerDocumentName: string | null = null;
  if (q.answerDocumentId != null && canSeeDoc(allowedDocs, q.answerDocumentId)) {
    const [doc] = await db
      .select({ name: dealDocumentsTable.name })
      .from(dealDocumentsTable)
      .where(eq(dealDocumentsTable.id, q.answerDocumentId));
    answerDocumentName = doc?.name ?? null;
  }
  return {
    id: q.id,
    dealId: q.dealId,
    category: q.category,
    question: q.question,
    detail: q.detail,
    askedByName: q.askedByName,
    isOwn: req.isAuthenticated() && q.askedByUserId === req.user.id,
    assignedEngagementId: q.assignedEngagementId,
    assignedParty: q.assignedParty,
    assignedToName,
    status: q.status,
    answerText: q.answerText,
    answerDocumentId:
      q.answerDocumentId != null && canSeeDoc(allowedDocs, q.answerDocumentId)
        ? q.answerDocumentId
        : null,
    answerDocumentName,
    answeredByName: q.answeredByName,
    answeredAt: q.answeredAt,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
  };
}

router.get("/deals/:id/questions", async (req, res): Promise<void> => {
  const params = ListDealQuestionsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const deal = await loadDeal(params.data.id);
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }
  const access = await requireDdAccess(req, deal);
  if (!access) {
    res.status(403).json({ error: "Q&A requires granted access to this deal." });
    return;
  }
  const allowedDocs = await viewableDocIds(deal, req.user!.id, access);
  const questions = await db
    .select()
    .from(dealQuestionsTable)
    .where(eq(dealQuestionsTable.dealId, deal.id))
    .orderBy(asc(dealQuestionsTable.createdAt), asc(dealQuestionsTable.id));
  const presented = [];
  for (const q of questions) presented.push(await presentQuestion(q, req, allowedDocs));
  res.json(ListDealQuestionsResponse.parse(toJson(presented)));
});

router.post("/deals/:id/questions", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = CreateDealQuestionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = CreateDealQuestionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const deal = await loadDeal(params.data.id);
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }
  if (!(await requireDdAccess(req, deal))) {
    res.status(403).json({ error: "Q&A requires granted access to this deal." });
    return;
  }
  const [question] = await db
    .insert(dealQuestionsTable)
    .values({
      dealId: deal.id,
      category: body.data.category,
      question: body.data.question.trim(),
      detail: body.data.detail ?? null,
      askedByUserId: req.user.id,
      askedByName: actorName(req),
    })
    .returning();
  await recordDealEvent({
    dealId: deal.id,
    kind: "qa_question",
    title: `Question asked (${question.category})`,
    detail: question.question,
    category: question.category,
    req,
  });
  if (deal.brokerUserId !== req.user.id) {
    await notify(
      deal.brokerUserId,
      "qa_question",
      `New Q&A question on ${deal.title}: ${question.question.slice(0, 120)}`,
      deal.id,
    );
  }
  res
    .status(201)
    .json(
      CreateDealQuestionResponse.parse(
        toJson(await presentQuestion(question, req, new Set<number>())),
      ),
    );
});

router.patch("/questions/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = UpdateDealQuestionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateDealQuestionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [question] = await db
    .select()
    .from(dealQuestionsTable)
    .where(eq(dealQuestionsTable.id, params.data.id));
  if (!question) {
    res.status(404).json({ error: "Question not found" });
    return;
  }
  const deal = await loadDeal(question.dealId);
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }
  // Mutation-time access recheck: revoked viewers lose all Q&A rights,
  // including on their own previously asked questions.
  const access = await requireDdAccess(req, deal);
  if (!access) {
    res.status(403).json({ error: "Q&A requires granted access to this deal." });
    return;
  }
  const manager = access === "manager";
  const isAsker = question.askedByUserId === req.user.id;
  // The professional currently assigned to this question may answer it.
  const viewerEngagement =
    access === "professional"
      ? await activeEngagementFor(deal.id, req.user.id)
      : null;
  const isAssignedPro =
    viewerEngagement != null &&
    question.assignedEngagementId === viewerEngagement.id;
  if (!manager && !isAsker && !isAssignedPro) {
    res.status(403).json({ error: "No permission to update this question." });
    return;
  }
  if (!manager) {
    if (isAssignedPro && !isAsker) {
      // The assigned professional may only provide the answer — never
      // reassign, close, or otherwise manage the question.
      const allowed =
        body.data.assignedEngagementId === undefined &&
        body.data.assignedParty === undefined &&
        (body.data.status === undefined || body.data.status === "answered") &&
        (body.data.answerText !== undefined || body.data.answerDocumentId !== undefined);
      if (!allowed) {
        res.status(403).json({ error: "You can only answer your assigned question." });
        return;
      }
    } else {
      // The asker (non-manager) may only flag follow-up or close their
      // question, and only once an answer exists.
      const allowed =
        body.data.assignedEngagementId === undefined &&
        body.data.assignedParty === undefined &&
        body.data.answerText === undefined &&
        body.data.answerDocumentId === undefined &&
        (body.data.status === "follow_up" || body.data.status === "closed");
      if (!allowed) {
        res.status(403).json({ error: "You can only mark your question for follow-up or close it." });
        return;
      }
      if (question.answerText == null && question.answerDocumentId == null) {
        res.status(400).json({ error: "Follow-up or closing is only possible after an answer." });
        return;
      }
    }
  }
  // Server-side transition rules (also for the manager): 'answered' requires
  // an answer, and closed questions can only be reopened by the manager.
  const willHaveAnswer =
    body.data.answerText !== undefined || body.data.answerDocumentId !== undefined
      ? (body.data.answerText ?? null) != null || (body.data.answerDocumentId ?? null) != null
      : question.answerText != null || question.answerDocumentId != null;
  if (body.data.status === "answered" && !willHaveAnswer) {
    res.status(400).json({ error: "A question can only be marked answered with an answer text or document." });
    return;
  }
  if (body.data.status === "follow_up" && !willHaveAnswer) {
    res.status(400).json({ error: "Follow-up is only possible after an answer." });
    return;
  }
  if (question.status === "closed" && !manager) {
    res.status(403).json({ error: "Only the deal manager can update a closed question." });
    return;
  }
  if (body.data.assignedEngagementId != null) {
    const [eng] = await db
      .select({ id: professionalEngagementsTable.id })
      .from(professionalEngagementsTable)
      .where(
        and(
          eq(professionalEngagementsTable.id, body.data.assignedEngagementId),
          eq(professionalEngagementsTable.dealId, deal.id),
          inArray(professionalEngagementsTable.status, ["appointed", "active"]),
        ),
      );
    if (!eng) {
      res.status(400).json({ error: "Engagement is not an appointed professional on this deal." });
      return;
    }
  }
  if (body.data.answerDocumentId != null) {
    const [doc] = await db
      .select({ id: dealDocumentsTable.id })
      .from(dealDocumentsTable)
      .where(
        and(
          eq(dealDocumentsTable.id, body.data.answerDocumentId),
          eq(dealDocumentsTable.dealId, deal.id),
        ),
      );
    if (!doc) {
      res.status(400).json({ error: "Answer document does not belong to this deal." });
      return;
    }
    // Non-managers may only attach documents their data-room permissions allow.
    if (!manager) {
      const allowed = await viewableDocIds(deal, req.user.id, "professional");
      if (!canSeeDoc(allowed, doc.id)) {
        res.status(403).json({ error: "You do not have access to this document." });
        return;
      }
    }
  }
  const answering =
    body.data.answerText !== undefined || body.data.answerDocumentId !== undefined;
  // Deriving status: an explicit status wins; otherwise answering sets 'answered',
  // assigning sets 'assigned'.
  const nextStatus =
    body.data.status ??
    (answering
      ? "answered"
      : body.data.assignedEngagementId !== undefined ||
          body.data.assignedParty !== undefined
        ? "assigned"
        : undefined);
  const [updated] = await db
    .update(dealQuestionsTable)
    .set({
      ...(nextStatus !== undefined ? { status: nextStatus } : {}),
      ...(body.data.assignedEngagementId !== undefined
        ? { assignedEngagementId: body.data.assignedEngagementId }
        : {}),
      ...(body.data.assignedParty !== undefined
        ? { assignedParty: body.data.assignedParty }
        : {}),
      ...(body.data.answerText !== undefined
        ? { answerText: body.data.answerText }
        : {}),
      ...(body.data.answerDocumentId !== undefined
        ? { answerDocumentId: body.data.answerDocumentId }
        : {}),
      ...(answering
        ? {
            answeredByUserId: req.user.id,
            answeredByName: actorName(req),
            answeredAt: new Date(),
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(dealQuestionsTable.id, question.id))
    .returning();
  if (answering) {
    await recordDealEvent({
      dealId: deal.id,
      kind: "qa_answer",
      title: `Question answered (${updated.category})`,
      detail: updated.question,
      category: updated.category,
      req,
    });
    if (question.askedByUserId !== req.user.id) {
      await notify(
        question.askedByUserId,
        "qa_answered",
        `Your question on ${deal.title} was answered: ${updated.question.slice(0, 120)}`,
        deal.id,
      );
    }
  } else if (nextStatus != null && nextStatus !== question.status) {
    await recordDealEvent({
      dealId: deal.id,
      kind: "qa_status",
      title: `Question → ${nextStatus} (${updated.category})`,
      detail: updated.question,
      category: updated.category,
      visibility: "manager",
      req,
    });
  }
  const allowedDocs = await viewableDocIds(deal, req.user.id, access);
  res.json(
    UpdateDealQuestionResponse.parse(
      toJson(await presentQuestion(updated, req, allowedDocs)),
    ),
  );
});

// ---------------------------------------------------------------------------
// POST /ai-findings/:id/classify — professional classification
// ---------------------------------------------------------------------------
router.post("/ai-findings/:id/classify", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = ClassifyAiFindingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = ClassifyAiFindingBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [finding] = await db
    .select()
    .from(aiFindingsTable)
    .where(eq(aiFindingsTable.id, params.data.id));
  if (!finding) {
    res.status(404).json({ error: "Finding not found" });
    return;
  }
  const deal = await loadDeal(finding.dealId);
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }
  const manager = isDealManager(req, deal);
  const engagement = manager ? null : await activeEngagementFor(deal.id, req.user.id);
  if (!manager && !engagement) {
    res.status(403).json({ error: "Only the deal manager or an appointed professional can classify findings." });
    return;
  }
  // A professional may only classify findings whose source document is
  // visible under their engagement's data-room permissions — otherwise the
  // response would leak restricted finding content by ID enumeration.
  const professionalAllowed = manager
    ? ("all" as const)
    : await viewableDocIds(deal, req.user.id, "professional");
  if (
    !manager &&
    finding.documentId != null &&
    !canSeeDoc(professionalAllowed, finding.documentId)
  ) {
    res.status(403).json({ error: "You do not have access to this finding's source document." });
    return;
  }
  if (body.data.documentId != null) {
    const [doc] = await db
      .select({ id: dealDocumentsTable.id })
      .from(dealDocumentsTable)
      .where(
        and(
          eq(dealDocumentsTable.id, body.data.documentId),
          eq(dealDocumentsTable.dealId, deal.id),
        ),
      );
    if (!doc) {
      res.status(400).json({ error: "Attachment does not belong to this deal." });
      return;
    }
    if (!manager && !canSeeDoc(professionalAllowed, doc.id)) {
      res.status(403).json({ error: "You do not have access to this document." });
      return;
    }
  }
  const [updated] = await db
    .update(aiFindingsTable)
    .set({
      classification: body.data.classification,
      classificationNote: body.data.note ?? null,
      classificationDocumentId: body.data.documentId ?? null,
      classifiedByUserId: req.user.id,
      classifiedByName: actorName(req),
      classifiedAt: new Date(),
      // Classification is a professional review act: promote provenance.
      ...(finding.reviewStatus === "ai_generated"
        ? {
            reviewStatus: "professional_reviewed",
            reviewedByUserId: req.user.id,
            reviewedByName: actorName(req),
            reviewedAt: new Date(),
          }
        : {}),
    })
    .where(eq(aiFindingsTable.id, finding.id))
    .returning();
  await recordDealEvent({
    dealId: deal.id,
    kind: "ai_finding_classified",
    title: `Finding classified as ${body.data.classification.replace(/_/g, " ")}: ${finding.title}`,
    detail: body.data.note ?? undefined,
    category: finding.category,
    visibility: "manager",
    req,
  });
  if (!manager && deal.brokerUserId != null) {
    await notify(
      deal.brokerUserId,
      "finding_classified",
      `${actorName(req) ?? "A professional"} classified a finding on ${deal.title} as ${body.data.classification.replace(/_/g, " ")}`,
      deal.id,
    );
  }
  let classificationDocumentName: string | null = null;
  if (updated.classificationDocumentId != null) {
    const [doc] = await db
      .select({ name: dealDocumentsTable.name })
      .from(dealDocumentsTable)
      .where(eq(dealDocumentsTable.id, updated.classificationDocumentId));
    classificationDocumentName = doc?.name ?? null;
  }
  res.json(
    ClassifyAiFindingResponse.parse(
      toJson({
        id: updated.id,
        runId: updated.runId,
        dealId: updated.dealId,
        documentId: updated.documentId,
        documentName: null,
        category: updated.category,
        title: updated.title,
        detail: updated.detail,
        severity: updated.severity,
        confidence: updated.confidence,
        reviewStatus: updated.reviewStatus,
        reviewedByName: updated.reviewedByName,
        reviewedAt: updated.reviewedAt,
        classification: updated.classification,
        classificationNote: updated.classificationNote,
        classificationDocumentId: updated.classificationDocumentId,
        classificationDocumentName,
        classifiedByName: updated.classifiedByName,
        classifiedAt: updated.classifiedAt,
        createdAt: updated.createdAt,
        sources: [],
      }),
    ),
  );
});

export { router as dueDiligenceRouter };
export const DD_DONE_STATUSES = DONE_STATUSES;
