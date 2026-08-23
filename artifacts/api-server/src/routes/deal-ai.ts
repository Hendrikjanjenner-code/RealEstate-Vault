import { Router, type IRouter, type Request } from "express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  dealsTable,
  dealDocumentsTable,
  aiAnalysisRunsTable,
  aiFindingsTable,
  aiSourceReferencesTable,
  aiAssistantMessagesTable,
  dealRisksTable,
  type Deal,
  type AiFinding,
  type AiSourceReference,
} from "@workspace/db";
import {
  AnalyzeDealDocumentParams,
  AnalyzeDealDocumentResponse,
  GetDealDocumentAnalysisResponse,
  ListDealAiFindingsParams,
  ListDealAiFindingsResponse,
  ReviewAiFindingParams,
  ReviewAiFindingBody,
  ReviewAiFindingResponse,
  GetDealAssistantHistoryParams,
  GetDealAssistantHistoryResponse,
  AskDealAssistantParams,
  AskDealAssistantBody,
  AskDealAssistantResponse,
  GenerateDealAiReportParams,
  GenerateDealAiReportBody,
  GenerateDealAiReportResponse,
} from "@workspace/api-zod";
import { canManageDealDocuments, getAccessStatuses } from "./deals";
import {
  getEngagementDocAccess,
  permissionAllowsView,
} from "../lib/dealTeamAccess";
import { recordDealEvent } from "../lib/dealEvents";
import {
  AI_MODEL,
  MAX_CONTEXT_CHARS,
  AiAnalysisError,
  analyzeDocumentWithAi,
  askDealAssistant,
  extractDocumentSegments,
  type DocumentAnalysis,
} from "../lib/aiDocIntel";

const router: IRouter = Router();

export const AI_DISCLAIMER =
  "AI-generated content. This is organized information, not a definitive legal, tax or financial interpretation. Request professional review before relying on it.";

const toJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

type DealDocument = typeof dealDocumentsTable.$inferSelect;

// ---------------------------------------------------------------------------
// Authorization — mirrors the data-room documents routes exactly.
// ---------------------------------------------------------------------------

export type ViewerAccess =
  | { mode: "manager" }
  | { mode: "engagement"; access: Map<string, string> }
  | { mode: "granted" }
  | { mode: "basic" };

/**
 * Resolve the caller's data-room access class for this deal:
 * - manager: the deal's own broker/owner — sees everything
 * - engagement: deal-team professional — only explicitly permitted categories
 * - granted: owner / signed NDA / non-confidential deal — all documents
 * - basic: any other authenticated user — only non-NDA documents
 */
export async function resolveViewerAccess(
  req: Request,
  deal: Deal,
): Promise<ViewerAccess> {
  if (!req.isAuthenticated()) return { mode: "basic" };
  if (canManageDealDocuments(req, deal)) return { mode: "manager" };
  const engagementAccess = await getEngagementDocAccess(deal.id, req.user.id);
  if (engagementAccess != null) {
    return { mode: "engagement", access: engagementAccess };
  }
  const statuses = await getAccessStatuses([deal], req.user.id);
  if (statuses.get(deal.id) === "granted") return { mode: "granted" };
  return { mode: "basic" };
}

export function canViewDocument(viewer: ViewerAccess, doc: DealDocument): boolean {
  switch (viewer.mode) {
    case "manager":
      return true;
    case "engagement":
      return permissionAllowsView(viewer.access.get(doc.category));
    case "granted":
      return true;
    case "basic":
      return !doc.ndaRequired;
  }
}

export async function loadDeal(id: number): Promise<Deal | undefined> {
  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, id));
  return deal;
}

