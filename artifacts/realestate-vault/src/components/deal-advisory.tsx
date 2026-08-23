import { useState } from "react";
import {
  useGetDealAdvisory,
  useGetDealTimeline,
  useListDealRisks,
  useCreateDealRisk,
  useUpdateDealRisk,
  useCreateRiskComment,
  useSetDealChecklistStatus,
  getGetDealAdvisoryQueryKey,
  getGetDealTimelineQueryKey,
  getListDealRisksQueryKey,
  type DealAdvisoryResponse,
  type DealRisk,
  type TimelineEvent,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileWarning,
  Info,
  MessageSquare,
  Plus,
  ShieldAlert,
  Users,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

const SEVERITIES = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "informational", label: "Informational" },
] as const;

const RISK_STATUSES = [
  { value: "open", label: "Open" },
  { value: "under_review", label: "Under Review" },
  { value: "information_requested", label: "Information Requested" },
  { value: "resolved", label: "Resolved" },
  { value: "accepted_risk", label: "Accepted Risk" },
  { value: "not_applicable", label: "Not Applicable" },
] as const;

const RISK_CATEGORIES = [
  "financial",
  "legal",
  "tax",
  "technical",
  "financing",
  "documentation",
  "other",
] as const;

function severityTone(severity: string): string {
  switch (severity) {
    case "critical":
      return "border-red-500/40 text-red-400";
    case "high":
      return "border-orange-500/40 text-orange-400";
    case "medium":
      return "border-yellow-500/30 text-yellow-500";
    case "low":
      return "border-white/20 text-muted-foreground";
    default:
      return "border-white/10 text-muted-foreground";
  }
}

function scoreTone(score: number): string {
  if (score >= 70) return "text-primary";
  if (score >= 40) return "text-yellow-500";
  return "text-orange-400";
}

// ---------------------------------------------------------------------------
// Advisory dashboard cards + next best action (Overview tab)
// ---------------------------------------------------------------------------

