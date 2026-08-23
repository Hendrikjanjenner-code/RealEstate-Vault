import { useState } from "react";
import {
  useAnalyzeDealDocument,
  useGetDealDocumentAnalysis,
  getGetDealDocumentAnalysisQueryKey,
  useListDealAiFindings,
  getListDealAiFindingsQueryKey,
  useReviewAiFinding,
  useGetDealAssistantHistory,
  getGetDealAssistantHistoryQueryKey,
  useAskDealAssistant,
  useGenerateDealAiReport,
  getGetDealTimelineQueryKey,
} from "@workspace/api-client-react";
import type { AiFinding } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Sparkles,
  FileSearch,
  ShieldAlert,
  Scale,
  Landmark,
  ExternalLink,
  Send,
  FileBarChart,
  BadgeCheck,
  Bot,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Shared presentation helpers
// ---------------------------------------------------------------------------

export function ReviewBadge({ status }: { status: string }) {
  if (status === "verified") {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px]" data-testid="badge-verified">
        <BadgeCheck className="w-3 h-3 mr-1" /> Verified
      </Badge>
    );
  }
  if (status === "professional_reviewed") {
    return (
      <Badge className="bg-sky-500/15 text-sky-400 border border-sky-500/30 text-[10px]" data-testid="badge-professional-reviewed">
        Professional Reviewed
      </Badge>
    );
  }
  return (
    <Badge className="bg-violet-500/15 text-violet-400 border border-violet-500/30 text-[10px]" data-testid="badge-ai-generated">
      <Sparkles className="w-3 h-3 mr-1" /> AI Generated
    </Badge>
  );
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const cls =
    confidence === "high"
      ? "text-emerald-400 border-emerald-500/30"
      : confidence === "medium"
        ? "text-amber-400 border-amber-500/30"
        : "text-red-400 border-red-500/30";
  return (
    <span className={`text-[10px] uppercase tracking-wider border rounded px-1.5 py-0.5 ${cls}`}>
      {confidence} confidence{confidence === "low" ? " — Requires Verification" : ""}
    </span>
  );
}

function SourceLinks({ finding }: { finding: AiFinding; dealId: number }) {
  const [openId, setOpenId] = useState<number | null>(null);
  if (!finding.sources || finding.sources.length === 0) return null;
  const open = finding.sources.find((s) => s.id === openId);
  return (
    <div className="mt-1.5">
      <div className="flex flex-wrap gap-2">
        {finding.sources.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setOpenId(openId === s.id ? null : s.id)}
            className={`inline-flex items-center gap-1 text-[11px] border rounded px-1.5 py-0.5 ${openId === s.id ? "text-primary border-primary/40 bg-primary/10" : "text-primary/80 hover:text-primary border-primary/20"}`}
            data-testid={`link-view-source-${s.id}`}
          >
            <ExternalLink className="w-3 h-3" />
            View Source: {s.documentName ?? "document"}
            {s.page != null ? ` — p.${s.page}` : s.section ? ` — ${s.section}` : ""}
          </button>
        ))}
      </div>
      {open && (
        <blockquote className="mt-1.5 text-[11px] text-muted-foreground border-l-2 border-primary/40 pl-2 italic" data-testid={`source-excerpt-${open.id}`}>
          {open.documentName ?? "Document"}
          {open.page != null ? `, page ${open.page}` : open.section ? `, ${open.section}` : ""}
          {open.excerpt ? ` — “${open.excerpt}”` : " — no excerpt captured; open the document from the Data Room."}
        </blockquote>
      )}
    </div>
  );
}