export async function loadAuthorizedDocuments(
  deal: Deal,
  viewer: ViewerAccess,
): Promise<DealDocument[]> {
  const docs = await db
    .select()
    .from(dealDocumentsTable)
    .where(eq(dealDocumentsTable.dealId, deal.id))
    .orderBy(asc(dealDocumentsTable.id));
  return docs.filter((d) => canViewDocument(viewer, d));
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

interface PresentedFinding extends Record<string, unknown> {
  sources: Array<Record<string, unknown>>;
}

async function presentFindings(
  findings: AiFinding[],
): Promise<PresentedFinding[]> {
  if (findings.length === 0) return [];
  const refs = await db
    .select()
    .from(aiSourceReferencesTable)
    .where(
      inArray(
        aiSourceReferencesTable.findingId,
        findings.map((f) => f.id),
      ),
    );
  const docIds = new Set<number>();
  for (const f of findings) if (f.documentId != null) docIds.add(f.documentId);
  for (const r of refs) docIds.add(r.documentId);
  const docs = docIds.size
    ? await db
        .select({ id: dealDocumentsTable.id, name: dealDocumentsTable.name })
        .from(dealDocumentsTable)
        .where(inArray(dealDocumentsTable.id, [...docIds]))
    : [];
  const docNames = new Map(docs.map((d) => [d.id, d.name]));
  const refsByFinding = new Map<number, AiSourceReference[]>();
  for (const r of refs) {
    const list = refsByFinding.get(r.findingId) ?? [];
    list.push(r);
    refsByFinding.set(r.findingId, list);
  }
  return findings.map((f) => ({
    id: f.id,
    runId: f.runId,
    dealId: f.dealId,
    documentId: f.documentId,
    documentName: f.documentId != null ? (docNames.get(f.documentId) ?? null) : null,
    category: f.category,
    title: f.title,
    detail: f.detail,
    severity: f.severity,
    confidence: f.confidence,
    reviewStatus: f.reviewStatus,
    reviewedByName: f.reviewedByName,
    reviewedAt: f.reviewedAt?.toISOString() ?? null,
    createdAt: f.createdAt.toISOString(),
    sources: (refsByFinding.get(f.id) ?? []).map((r) => ({
      id: r.id,
      findingId: r.findingId,
      documentId: r.documentId,
      documentName: docNames.get(r.documentId) ?? null,
      page: r.page,
      section: r.section,
      excerpt: r.excerpt,
    })),
  }));
}

function presentRun(run: typeof aiAnalysisRunsTable.$inferSelect) {
  return {
    id: run.id,
    dealId: run.dealId,
    documentId: run.documentId,
    kind: run.kind,
    status: run.status,
    model: run.model,
    error: run.error,
    requestedByName: run.requestedByName,
    createdAt: run.createdAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
  };
}

export function actorName(req: Request): string | null {
  const u = req.user as { firstName?: string | null; lastName?: string | null; email?: string | null };
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || u.email || null;
}

// ---------------------------------------------------------------------------
// Document analysis
// ---------------------------------------------------------------------------

router.post(
  "/deals/:id/documents/:docId/analyze",
  async (req, res): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const params = AnalyzeDealDocumentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const deal = await loadDeal(params.data.id);
    if (!deal) {
      res.status(404).json({ error: "Deal not found" });
      return;
    }
    const [doc] = await db
      .select()
      .from(dealDocumentsTable)
      .where(
        and(
          eq(dealDocumentsTable.id, params.data.docId),
          eq(dealDocumentsTable.dealId, deal.id),
        ),
      );
    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    const viewer = await resolveViewerAccess(req, deal);
    if (!canViewDocument(viewer, doc)) {
      res.status(403).json({ error: "You are not authorized to view this document." });
      return;
    }

    const fullAccess = viewer.mode === "manager" || viewer.mode === "granted";

    // Record the run first so failures are auditable too — no silent fallback.
    // contextAccess records which deal-facts variant the model saw; restricted
    // viewers can only ever read back 'redacted' runs.
    const [run] = await db
      .insert(aiAnalysisRunsTable)
      .values({
        dealId: deal.id,
        documentId: doc.id,
        kind: "document_analysis",
        contextAccess: fullAccess ? "full" : "redacted",
        status: "running",
        model: AI_MODEL,
        requestedByUserId: req.user.id,
        requestedByName: actorName(req),
      })
      .returning();

    let analysis: DocumentAnalysis;
    try {
      const segments = await extractDocumentSegments(doc);
      // Only manager/granted viewers may expose the raw deal facts to the
      // model; other viewers get the same redaction as presentDeal(), so
      // confidential facts can't round-trip into stored summaries/findings.
      const dealContext =
        fullAccess
          ? `"${deal.title}" — ${deal.assetClass ?? "unknown asset class"} in ${deal.city ?? "?"}, ${deal.country ?? "?"}; deal type ${deal.dealType ?? "unknown"}; transaction structure ${deal.transactionStructure ?? "not specified"}.`
          : `Confidential ${deal.assetClass ?? ""} opportunity in ${deal.region ?? "an undisclosed region"}, ${deal.country ?? "?"}; deal type ${deal.dealType ?? "unknown"}; transaction structure ${deal.transactionStructure ?? "not specified"}. Deal title, exact location and financials are not disclosed at this access level.`;
      analysis = await analyzeDocumentWithAi(dealContext, doc, segments);
    } catch (err) {
      const message =
        err instanceof AiAnalysisError
          ? err.message
          : `Unexpected analysis failure: ${err instanceof Error ? err.message : String(err)}`;
      const status = err instanceof AiAnalysisError ? err.statusCode : 500;
      await db
        .update(aiAnalysisRunsTable)
        .set({ status: "failed", error: message, completedAt: new Date() })
        .where(eq(aiAnalysisRunsTable.id, run.id));
      res.status(status).json({ error: message });
      return;
    }

    const [completedRun] = await db
      .update(aiAnalysisRunsTable)
      .set({
        status: "completed",
        summary: JSON.stringify(analysis.summary),
        completedAt: new Date(),
      })
      .where(eq(aiAnalysisRunsTable.id, run.id))
      .returning();

    const storedFindings: AiFinding[] = [];
    for (const f of analysis.findings) {
      const [finding] = await db
        .insert(aiFindingsTable)
        .values({
          runId: run.id,
          dealId: deal.id,
          documentId: doc.id,
          category: f.category,
          title: f.title,
          detail: f.detail,
          severity: f.severity,
          confidence: f.confidence,
        })
        .returning();
      storedFindings.push(finding);
      if (f.sources.length > 0) {
        await db.insert(aiSourceReferencesTable).values(
          f.sources.map((s) => ({
            findingId: finding.id,
            documentId: doc.id,
            page: s.page,
            section: s.section,
            excerpt: s.excerpt,
          })),
        );
      }
    }

    await recordDealEvent({
      dealId: deal.id,
      kind: "ai_analysis",
      title: `AI analysis completed: ${doc.name}`,
      detail: `${storedFindings.length} findings`,
      category: doc.category,
      req,
    });

    res.json(
      AnalyzeDealDocumentResponse.parse(
        toJson({
          run: presentRun(completedRun),
          summary: analysis.summary,
          findings: await presentFindings(storedFindings),
          disclaimer: AI_DISCLAIMER,
        }),
      ),
    );
  },
);

