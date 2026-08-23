import { useState } from "react";
import {
  useGetDealDdCenter,
  getGetDealDdCenterQueryKey,
  useCreateDdItem,
  useUpdateDdItem,
  useUpdateDdWorkstream,
  useListDealQuestions,
  getListDealQuestionsQueryKey,
  useCreateDealQuestion,
  useUpdateDealQuestion,
  useListDealAiFindings,
  getListDealAiFindingsQueryKey,
  useClassifyAiFinding,
  getGetDealAdvisoryQueryKey,
} from "@workspace/api-client-react";
import type {
  DdWorkstream,
  DdItem,
  DealQuestion,
  AiFinding,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Lock,
  Plus,
  X,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  MessageSquare,
  FileSearch,
  ShieldCheck,
} from "lucide-react";

function LockedNotice({ label, testid }: { label: string; testid: string }) {
  return (
    <div className="border border-border rounded-xl p-8 text-center" data-testid={testid}>
      <Lock className="w-6 h-6 mx-auto mb-3 text-muted-foreground" />
      <p className="text-sm text-muted-foreground max-w-md mx-auto">{label}</p>
    </div>
  );
}

const WS_STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  completed: "Completed",
};

const ITEM_STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  waiting: "Waiting",
  done: "Done",
  na: "N/A",
};

const ITEM_STATUSES = ["open", "in_progress", "waiting", "done", "na"] as const;
const WS_STATUSES = ["not_started", "in_progress", "blocked", "completed"] as const;

const Q_STATUS_LABEL: Record<string, string> = {
  open: "Open",
  assigned: "Assigned",
  answered: "Answered",
  follow_up: "Follow-up",
  closed: "Closed",
};

const Q_STATUS_CLASS: Record<string, string> = {
  open: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  assigned: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  answered: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  follow_up: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  closed: "bg-white/5 text-muted-foreground border-white/10",
};

const CLASSIFICATIONS = [
  { value: "confirmed", label: "Confirmed" },
  { value: "not_relevant", label: "Not Relevant" },
  { value: "needs_more_information", label: "Needs More Information" },
  { value: "material_risk", label: "Material Risk" },
  { value: "minor_risk", label: "Minor Risk" },
  { value: "resolved", label: "Resolved" },
] as const;

const CLASSIFICATION_CLASS: Record<string, string> = {
  confirmed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  not_relevant: "bg-white/5 text-muted-foreground border-white/10",
  needs_more_information: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  material_risk: "bg-red-500/15 text-red-300 border-red-500/30",
  minor_risk: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  resolved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
};

function classificationLabel(v: string | null | undefined): string {
  return CLASSIFICATIONS.find((c) => c.value === v)?.label ?? "Unreviewed";
}