function FindingRow({
  finding,
  dealId,
  canManage,
}: {
  finding: AiFinding;
  dealId: number;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const review = useReviewAiFinding();
  const mark = (reviewStatus: "professional_reviewed" | "verified") => {
    review.mutate(
      { id: finding.id, data: { reviewStatus } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListDealAiFindingsQueryKey(dealId) });
          queryClient.invalidateQueries({ queryKey: getGetDealTimelineQueryKey(dealId) });
          if (finding.documentId != null) {
            queryClient.invalidateQueries({
              queryKey: getGetDealDocumentAnalysisQueryKey(dealId, finding.documentId),
            });
          }
        },
        onError: (err) =>
          toast({ title: "Review failed", description: (err as Error).message, variant: "destructive" }),
      },
    );
  };
  return (
    <div className="p-3 rounded-lg border border-white/5 bg-background/40" data-testid={`finding-${finding.id}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{finding.title}</span>
            <ReviewBadge status={finding.reviewStatus} />
            <ConfidenceBadge confidence={finding.confidence} />
            {finding.severity && (
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                severity: {finding.severity}
              </span>
            )}
          </div>
          {finding.detail && <p className="text-xs text-muted-foreground mt-1">{finding.detail}</p>}
          {finding.reviewedByName && (
            <p className="text-[11px] text-muted-foreground mt-1">Reviewed by {finding.reviewedByName}</p>
          )}
          <SourceLinks finding={finding} dealId={dealId} />
        </div>
        {canManage && finding.reviewStatus !== "verified" && (
          <div className="flex gap-1.5 shrink-0">
            {finding.reviewStatus === "ai_generated" && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] border-white/10"
                disabled={review.isPending}
                onClick={() => mark("professional_reviewed")}
                data-testid={`btn-mark-reviewed-${finding.id}`}
              >
                Mark Professional Reviewed
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px] border-white/10"
              disabled={review.isPending}
              onClick={() => mark("verified")}
              data-testid={`btn-mark-verified-${finding.id}`}
            >
              Mark Verified
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-document AI summary panel (Data Room)
// ---------------------------------------------------------------------------

export function DocumentAiPanel({
  dealId,
  docId,
  canManage,
}: {
  dealId: number;
  docId: number;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useGetDealDocumentAnalysis(dealId, docId, {
    query: { queryKey: getGetDealDocumentAnalysisQueryKey(dealId, docId) },
  });
  const analyze = useAnalyzeDealDocument();

  const runAnalysis = () => {
    analyze.mutate(
      { id: dealId, docId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetDealDocumentAnalysisQueryKey(dealId, docId) });
          queryClient.invalidateQueries({ queryKey: getListDealAiFindingsQueryKey(dealId) });
          queryClient.invalidateQueries({ queryKey: getGetDealTimelineQueryKey(dealId) });
          toast({ title: "AI analysis complete", description: "Findings and summary are ready below." });
        },
        onError: (err) =>
          toast({
            title: "AI analysis failed",
            description: (err as { response?: { data?: { error?: string } } }).response?.data?.error ?? (err as Error).message,
            variant: "destructive",
          }),
      },
    );
  };

  if (isLoading) return <Skeleton className="h-16 w-full" />;

  const summary = data?.summary;
  return (
    <div className="p-4 bg-primary/[0.03] border-t border-white/5 space-y-3" data-testid={`ai-panel-${docId}`}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs uppercase tracking-wider font-semibold text-primary flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" /> AI Summary
          <ReviewBadge status="ai_generated" />
        </p>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[11px] border-primary/30 text-primary hover:bg-primary/10"
          onClick={runAnalysis}
          disabled={analyze.isPending}
          data-testid={`btn-analyze-doc-${docId}`}
        >
          <FileSearch className="w-3.5 h-3.5 mr-1" />
          {analyze.isPending ? "Analyzing…" : data?.run ? "Re-run AI Analysis" : "Run AI Analysis"}
        </Button>
      </div>

      {!summary && !analyze.isPending && (
        <p className="text-xs text-muted-foreground">
          This document has not been analyzed yet. Run the AI analysis to extract dates, parties, values,
          clauses and attention points — with source references.
        </p>
      )}
      {analyze.isPending && <p className="text-xs text-muted-foreground animate-pulse">Reading and analyzing the document…</p>}

      {summary && (
        <div className="space-y-3">
          <div className="grid gap-2 text-xs">
            <SummaryBlock label="What is this document?" text={summary.whatIsThisDocument} />
            <SummaryBlock label="Why is it relevant to this transaction?" text={summary.whyRelevantToTransaction} />
            <SummaryList label="Key commercial points" items={summary.keyCommercialPoints} />
            <SummaryList label="Important dates" items={summary.importantDates} />
            <SummaryList label="Obligations & conditions" items={summary.obligationsAndConditions} />
            <SummaryList label="Attention points" items={summary.attentionPoints} />
            <SummaryBlock label="Professional verification needed" text={summary.professionalVerificationNeeded} />
          </div>
          {data && data.findings.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                Findings ({data.findings.length})
              </p>
              {data.findings.map((f) => (
                <FindingRow key={f.id} finding={f} dealId={dealId} canManage={canManage} />
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground italic border-t border-white/5 pt-2">{data?.disclaimer}</p>
        </div>
      )}
    </div>
  );
}

function SummaryBlock({ label, text }: { label: string; text: string }) {
  if (!text) return null;
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className="text-xs mt-0.5">{text}</p>
    </div>
  );
}

function SummaryList({ label, items }: { label: string; items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <ul className="list-disc list-inside text-xs mt-0.5 space-y-0.5">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Intelligence tab: Legal Review + Tax & Structure + reports
// ---------------------------------------------------------------------------

const LEGAL_CATEGORIES = new Set(["legal", "clause", "expiration", "party", "document_type"]);
const TAX_CATEGORIES = new Set(["tax"]);
const ATTENTION_CATEGORIES = new Set(["attention_point", "missing_information"]);

export function AiIntelligenceTab({
  dealId,
  canManage,
  transactionStructure,
}: {
  dealId: number;
  canManage: boolean;
  transactionStructure: string | null | undefined;
}) {
  const { data: findings, isLoading, error } = useListDealAiFindings(dealId, {
    query: { queryKey: getListDealAiFindingsQueryKey(dealId) },
  });
  const { toast } = useToast();
  const report = useGenerateDealAiReport();
  const [reportText, setReportText] = useState<string | null>(null);
  const [reportProvenance, setReportProvenance] = useState<string[]>([]);

  const generate = (kind: "deal_health" | "document_readiness" | "review_status") => {
    report.mutate(
      { id: dealId, data: { kind } },
      {
        onSuccess: (r) => {
          setReportText(r.report);
          setReportProvenance(r.provenance);
        },
        onError: (err) =>
          toast({
            title: "Report generation failed",
            description: (err as { response?: { data?: { error?: string } } }).response?.data?.error ?? (err as Error).message,
            variant: "destructive",
          }),
      },
    );
  };

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (error) {
    return (
      <p className="text-sm text-muted-foreground">
        AI findings are not available for your access level on this deal.
      </p>
    );
  }
  const all = findings ?? [];
  const legal = all.filter((f) => LEGAL_CATEGORIES.has(f.category));
  const tax = all.filter((f) => TAX_CATEGORIES.has(f.category));
  const attention = all.filter((f) => ATTENTION_CATEGORIES.has(f.category));

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-2xl font-heading font-bold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> AI Document Intelligence
          </h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            AI organizes information from analyzed data-room documents. It never replaces professional judgment —
            every section offers Request Professional Review.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="border-white/10 h-8 text-xs" disabled={report.isPending} onClick={() => generate("deal_health")} data-testid="btn-report-deal-health">
            <FileBarChart className="w-3.5 h-3.5 mr-1" /> Deal Health Report
          </Button>
          <Button size="sm" variant="outline" className="border-white/10 h-8 text-xs" disabled={report.isPending} onClick={() => generate("document_readiness")} data-testid="btn-report-readiness">
            Document Readiness Report
          </Button>
          <Button size="sm" variant="outline" className="border-white/10 h-8 text-xs" disabled={report.isPending} onClick={() => generate("review_status")} data-testid="btn-report-review-status">
            Review Status Report
          </Button>
        </div>
      </div>

      {reportText && (
        <div className="rounded-xl border border-white/10 bg-card/40 p-4 space-y-2" data-testid="ai-report-output">
          <pre className="text-xs whitespace-pre-wrap font-mono">{reportText}</pre>
          <div className="border-t border-white/5 pt-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Provenance</p>
            <ul className="text-[11px] text-muted-foreground list-disc list-inside">
              {reportProvenance.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {all.length === 0 && (
        <div className="rounded-xl border border-white/5 bg-card/30 p-10 text-center text-sm text-muted-foreground">
          No AI findings yet. Run AI analysis on documents in the Data Room tab first.
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h4 className="text-lg font-semibold flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400" /> Potential Attention Points
          </h4>
          <span className="text-[11px] text-muted-foreground">Professional Review Recommended</span>
        </div>
        {attention.length === 0 ? (
          <p className="text-xs text-muted-foreground">No potential attention points signalled so far.</p>
        ) : (
          attention.map((f) => <FindingRow key={f.id} finding={f} dealId={dealId} canManage={canManage} />)
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h4 className="text-lg font-semibold flex items-center gap-2">
            <Scale className="w-4 h-4 text-sky-400" /> Legal Review
          </h4>
          <Button size="sm" variant="outline" className="border-white/10 h-7 text-[11px]" data-testid="btn-request-legal-review"
            onClick={() => toast({ title: "Request sent to Deal Team", description: "Invite or notify legal counsel via the Deal Team tab to perform this review." })}>
            Request Professional Review
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Organized contract details — never a definitive legal conclusion. Items needing counsel are marked
          "Requires Legal Verification" via low confidence.
        </p>
        {legal.length === 0 ? (
          <p className="text-xs text-muted-foreground">No legal findings yet.</p>
        ) : (
          legal.map((f) => <FindingRow key={f.id} finding={f} dealId={dealId} canManage={canManage} />)
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h4 className="text-lg font-semibold flex items-center gap-2">
            <Landmark className="w-4 h-4 text-emerald-400" /> Tax & Structure
          </h4>
          <Button size="sm" variant="outline" className="border-white/10 h-7 text-[11px]" data-testid="btn-request-tax-review"
            onClick={() => toast({ title: "Request sent to Deal Team", description: "Invite or notify a tax advisor via the Deal Team tab to perform this review." })}>
            Request Tax Review
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Transaction structure: <span className="text-foreground font-medium">{transactionStructure ? transactionStructure.replace("_", " ") : "not specified"}</span>.
          AI organizes tax-related documentation; it does not provide tax advice.
        </p>
        {tax.length === 0 ? (
          <p className="text-xs text-muted-foreground">No tax-related findings yet.</p>
        ) : (
          tax.map((f) => <FindingRow key={f.id} finding={f} dealId={dealId} canManage={canManage} />)
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI deal assistant tab
// ---------------------------------------------------------------------------

export function AssistantTab({ dealId }: { dealId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: history, isLoading } = useGetDealAssistantHistory(dealId, {
    query: { queryKey: getGetDealAssistantHistoryQueryKey(dealId) },
  });
  const ask = useAskDealAssistant();
  const [question, setQuestion] = useState("");

  const send = () => {
    const q = question.trim();
    if (!q) return;
    setQuestion("");
    ask.mutate(
      { id: dealId, data: { question: q } },
      {
        onSuccess: () =>
          queryClient.invalidateQueries({ queryKey: getGetDealAssistantHistoryQueryKey(dealId) }),
        onError: (err) =>
          toast({
            title: "Assistant unavailable",
            description: (err as { response?: { data?: { error?: string } } }).response?.data?.error ?? (err as Error).message,
            variant: "destructive",
          }),
      },
    );
  };

  const restricted = history?.some((m) => m.restricted) ?? false;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-2xl font-heading font-bold flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" /> AI Deal Assistant
        </h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
          Ask about this transaction: summaries, missing documents, potential risks or questions to prepare.
          The assistant only uses documents you are authorized to see — and never gives definitive legal, tax
          or financial advice.
        </p>
        {restricted && (
          <p className="text-[11px] text-amber-400 mt-1" data-testid="text-assistant-restricted">
            Your answers are based on a subset of the data room — some documents are outside your access level.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-white/5 bg-card/30 p-4 space-y-3 min-h-48" data-testid="assistant-thread">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !history || history.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            <p>No conversation yet. Try:</p>
            <ul className="text-xs mt-2 space-y-1">
              <li>"Summarize this transaction"</li>
              <li>"Which documents appear to be missing?"</li>
              <li>"What are the main risks so far?"</li>
              <li>"What questions should I prepare for the seller?"</li>
            </ul>
          </div>
        ) : (
          history.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.role === "user" ? "bg-primary/15 text-foreground" : "bg-background/60 border border-white/5"
                }`}
                data-testid={`assistant-msg-${m.id}`}
              >
                {m.content}
              </div>
            </div>
          ))
        )}
        {ask.isPending && <p className="text-xs text-muted-foreground animate-pulse">Assistant is thinking…</p>}
      </div>

      <div className="flex gap-2">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !ask.isPending && send()}
          placeholder="Ask the deal assistant…"
          className="bg-background/50 border-white/10"
          data-testid="input-assistant-question"
        />
        <Button onClick={send} disabled={ask.isPending || !question.trim()} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="btn-assistant-send">
          <Send className="w-4 h-4" />
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground italic">
        AI-generated content — not definitive legal, tax or financial advice. Request professional review before relying on it.
      </p>
    </div>
  );
}