router.get(
  "/deals/:id/documents/:docId/analysis",
  async (req, res): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const params = AnalyzeDealDocumentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const deal = await loadDeal(params.data.id);
    if (!deal) {
      res.status(404).json({ error: "Deal not found" });
      return;
    }
    const [doc] = await db
      .select()
      .from(dealDocumentsTable)
      .where(
        and(
          eq(dealDocumentsTable.id, params.data.docId),
          eq(dealDocumentsTable.dealId, deal.id),
        ),
      );
    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    const viewer = await resolveViewerAccess(req, deal);
    if (!canViewDocument(viewer, doc)) {
      res.status(403).json({ error: "You are not authorized to view this document." });
      return;
    }
    // Restricted viewers may only read output generated with redacted deal
    // context — a manager's full-context analysis is never served to them.
    const fullAccess = viewer.mode === "manager" || viewer.mode === "granted";
    const [run] = await db
      .select()
      .from(aiAnalysisRunsTable)
      .where(
        and(
          eq(aiAnalysisRunsTable.documentId, doc.id),
          eq(aiAnalysisRunsTable.kind, "document_analysis"),
          eq(aiAnalysisRunsTable.status, "completed"),
          ...(fullAccess ? [] : [eq(aiAnalysisRunsTable.contextAccess, "redacted")]),
        ),
      )
      .orderBy(desc(aiAnalysisRunsTable.id))
      .limit(1);
    if (!run) {
      res.json(
        GetDealDocumentAnalysisResponse.parse({
          run: null,
          summary: null,
          findings: [],
          disclaimer: AI_DISCLAIMER,
        }),
      );
      return;
    }
    const findings = await db
      .select()
      .from(aiFindingsTable)
      .where(eq(aiFindingsTable.runId, run.id))
      .orderBy(asc(aiFindingsTable.id));
    res.json(
      GetDealDocumentAnalysisResponse.parse(
        toJson({
          run: presentRun(run),
          summary: run.summary ? JSON.parse(run.summary) : null,
          findings: await presentFindings(findings),
          disclaimer: AI_DISCLAIMER,
        }),
      ),
    );
  },
);