export function AdvisoryOverview({
  dealId,
  onNavigate,
}: {
  dealId: number;
  onNavigate: (tab: string) => void;
}) {
  const { data, isLoading, error } = useGetDealAdvisory(dealId, {
    query: { enabled: !!dealId, queryKey: getGetDealAdvisoryQueryKey(dealId), retry: false },
  });
  if (isLoading) return <Skeleton className="h-28 w-full rounded-xl" />;
  if (error || !data) return null;

  const cards = [
    {
      key: "health",
      icon: Activity,
      label: "Deal Health",
      value: `${data.overallScore}/100`,
      tab: "health",
    },
    {
      key: "readiness",
      icon: ClipboardList,
      label: "Document Readiness",
      value: data.readiness.templateId != null ? `${data.readiness.readinessPct}%` : "—",
      tab: "dataroom",
    },
    {
      key: "risks",
      icon: ShieldAlert,
      label: "Attention Points",
      value: `${data.riskSummary.open} open`,
      sub: data.riskSummary.critical > 0 ? `${data.riskSummary.critical} critical` : undefined,
      tab: "health",
    },
    {
      key: "team",
      icon: Users,
      label: "Deal Team",
      value: `${data.teamSummary.appointed}/${data.teamSummary.totalRoles} roles`,
      tab: "team",
    },
  ];

  return (
    <div className="space-y-4" data-testid="section-advisory-overview">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((card) => (
          <button
            key={card.key}
            onClick={() => onNavigate(card.tab)}
            className="text-left rounded-xl border border-white/5 bg-card/30 backdrop-blur p-4 hover:border-primary/30 transition-colors"
            data-testid={`card-advisory-${card.key}`}
          >
            <card.icon className="w-4 h-4 text-primary mb-2" />
            <p className="text-lg font-heading font-semibold">{card.value}</p>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{card.label}</p>
            {card.sub && <p className="text-[11px] text-orange-400 mt-0.5">{card.sub}</p>}
          </button>
        ))}
      </div>
      {data.nextActions.length > 0 && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2" data-testid="card-next-best-action">
          <p className="text-xs uppercase tracking-wider font-semibold text-primary flex items-center gap-1.5">
            <ArrowRight className="w-3.5 h-3.5" /> Next Best Actions
          </p>
          {data.nextActions.map((action, i) => (
            <div key={i} className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{action.title}</p>
                <p className="text-xs text-muted-foreground">{action.description}</p>
              </div>
              <Button size="sm" variant="outline" className="h-7 text-xs border-white/10 shrink-0" onClick={() => onNavigate(action.tab)} data-testid={`button-next-action-${i}`}>
                Open
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deal Health tab
// ---------------------------------------------------------------------------

export function DealHealthTab({ dealId }: { dealId: number }) {
  const { data, isLoading, error } = useGetDealAdvisory(dealId, {
    query: { enabled: !!dealId, queryKey: getGetDealAdvisoryQueryKey(dealId), retry: false },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Deal Health is available once you have access to this deal.
      </p>
    );
  }

  return (
    <div className="space-y-8" data-testid="tab-content-health">
      <div className="rounded-xl border border-white/5 bg-card/30 backdrop-blur p-6">
        <div className="flex items-start justify-between flex-wrap gap-6">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">Deal Health Score</p>
            <p className={`text-5xl font-heading font-bold ${scoreTone(data.overallScore)}`} data-testid="text-health-score">
              {data.overallScore}
              <span className="text-lg text-muted-foreground font-normal"> / 100</span>
            </p>
          </div>
          <div className="flex-1 min-w-64 space-y-3">
            {data.components.map((c) => (
              <div key={c.key} data-testid={`row-health-component-${c.key}`}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium">{c.label}</span>
                  <span className={scoreTone(c.score)}>{c.score}</span>
                </div>
                <Progress value={c.score} className="h-1.5" />
                {c.missingData.length > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Missing: {c.missingData.slice(0, 3).join(", ")}
                    {c.missingData.length > 3 ? "…" : ""}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-5 pt-4 border-t border-white/5 flex gap-2 text-[11px] text-muted-foreground leading-relaxed">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <p data-testid="text-health-disclaimer">{data.disclaimer}</p>
        </div>
      </div>

      <RisksSection dealId={dealId} canManage={data.canManage} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Risks & attention points
// ---------------------------------------------------------------------------

function RisksSection({ dealId, canManage }: { dealId: number; canManage: boolean }) {
  const { data: risks, isLoading } = useListDealRisks(dealId, {
    query: { enabled: !!dealId, queryKey: getListDealRisksQueryKey(dealId), retry: false },
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "other",
    severity: "medium",
    source: "",
    assignedToName: "",
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListDealRisksQueryKey(dealId) });
    queryClient.invalidateQueries({ queryKey: getGetDealAdvisoryQueryKey(dealId) });
  };

  const createRisk = useCreateDealRisk({
    mutation: {
      onSuccess: () => {
        toast({ title: "Attention point recorded" });
        setShowForm(false);
        setForm({ title: "", description: "", category: "other", severity: "medium", source: "", assignedToName: "" });
        invalidate();
      },
      onError: () => toast({ title: "Could not record the attention point", variant: "destructive" }),
    },
  });

  return (
    <div className="space-y-4" data-testid="section-risks">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-heading font-bold flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-primary" /> Risks & Attention Points
        </h3>
        {canManage && (
          <Button size="sm" variant="outline" className="h-8 text-xs border-white/10" onClick={() => setShowForm((v) => !v)} data-testid="button-add-risk">
            <Plus className="w-3.5 h-3.5 mr-1" /> Record attention point
          </Button>
        )}
      </div>

      {showForm && (
        <form
          className="rounded-xl border border-white/10 bg-card/40 p-4 space-y-3"
          data-testid="form-add-risk"
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.title.trim()) return;
            createRisk.mutate({
              id: dealId,
              data: {
                title: form.title.trim(),
                description: form.description.trim() || undefined,
                category: form.category as (typeof RISK_CATEGORIES)[number],
                severity: form.severity as "critical" | "high" | "medium" | "low" | "informational",
                source: form.source.trim() || undefined,
                assignedToName: form.assignedToName.trim() || undefined,
              },
            });
          }}
        >
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Title</Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="h-8 text-sm bg-background/50 border-white/10" data-testid="input-risk-title" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Source</Label>
              <Input value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} placeholder="e.g. Document review" className="h-8 text-sm bg-background/50 border-white/10" data-testid="input-risk-source" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger className="h-8 text-sm bg-background/50 border-white/10" data-testid="select-risk-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RISK_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="text-sm capitalize">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Severity</Label>
              <Select value={form.severity} onValueChange={(v) => setForm((f) => ({ ...f, severity: v }))}>
                <SelectTrigger className="h-8 text-sm bg-background/50 border-white/10" data-testid="select-risk-severity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((s) => (
                    <SelectItem key={s.value} value={s.value} className="text-sm">{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Responsible (optional)</Label>
              <Input value={form.assignedToName} onChange={(e) => setForm((f) => ({ ...f, assignedToName: e.target.value }))} className="h-8 text-sm bg-background/50 border-white/10" data-testid="input-risk-assigned" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Description</Label>
            <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} className="text-sm bg-background/50 border-white/10" data-testid="input-risk-description" />
          </div>
          <Button type="submit" size="sm" disabled={createRisk.isPending || !form.title.trim()} data-testid="button-submit-risk">
            {createRisk.isPending ? "Saving…" : "Record"}
          </Button>
        </form>
      )}

      {isLoading ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : !risks || risks.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center border border-dashed border-white/10 rounded-xl">
          No attention points recorded for this deal.
        </p>
      ) : (
        <div className="space-y-3">
          {risks.map((risk) => (
            <RiskRow key={risk.id} risk={risk} dealId={dealId} canManage={canManage} onChanged={invalidate} />
          ))}
        </div>
      )}
    </div>
  );
}

function RiskRow({
  risk,
  dealId,
  canManage,
  onChanged,
}: {
  risk: DealRisk;
  dealId: number;
  canManage: boolean;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [showComments, setShowComments] = useState(false);
  const [comment, setComment] = useState("");
  const updateRisk = useUpdateDealRisk({
    mutation: {
      onSuccess: onChanged,
      onError: () => toast({ title: "Could not update the attention point", variant: "destructive" }),
    },
  });
  const addComment = useCreateRiskComment({
    mutation: {
      onSuccess: () => {
        setComment("");
        onChanged();
      },
      onError: () => toast({ title: "Could not add the comment", variant: "destructive" }),
    },
  });
  const statusLabel = RISK_STATUSES.find((s) => s.value === risk.status)?.label ?? risk.status;

  return (
    <div className="rounded-xl border border-white/5 bg-card/30 p-4 space-y-2" data-testid={`row-risk-${risk.id}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={`text-[10px] uppercase ${severityTone(risk.severity)}`}>{risk.severity}</Badge>
            <Badge variant="outline" className="text-[10px] uppercase border-white/10 text-muted-foreground">{risk.category}</Badge>
            <p className="font-medium text-sm">{risk.title}</p>
          </div>
          {risk.description && <p className="text-xs text-muted-foreground mt-1">{risk.description}</p>}
          <p className="text-[11px] text-muted-foreground mt-1">
            {risk.source ? `Source: ${risk.source} · ` : ""}
            {risk.assignedToName ? `Responsible: ${risk.assignedToName} · ` : ""}
            Raised by {risk.createdByName} on {new Date(risk.detectedAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManage ? (
            <Select value={risk.status} onValueChange={(v) => updateRisk.mutate({ id: risk.id, data: { status: v as DealRisk["status"] } })}>
              <SelectTrigger className="h-7 text-xs w-44 bg-background/50 border-white/10" data-testid={`select-risk-status-${risk.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RISK_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Badge variant="outline" className="text-[10px] uppercase border-white/10">{statusLabel}</Badge>
          )}
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => setShowComments((v) => !v)} data-testid={`button-risk-comments-${risk.id}`}>
            <MessageSquare className="w-3.5 h-3.5 mr-1" /> {risk.comments.length}
          </Button>
        </div>
      </div>
      {showComments && (
        <div className="pt-2 border-t border-white/5 space-y-2">
          {risk.comments.map((c) => (
            <div key={c.id} className="text-xs" data-testid={`row-risk-comment-${c.id}`}>
              <span className="font-medium">{c.authorName}</span>{" "}
              <span className="text-muted-foreground">{new Date(c.createdAt).toLocaleString()}</span>
              <p className="text-muted-foreground">{c.body}</p>
            </div>
          ))}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!comment.trim()) return;
              addComment.mutate({ id: risk.id, data: { body: comment.trim() } });
            }}
          >
            <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment…" className="h-8 text-xs bg-background/50 border-white/10" data-testid={`input-risk-comment-${risk.id}`} />
            <Button type="submit" size="sm" className="h-8 text-xs" disabled={addComment.isPending || !comment.trim()} data-testid={`button-add-risk-comment-${risk.id}`}>
              Post
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Document readiness panel (Data Room tab)
// ---------------------------------------------------------------------------

const ITEM_STATUSES = [
  { value: "available", label: "Available" },
  { value: "missing", label: "Missing" },
  { value: "outdated", label: "Outdated" },
  { value: "needs_signature", label: "Requires signature" },
  { value: "needs_review", label: "Requires professional review" },
] as const;

export function ReadinessPanel({ dealId }: { dealId: number }) {
  const { data, error } = useGetDealAdvisory(dealId, {
    query: { enabled: !!dealId, queryKey: getGetDealAdvisoryQueryKey(dealId), retry: false },
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const setStatus = useSetDealChecklistStatus({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetDealAdvisoryQueryKey(dealId) }),
      onError: () => toast({ title: "Could not update the checklist item", variant: "destructive" }),
    },
  });
  if (error || !data) return null;
  const { readiness, canManage } = data;
  if (readiness.templateId == null) {
    if (!canManage) return null;
    return (
      <div className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-muted-foreground" data-testid="panel-readiness-empty">
        <FileWarning className="w-4 h-4 inline mr-2 text-primary" />
        No document checklist template matches this deal yet. Configure one under{" "}
        <a href="/demo/checklist-templates" className="text-primary underline">checklist templates</a> to track document readiness.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-white/5 bg-card/30 p-4 space-y-3" data-testid="panel-readiness">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1.5">
          <ClipboardList className="w-3.5 h-3.5 text-primary" /> Document Readiness — {readiness.templateName}
        </p>
        <p className="text-sm font-heading font-semibold" data-testid="text-readiness-pct">{readiness.readinessPct}%</p>
      </div>
      <Progress value={readiness.readinessPct} className="h-1.5" />
      <div className="space-y-1.5">
        {readiness.items.map((item) => (
          <div key={item.itemId} className="flex items-center justify-between gap-2 text-sm" data-testid={`row-checklist-${item.itemId}`}>
            <div className="flex items-center gap-2 min-w-0">
              {item.status === "available" ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-orange-400 shrink-0" />
              )}
              <span className="truncate">{item.name}</span>
              <span className="text-[10px] text-muted-foreground uppercase">{item.category}{item.required ? "" : " · optional"}</span>
            </div>
            {canManage ? (
              <Select
                value={item.status}
                onValueChange={(v) =>
                  setStatus.mutate({ id: dealId, data: { templateItemId: item.itemId, status: v as (typeof ITEM_STATUSES)[number]["value"] } })
                }
              >
                <SelectTrigger className="h-7 text-xs w-52 bg-background/50 border-white/10" data-testid={`select-checklist-status-${item.itemId}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ITEM_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Badge variant="outline" className="text-[10px] uppercase border-white/10 text-muted-foreground">
                {ITEM_STATUSES.find((s) => s.value === item.status)?.label ?? item.status}
              </Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline tab
// ---------------------------------------------------------------------------

export function TimelineTab({ dealId }: { dealId: number }) {
  const { data: events, isLoading, error } = useGetDealTimeline(dealId, {
    query: { enabled: !!dealId, queryKey: getGetDealTimelineQueryKey(dealId), retry: false },
  });
  if (isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (error || !events) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        The transaction timeline is available once you have access to this deal.
      </p>
    );
  }
  return (
    <div className="space-y-0" data-testid="tab-content-timeline">
      <h3 className="text-xl font-heading font-bold mb-4">Transaction Timeline</h3>
      {events.length === 0 && <p className="text-sm text-muted-foreground">No recorded events yet.</p>}
      <div className="relative pl-6">
        <div className="absolute left-2 top-1 bottom-1 w-px bg-white/10" />
        {events.map((event: TimelineEvent, i) => (
          <div key={i} className="relative pb-5" data-testid={`row-timeline-${i}`}>
            <div className="absolute -left-4 top-1 w-2.5 h-2.5 rounded-full bg-primary/70 border border-background" />
            <p className="text-sm font-medium">{event.title}</p>
            <p className="text-xs text-muted-foreground">
              {event.detail ? `${event.detail} · ` : ""}
              {new Date(event.occurredAt).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Placeholder tab for not-yet-built sections
// ---------------------------------------------------------------------------

export function PlaceholderTab({ title, description }: { title: string; description: string }) {
  return (
    <div className="py-16 text-center border border-dashed border-white/10 rounded-xl" data-testid={`tab-placeholder-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
      <Info className="w-6 h-6 text-primary/50 mx-auto mb-3" />
      <p className="font-heading font-semibold text-lg mb-1">{title}</p>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">{description}</p>
    </div>
  );
}

export type { DealAdvisoryResponse };