// ---------------------------------------------------------------------------
// Due Diligence tab
// ---------------------------------------------------------------------------
export function DueDiligenceTab({ dealId }: { dealId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const ddKey = getGetDealDdCenterQueryKey(dealId);
  const { data, isLoading, error } = useGetDealDdCenter(dealId, {
    query: { enabled: !!dealId, queryKey: ddKey, retry: false },
  });
  const updateItem = useUpdateDdItem();
  const updateWorkstream = useUpdateDdWorkstream();
  const createItem = useCreateDdItem();
  const [openWs, setOpenWs] = useState<number | null>(null);
  const [newItemWs, setNewItemWs] = useState<number | null>(null);
  const [newItemTitle, setNewItemTitle] = useState("");

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error || !data) {
    return (
      <LockedNotice
        testid="notice-dd-locked"
        label="The Due Diligence center requires granted access to this deal. Request access and sign the NDA to view workstreams, checklists and findings."
      />
    );
  }

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ddKey });
    queryClient.invalidateQueries({ queryKey: getGetDealAdvisoryQueryKey(dealId) });
  };

  const setItemStatus = (item: DdItem, status: (typeof ITEM_STATUSES)[number]) => {
    updateItem.mutate(
      { id: item.id, data: { status } },
      {
        onSuccess: invalidate,
        onError: (e: unknown) =>
          toast({
            title: "Item not updated",
            description: e instanceof Error ? e.message : "You may not have permission to update this item.",
            variant: "destructive",
          }),
      },
    );
  };

  const addItem = (ws: DdWorkstream) => {
    if (newItemTitle.trim().length === 0) return;
    createItem.mutate(
      { id: dealId, data: { workstreamId: ws.id, title: newItemTitle.trim() } },
      {
        onSuccess: () => {
          setNewItemTitle("");
          setNewItemWs(null);
          invalidate();
        },
        onError: (e: unknown) =>
          toast({
            title: "Item not added",
            description: e instanceof Error ? e.message : "Only the deal manager can add items.",
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <div className="space-y-4" data-testid="tab-dd">
      <div className="rounded-xl border border-white/5 bg-card/30 backdrop-blur p-4" data-testid="panel-dd-progress">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" /> Due Diligence progress
          </h4>
          <span className="text-2xl font-semibold tabular-nums" data-testid="text-dd-completion">
            {data.completionPct}<span className="text-sm text-muted-foreground">%</span>
          </span>
        </div>
        <div className="h-1.5 rounded bg-border overflow-hidden mt-2">
          <div className="h-full bg-primary" style={{ width: `${data.completionPct}%` }} />
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          Checklist completion across all workstreams. Progress feeds the deal's health score and transaction readiness.
        </p>
      </div>

      {data.workstreams.map((ws) => {
        const isOpen = openWs === ws.id;
        return (
          <div key={ws.id} className="rounded-xl border border-white/5 bg-card/30 backdrop-blur" data-testid={`card-workstream-${ws.key}`}>
            <button
              className="w-full flex items-center gap-3 p-4 text-left"
              onClick={() => setOpenWs(isOpen ? null : ws.id)}
              data-testid={`btn-toggle-workstream-${ws.key}`}
            >
              {isOpen ? <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{ws.label}</span>
                  <Badge variant="outline" className="text-[10px]">{WS_STATUS_LABEL[ws.status] ?? ws.status}</Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {ws.responsible
                    ? `Responsible: ${ws.responsible.name ?? ws.responsible.role.replace(/_/g, " ")}${ws.responsible.company ? ` (${ws.responsible.company})` : ""}`
                    : "No responsible professional appointed"}
                  {" · "}{ws.documentsCount} document{ws.documentsCount === 1 ? "" : "s"}
                  {" · "}{ws.openQuestions} open question{ws.openQuestions === 1 ? "" : "s"}
                  {" · "}{ws.findingsCount} finding{ws.findingsCount === 1 ? "" : "s"}
                </p>
              </div>
              <div className="w-28 shrink-0">
                <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                  <span>Complete</span>
                  <span className="tabular-nums" data-testid={`text-ws-completion-${ws.key}`}>{ws.completionPct}%</span>
                </div>
                <div className="h-1.5 rounded bg-border overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${ws.completionPct}%` }} />
                </div>
              </div>
            </button>
            {isOpen && (
              <div className="px-4 pb-4 space-y-2">
                {data.canManage && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      className="bg-card border border-border rounded-md text-xs px-2 py-1.5"
                      value={ws.status}
                      onChange={(e) =>
                        updateWorkstream.mutate(
                          { id: ws.id, data: { status: e.target.value as (typeof WS_STATUSES)[number] } },
                          { onSuccess: invalidate },
                        )
                      }
                      data-testid={`select-ws-status-${ws.key}`}
                    >
                      {WS_STATUSES.map((s) => (
                        <option key={s} value={s}>{WS_STATUS_LABEL[s]}</option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setNewItemWs(newItemWs === ws.id ? null : ws.id); setNewItemTitle(""); }}
                      data-testid={`btn-add-item-${ws.key}`}
                    >
                      {newItemWs === ws.id ? <X className="w-3.5 h-3.5 mr-1" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
                      {newItemWs === ws.id ? "Cancel" : "Add item"}
                    </Button>
                  </div>
                )}
                {newItemWs === ws.id && (
                  <div className="flex gap-2">
                    <Input
                      value={newItemTitle}
                      placeholder="Checklist item title"
                      onChange={(e) => setNewItemTitle(e.target.value)}
                      data-testid={`input-new-item-${ws.key}`}
                    />
                    <Button size="sm" onClick={() => addItem(ws)} disabled={createItem.isPending} data-testid={`btn-save-item-${ws.key}`}>
                      Save
                    </Button>
                  </div>
                )}
                {ws.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground border border-dashed border-white/10 rounded-lg p-4 text-center">
                    No checklist items in this workstream yet.
                  </p>
                ) : (
                  ws.items.map((item) => {
                    const done = item.status === "done" || item.status === "na";
                    return (
                      <div key={item.id} className="rounded-lg border border-white/10 p-3 flex items-start gap-3" data-testid={`row-dd-item-${item.id}`}>
                        {done ? (
                          <CircleCheck className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" />
                        ) : (
                          <CircleDashed className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${done ? "text-muted-foreground line-through" : ""}`}>
                            {item.title}
                            {item.required && <span className="ml-1.5 text-[10px] uppercase tracking-wider text-amber-400/80">required</span>}
                          </p>
                          {item.description && <p className="text-[11px] text-muted-foreground mt-0.5">{item.description}</p>}
                          {item.note && <p className="text-[11px] text-muted-foreground mt-0.5">Note: {item.note}</p>}
                          {item.documentName && <p className="text-[11px] text-primary mt-0.5">Linked: {item.documentName}</p>}
                          {item.updatedByName && <p className="text-[10px] text-muted-foreground mt-0.5">Last update by {item.updatedByName}</p>}
                        </div>
                        <select
                          className="bg-card border border-border rounded-md text-xs px-2 py-1.5 shrink-0"
                          value={item.status}
                          disabled={updateItem.isPending || !ws.canUpdateItems}
                          onChange={(e) => setItemStatus(item, e.target.value as (typeof ITEM_STATUSES)[number])}
                          data-testid={`select-item-status-${item.id}`}
                        >
                          {ITEM_STATUSES.map((s) => (
                            <option key={s} value={s}>{ITEM_STATUS_LABEL[s]}</option>
                          ))}
                        </select>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Q&A tab
// ---------------------------------------------------------------------------
export function QaTab({ dealId, workstreamKeys }: { dealId: number; workstreamKeys?: string[] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const qKey = getListDealQuestionsQueryKey(dealId);
  const { data: questions, isLoading, error } = useListDealQuestions(dealId, {
    query: { enabled: !!dealId, queryKey: qKey, retry: false },
  });
  const { data: dd } = useGetDealDdCenter(dealId, {
    query: { enabled: !!dealId && !error, queryKey: getGetDealDdCenterQueryKey(dealId), retry: false },
  });
  const createQuestion = useCreateDealQuestion();
  const updateQuestion = useUpdateDealQuestion();
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState("");
  const [text, setText] = useState("");
  const [answerFor, setAnswerFor] = useState<number | null>(null);
  const [answerText, setAnswerText] = useState("");

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error) {
    return (
      <LockedNotice
        testid="notice-qa-locked"
        label="Deal Q&A requires granted access to this deal. Request access and sign the NDA to ask questions and read answers."
      />
    );
  }

  const categories =
    workstreamKeys ?? dd?.workstreams.map((w) => w.key) ?? ["financial", "legal", "tax", "technical", "commercial", "environmental", "operational"];
  const canManage = dd?.canManage ?? false;
  const invalidate = () => queryClient.invalidateQueries({ queryKey: qKey });

  const ask = () => {
    if (text.trim().length < 5 || !category) {
      toast({ title: "Question incomplete", description: "Pick a category and write your question.", variant: "destructive" });
      return;
    }
    createQuestion.mutate(
      { id: dealId, data: { category, question: text.trim() } },
      {
        onSuccess: () => {
          setText("");
          setShowForm(false);
          invalidate();
          toast({ title: "Question submitted", description: "The deal manager has been notified." });
        },
        onError: (e: unknown) =>
          toast({ title: "Question not submitted", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" }),
      },
    );
  };

  const answer = (q: DealQuestion) => {
    if (answerText.trim().length === 0) return;
    updateQuestion.mutate(
      { id: q.id, data: { answerText: answerText.trim() } },
      {
        onSuccess: () => {
          setAnswerFor(null);
          setAnswerText("");
          invalidate();
        },
        onError: (e: unknown) =>
          toast({ title: "Answer not saved", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" }),
      },
    );
  };

  const transition = (q: DealQuestion, status: "follow_up" | "closed") => {
    updateQuestion.mutate(
      { id: q.id, data: { status } },
      {
        onSuccess: invalidate,
        onError: (e: unknown) =>
          toast({ title: "Not updated", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" }),
      },
    );
  };

  return (
    <div className="space-y-4" data-testid="tab-qa">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" /> Structured Q&A
        </h4>
        <Button size="sm" variant="outline" onClick={() => setShowForm((v) => !v)} data-testid="btn-new-question">
          {showForm ? <X className="w-4 h-4 mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
          {showForm ? "Cancel" : "Ask a question"}
        </Button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-white/5 bg-card/30 backdrop-blur p-4 space-y-3" data-testid="form-question">
          <div>
            <Label className="text-xs">Category</Label>
            <select
              className="w-full bg-card border border-border rounded-md text-sm px-2 py-2 mt-1"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              data-testid="select-question-category"
            >
              <option value="">Select a workstream…</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Question</Label>
            <textarea
              className="w-full bg-card border border-border rounded-md text-sm p-2 mt-1 min-h-20"
              value={text}
              placeholder="e.g. Are there any pending litigations affecting the asset?"
              onChange={(e) => setText(e.target.value)}
              data-testid="input-question-text"
            />
          </div>
          <Button size="sm" onClick={ask} disabled={createQuestion.isPending} data-testid="btn-submit-question">
            Submit question
          </Button>
        </div>
      )}

      {(questions ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground border border-dashed border-white/10 rounded-xl p-6 text-center" data-testid="notice-no-questions">
          No questions have been asked on this deal yet. Use structured Q&A to keep every answer auditable and visible to all granted parties.
        </p>
      ) : (
        (questions ?? []).map((q) => (
          <div key={q.id} className="rounded-xl border border-white/5 bg-card/30 backdrop-blur p-4 space-y-2" data-testid={`card-question-${q.id}`}>
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-medium">{q.question}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {q.category.replace(/_/g, " ")}
                  {q.askedByName ? ` · asked by ${q.askedByName}` : ""}
                  {q.assignedToName ? ` · assigned to ${q.assignedToName}` : q.assignedParty ? ` · assigned to ${q.assignedParty}` : ""}
                </p>
              </div>
              <Badge variant="outline" className={`text-[10px] ${Q_STATUS_CLASS[q.status] ?? ""}`} data-testid={`badge-question-status-${q.id}`}>
                {Q_STATUS_LABEL[q.status] ?? q.status}
              </Badge>
            </div>
            {q.detail && <p className="text-xs text-muted-foreground">{q.detail}</p>}
            {q.answerText && (
              <div className="rounded-lg border border-white/10 bg-card/40 p-3" data-testid={`text-answer-${q.id}`}>
                <p className="text-xs">{q.answerText}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Answered{q.answeredByName ? ` by ${q.answeredByName}` : ""}
                  {q.answeredAt ? ` on ${new Date(q.answeredAt).toLocaleDateString()}` : ""}
                  {q.answerDocumentName ? ` · document: ${q.answerDocumentName}` : ""}
                </p>
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              {canManage && q.status !== "closed" && (
                <Button size="sm" variant="outline" onClick={() => { setAnswerFor(answerFor === q.id ? null : q.id); setAnswerText(""); }} data-testid={`btn-answer-${q.id}`}>
                  {answerFor === q.id ? "Cancel" : q.answerText ? "Update answer" : "Answer"}
                </Button>
              )}
              {q.isOwn && q.status === "answered" && (
                <Button size="sm" variant="ghost" onClick={() => transition(q, "follow_up")} data-testid={`btn-follow-up-${q.id}`}>
                  Needs follow-up
                </Button>
              )}
              {(canManage || q.isOwn) && q.status !== "closed" && q.answerText && (
                <Button size="sm" variant="ghost" onClick={() => transition(q, "closed")} data-testid={`btn-close-question-${q.id}`}>
                  Close
                </Button>
              )}
            </div>
            {answerFor === q.id && (
              <div className="space-y-2">
                <textarea
                  className="w-full bg-card border border-border rounded-md text-sm p-2 min-h-16"
                  value={answerText}
                  placeholder="Write the answer…"
                  onChange={(e) => setAnswerText(e.target.value)}
                  data-testid={`input-answer-${q.id}`}
                />
                <Button size="sm" onClick={() => answer(q)} disabled={updateQuestion.isPending} data-testid={`btn-save-answer-${q.id}`}>
                  Save answer
                </Button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Professional Reviews tab
// ---------------------------------------------------------------------------
export function ReviewsTab({ dealId }: { dealId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const findingsKey = getListDealAiFindingsQueryKey(dealId);
  const { data: findings, isLoading, error } = useListDealAiFindings(dealId, {
    query: { enabled: !!dealId, queryKey: findingsKey, retry: false },
  });
  const classify = useClassifyAiFinding();
  const [openId, setOpenId] = useState<number | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [note, setNote] = useState("");

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error) {
    return (
      <LockedNotice
        testid="notice-reviews-locked"
        label="Professional reviews require access to this deal's analysis findings."
      />
    );
  }

  const submit = (finding: AiFinding) => {
    if (!selected) return;
    classify.mutate(
      {
        id: finding.id,
        data: {
          classification: selected as (typeof CLASSIFICATIONS)[number]["value"],
          note: note.trim() === "" ? null : note.trim(),
        },
      },
      {
        onSuccess: () => {
          setOpenId(null);
          setSelected("");
          setNote("");
          queryClient.invalidateQueries({ queryKey: findingsKey });
          toast({ title: "Finding classified", description: "The classification has been recorded in the audit trail." });
        },
        onError: (e: unknown) =>
          toast({
            title: "Classification failed",
            description: e instanceof Error ? e.message : "Only the deal manager or an appointed professional can classify findings.",
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <div className="space-y-4" data-testid="tab-reviews">
      <div className="flex items-center gap-2">
        <FileSearch className="w-4 h-4 text-primary" />
        <h4 className="text-sm font-medium">Professional review of analysis findings</h4>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Appointed professionals and the deal manager classify each automated finding so buyers know what has been verified by a human expert.
      </p>
      {(findings ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground border border-dashed border-white/10 rounded-xl p-6 text-center" data-testid="notice-no-findings">
          No analysis findings to review yet. Run a document analysis from the Intelligence tab first.
        </p>
      ) : (
        (findings ?? []).map((f) => (
          <div key={f.id} className="rounded-xl border border-white/5 bg-card/30 backdrop-blur p-4 space-y-2" data-testid={`card-review-finding-${f.id}`}>
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-medium">{f.title}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {f.category.replace(/_/g, " ")}
                  {f.documentName ? ` · ${f.documentName}` : ""}
                  {f.severity ? ` · severity: ${f.severity}` : ""}
                </p>
              </div>
              <Badge
                variant="outline"
                className={`text-[10px] ${f.classification ? CLASSIFICATION_CLASS[f.classification] ?? "" : "bg-white/5 text-muted-foreground border-white/10"}`}
                data-testid={`badge-classification-${f.id}`}
              >
                {classificationLabel(f.classification)}
              </Badge>
            </div>
            {f.detail && <p className="text-xs text-muted-foreground">{f.detail}</p>}
            {f.classification && (
              <p className="text-[11px] text-muted-foreground" data-testid={`text-classification-meta-${f.id}`}>
                Classified{f.classifiedByName ? ` by ${f.classifiedByName}` : ""}
                {f.classifiedAt ? ` on ${new Date(f.classifiedAt).toLocaleDateString()}` : ""}
                {f.classificationNote ? ` — ${f.classificationNote}` : ""}
                {f.classificationDocumentName ? ` · attachment: ${f.classificationDocumentName}` : ""}
              </p>
            )}
            <div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setOpenId(openId === f.id ? null : f.id);
                  setSelected(f.classification ?? "");
                  setNote(f.classificationNote ?? "");
                }}
                data-testid={`btn-classify-${f.id}`}
              >
                {openId === f.id ? "Cancel" : f.classification ? "Reclassify" : "Classify"}
              </Button>
            </div>
            {openId === f.id && (
              <div className="space-y-2 pt-1">
                <div className="flex gap-2 flex-wrap">
                  {CLASSIFICATIONS.map((c) => (
                    <button
                      key={c.value}
                      className={`text-xs px-2.5 py-1.5 rounded-md border ${selected === c.value ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
                      onClick={() => setSelected(c.value)}
                      data-testid={`btn-classification-${c.value}-${f.id}`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                <textarea
                  className="w-full bg-card border border-border rounded-md text-sm p-2 min-h-16"
                  value={note}
                  placeholder="Reviewer note (optional)…"
                  onChange={(e) => setNote(e.target.value)}
                  data-testid={`input-classification-note-${f.id}`}
                />
                <Button size="sm" onClick={() => submit(f)} disabled={classify.isPending || !selected} data-testid={`btn-save-classification-${f.id}`}>
                  Save classification
                </Button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