// ---------------------------------------------------------------------------
// Deal-wide findings (Legal Review / Tax & Structure / risks feed)
// ---------------------------------------------------------------------------

/** Latest completed analysis run id per document, so stale findings from older runs are excluded. */
async function latestFindingsForDocuments(
  dealId: number,
  documentIds: number[],
  access: "any" | "redacted",
): Promise<AiFinding[]> {
  if (documentIds.length === 0) return [];
  const runs = await db
    .select()
    .from(aiAnalysisRunsTable)
    .where(
      and(
        eq(aiAnalysisRunsTable.dealId, dealId),
        eq(aiAnalysisRunsTable.kind, "document_analysis"),
        eq(aiAnalysisRunsTable.status, "completed"),
        ...(access === "redacted"
          ? [eq(aiAnalysisRunsTable.contextAccess, "redacted")]
          : []),
      ),
    )
    .orderBy(desc(aiAnalysisRunsTable.id));
  const latestRunPerDoc = new Map<number, number>();
  for (const run of runs) {
    if (run.documentId == null) continue;
    if (!documentIds.includes(run.documentId)) continue;
    if (!latestRunPerDoc.has(run.documentId)) {
      latestRunPerDoc.set(run.documentId, run.id);
    }
  }
  const runIds = [...latestRunPerDoc.values()];
  if (runIds.length === 0) return [];
  return db
    .select()
    .from(aiFindingsTable)
    .where(inArray(aiFindingsTable.runId, runIds))
    .orderBy(asc(aiFindingsTable.id));
}

router.get("/deals/:id/ai-findings", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = ListDealAiFindingsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const deal = await loadDeal(params.data.id);
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }
  const viewer = await resolveViewerAccess(req, deal);
  const fullAccess = viewer.mode === "manager" || viewer.mode === "granted";
  const docs = await loadAuthorizedDocuments(deal, viewer);
  const findings = await latestFindingsForDocuments(
    deal.id,
    docs.map((d) => d.id),
    fullAccess ? "any" : "redacted",
  );
  res.json(
    ListDealAiFindingsResponse.parse(toJson(await presentFindings(findings))),
  );
});

router.post("/ai-findings/:id/review", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = ReviewAiFindingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = ReviewAiFindingBody.safeParse(req.body);
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
  if (!deal || !canManageDealDocuments(req, deal)) {
    res
      .status(403)
      .json({ error: "Only the deal manager can review AI findings." });
    return;
  }
  const reviewing = body.data.reviewStatus !== "ai_generated";
  const [updated] = await db
    .update(aiFindingsTable)
    .set({
      reviewStatus: body.data.reviewStatus,
      reviewedByUserId: reviewing ? req.user.id : null,
      reviewedByName: reviewing ? actorName(req) : null,
      reviewedAt: reviewing ? new Date() : null,
    })
    .where(eq(aiFindingsTable.id, finding.id))
    .returning();
  await recordDealEvent({
    dealId: deal.id,
    kind: "ai_finding_review",
    title: `AI finding marked ${body.data.reviewStatus.replace("_", " ")}: ${finding.title}`,
    detail: `${finding.reviewStatus} → ${body.data.reviewStatus}`,
    req,
  });
  const [presented] = await presentFindings([updated]);
  res.json(ReviewAiFindingResponse.parse(toJson(presented)));
});

// ---------------------------------------------------------------------------
// AI deal assistant
// ---------------------------------------------------------------------------

router.get("/deals/:id/assistant", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = GetDealAssistantHistoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const deal = await loadDeal(params.data.id);
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }
  // Enforce CURRENT access on stored history: replies produced with full
  // (unrestricted) deal context are only returned while the viewer still has
  // manager/granted access. After revocation only restricted-context
  // messages remain visible.
  const viewer = await resolveViewerAccess(req, deal);
  const fullAccess = viewer.mode === "manager" || viewer.mode === "granted";
  const messages = (
    await db
      .select()
      .from(aiAssistantMessagesTable)
      .where(
        and(
          eq(aiAssistantMessagesTable.dealId, deal.id),
          eq(aiAssistantMessagesTable.userId, req.user.id),
        ),
      )
      .orderBy(asc(aiAssistantMessagesTable.id))
  ).filter((m) => fullAccess || m.restricted);
  res.json(
    GetDealAssistantHistoryResponse.parse(
      toJson(
        messages.map((m) => ({
          id: m.id,
          dealId: m.dealId,
          role: m.role,
          content: m.content,
          restricted: m.restricted,
          createdAt: m.createdAt.toISOString(),
        })),
      ),
    ),
  );
});

/**
 * Build the assistant's context strictly from what this viewer may see:
 * public deal facts plus name/summary/findings of authorized documents only.
 */
async function buildAssistantContext(
  deal: Deal,
  viewer: ViewerAccess,
): Promise<{ context: string; restricted: boolean; docCount: number }> {
  const allDocs = await db
    .select()
    .from(dealDocumentsTable)
    .where(eq(dealDocumentsTable.dealId, deal.id));
  const docs = allDocs.filter((d) => canViewDocument(viewer, d));

  // Mirror presentDeal(): viewers without granted access to this deal get the
  // redacted deal facts only — no title, exact city or financials. The
  // `restricted` flag tracks this access class explicitly (not document
  // counts): it marks any context built without full manager/granted access.
  const sensitiveOk = viewer.mode === "manager" || viewer.mode === "granted";
  const restricted = !sensitiveOk;
  const lines: string[] = sensitiveOk
    ? [
        `Deal: ${deal.title}`,
        `Location: ${deal.city ?? "?"}, ${deal.country ?? "?"}`,
        `Asset class: ${deal.assetClass ?? "unknown"}; deal type: ${deal.dealType ?? "unknown"}; transaction structure: ${deal.transactionStructure ?? "not specified"}.`,
        deal.askingPrice != null
          ? `Asking price: ${deal.currency ?? ""} ${deal.askingPrice}`
          : "Asking price: not disclosed",
      ]
    : [
        `Deal: Confidential ${deal.assetClass ?? ""} Opportunity`.trim(),
        `Location: ${deal.region ?? "Undisclosed"}, ${deal.country ?? "?"}`,
        `Asset class: ${deal.assetClass ?? "unknown"}; deal type: ${deal.dealType ?? "unknown"}.`,
        "Financial details: not disclosed at this access level.",
      ];
  lines.push("", "Data-room documents the current user is authorized to see:");
  if (restricted || docs.length < allDocs.length) {
    lines.push(
      "(The user's document access may be limited; never speculate about documents not listed here.)",
    );
  }

  const findings = await latestFindingsForDocuments(
    deal.id,
    docs.map((d) => d.id),
    sensitiveOk ? "any" : "redacted",
  );
  const runIds = [...new Set(findings.map((f) => f.runId))];
  const runs = runIds.length
    ? await db
        .select()
        .from(aiAnalysisRunsTable)
        .where(inArray(aiAnalysisRunsTable.id, runIds))
    : [];
  const summaryByDoc = new Map<number, string>();
  for (const run of runs) {
    if (run.documentId != null && run.summary) {
      summaryByDoc.set(run.documentId, run.summary);
    }
  }

  for (const doc of docs) {
    lines.push(`\n- Document: "${doc.name}" (category: ${doc.category})`);
    const summary = summaryByDoc.get(doc.id);
    if (summary) {
      lines.push(`  AI summary: ${summary.slice(0, 2000)}`);
      const docFindings = findings.filter((f) => f.documentId === doc.id);
      for (const f of docFindings.slice(0, 20)) {
        lines.push(
          `  Finding [${f.category}, confidence ${f.confidence}, ${f.reviewStatus}]: ${f.title}${f.detail ? ` — ${f.detail}` : ""}`,
        );
      }
    } else {
      lines.push("  (Not yet analyzed by AI — contents unknown.)");
    }
  }

  const risks = await db
    .select()
    .from(dealRisksTable)
    .where(eq(dealRisksTable.dealId, deal.id));
  if (risks.length > 0 && sensitiveOk) {
    lines.push("\nRegistered risks & attention points:");
    for (const r of risks) {
      lines.push(`- [${r.severity}, ${r.status}] ${r.title}`);
    }
  }
  // Deterministic total context cap, matching the per-document analysis cap.
  let context = lines.join("\n");
  if (context.length > MAX_CONTEXT_CHARS) {
    context =
      context.slice(0, MAX_CONTEXT_CHARS) +
      "\n[Context truncated at the size limit — tell the user the data room is too large to consider in full.]";
  }
  return { context, restricted, docCount: docs.length };
}

router.post("/deals/:id/assistant", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = AskDealAssistantParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = AskDealAssistantBody.safeParse(req.body);
  if (!body.success || !body.data.question.trim()) {
    res.status(400).json({ error: "A question is required" });
    return;
  }
  const deal = await loadDeal(params.data.id);
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }
  const viewer = await resolveViewerAccess(req, deal);
  const { context, restricted } = await buildAssistantContext(deal, viewer);

  const fullAccess = viewer.mode === "manager" || viewer.mode === "granted";
  const history = (
    await db
      .select()
      .from(aiAssistantMessagesTable)
      .where(
        and(
          eq(aiAssistantMessagesTable.dealId, deal.id),
          eq(aiAssistantMessagesTable.userId, req.user.id),
        ),
      )
      .orderBy(desc(aiAssistantMessagesTable.id))
      .limit(10)
  )
    // Same current-access rule as the history endpoint: unrestricted-context
    // messages are excluded once the viewer no longer has full access.
    .filter((m) => fullAccess || m.restricted)
    .reverse()
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  // Auditable run record — failures are stored too.
  const [run] = await db
    .insert(aiAnalysisRunsTable)
    .values({
      dealId: deal.id,
      kind: "assistant_reply",
      status: "running",
      model: AI_MODEL,
      requestedByUserId: req.user.id,
      requestedByName: actorName(req),
    })
    .returning();

  let answer: string;
  try {
    answer = await askDealAssistant(context, history, body.data.question.trim());
  } catch (err) {
    const message =
      err instanceof AiAnalysisError
        ? err.message
        : `Unexpected assistant failure: ${err instanceof Error ? err.message : String(err)}`;
    const status = err instanceof AiAnalysisError ? err.statusCode : 500;
    await db
      .update(aiAnalysisRunsTable)
      .set({ status: "failed", error: message, completedAt: new Date() })
      .where(eq(aiAnalysisRunsTable.id, run.id));
    res.status(status).json({ error: message });
    return;
  }

  await db
    .update(aiAnalysisRunsTable)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(aiAnalysisRunsTable.id, run.id));

  await db.insert(aiAssistantMessagesTable).values({
    dealId: deal.id,
    userId: req.user.id,
    role: "user",
    content: body.data.question.trim(),
    restricted,
  });
  const [assistantMessage] = await db
    .insert(aiAssistantMessagesTable)
    .values({
      dealId: deal.id,
      userId: req.user.id,
      role: "assistant",
      content: answer,
      restricted,
    })
    .returning();

  res.json(
    AskDealAssistantResponse.parse(
      toJson({
        message: {
          id: assistantMessage.id,
          dealId: assistantMessage.dealId,
          role: "assistant",
          content: assistantMessage.content,
          restricted,
          createdAt: assistantMessage.createdAt.toISOString(),
        },
        restricted,
        disclaimer: AI_DISCLAIMER,
      }),
    ),
  );
});

// ---------------------------------------------------------------------------
// Provenance-labelled reports
// ---------------------------------------------------------------------------

router.post("/deals/:id/ai-report", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = GenerateDealAiReportParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = GenerateDealAiReportBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const deal = await loadDeal(params.data.id);
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }
  // Reports summarize deal-wide advisory data: manager & granted viewers only
  // (same policy as the advisory endpoints).
  const viewer = await resolveViewerAccess(req, deal);
  if (viewer.mode !== "manager" && viewer.mode !== "granted") {
    res
      .status(403)
      .json({ error: "You are not authorized to generate reports for this deal." });
    return;
  }

  const docs = await loadAuthorizedDocuments(deal, viewer);
  // Reports are manager/granted-only, so full-context output is permitted.
  const findings = await latestFindingsForDocuments(
    deal.id,
    docs.map((d) => d.id),
    "any",
  );
  const risks = await db
    .select()
    .from(dealRisksTable)
    .where(eq(dealRisksTable.dealId, deal.id));

  const provenance = [
    "Deal facts: entered by the listing broker (user-entered).",
    "Document inventory: data-room contents (user-uploaded).",
    "AI findings and summaries: AI Generated — not professionally verified unless explicitly badged.",
    "Risks & attention points: user- or AI-raised; statuses managed by the deal manager.",
  ];

  const sectionLines: string[] = [
    `# ${body.data.kind === "deal_health" ? "Deal Health Report" : body.data.kind === "document_readiness" ? "Document Readiness Report" : "Review Status Report"}`,
    `Deal: ${deal.title} — ${deal.city ?? "?"}, ${deal.country ?? "?"}`,
    `Generated: ${new Date().toISOString()}`,
    "",
  ];
  if (body.data.kind === "document_readiness") {
    sectionLines.push(`## Data room (${docs.length} documents) [user-uploaded]`);
    for (const d of docs) sectionLines.push(`- ${d.name} (${d.category})`);
    sectionLines.push("", "## Missing information signalled by AI [AI Generated]");
    const missing = findings.filter((f) => f.category === "missing_information");
    if (missing.length === 0) sectionLines.push("- None signalled so far.");
    for (const f of missing) sectionLines.push(`- ${f.title}${f.detail ? ` — ${f.detail}` : ""}`);
  } else if (body.data.kind === "review_status") {
    const byStatus = (s: string) => findings.filter((f) => f.reviewStatus === s);
    sectionLines.push("## Review status of AI findings");
    sectionLines.push(`- AI Generated (unreviewed): ${byStatus("ai_generated").length}`);
    sectionLines.push(`- Professional Reviewed: ${byStatus("professional_reviewed").length}`);
    sectionLines.push(`- Verified: ${byStatus("verified").length}`);
    for (const f of findings.filter((x) => x.reviewStatus !== "ai_generated")) {
      sectionLines.push(
        `- [${f.reviewStatus === "verified" ? "Verified" : "Professional Reviewed"}] ${f.title}${f.reviewedByName ? ` — reviewed by ${f.reviewedByName}` : ""}`,
      );
    }
  } else {
    sectionLines.push("## Open risks & attention points [user/AI raised]");
    const open = risks.filter((r) => r.status !== "resolved" && r.status !== "dismissed");
    if (open.length === 0) sectionLines.push("- No open risks registered.");
    for (const r of open) sectionLines.push(`- [${r.severity}] ${r.title} (${r.status})`);
    sectionLines.push("", "## AI attention points [AI Generated]");
    const att = findings.filter((f) => f.category === "attention_point" || f.category === "legal" || f.category === "tax");
    if (att.length === 0) sectionLines.push("- None signalled so far.");
    for (const f of att) {
      sectionLines.push(
        `- ${f.title} (confidence: ${f.confidence}${f.confidence === "low" ? " — Requires Verification" : ""})`,
      );
    }
  }
  sectionLines.push("", `---`, AI_DISCLAIMER);

  const [run] = await db
    .insert(aiAnalysisRunsTable)
    .values({
      dealId: deal.id,
      kind: "report",
      status: "completed",
      model: "none (structured data)",
      summary: sectionLines.join("\n"),
      requestedByUserId: req.user.id,
      requestedByName: actorName(req),
      completedAt: new Date(),
    })
    .returning();

  await recordDealEvent({
    dealId: deal.id,
    kind: "ai_report",
    title: `Report generated: ${body.data.kind.replace("_", " ")}`,
    detail: `run #${run.id}`,
    req,
  });

  res.json(
    GenerateDealAiReportResponse.parse(
      toJson({
        kind: body.data.kind,
        report: sectionLines.join("\n"),
        provenance,
        generatedAt: new Date().toISOString(),
        disclaimer: AI_DISCLAIMER,
      }),
    ),
  );
});

export default router;
