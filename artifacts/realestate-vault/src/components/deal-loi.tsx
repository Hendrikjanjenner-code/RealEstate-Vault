import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetLoiDraft,
  getGetLoiDraftQueryKey,
  useListDealLois,
  getListDealLoisQueryKey,
  useSubmitLoi,
  useUpdateLoiStatus,
  useCounterLoi,
  useRespondToLoiCounter,
  type Loi,
  type LoiCounter,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { FileText, Download, ScrollText } from "lucide-react";

const STATUS_STYLE: Record<string, string> = {
  submitted: "border-primary/40 text-primary",
  under_review: "border-amber-400/40 text-amber-300",
  countered: "border-sky-400/40 text-sky-300",
  accepted: "border-emerald-400/40 text-emerald-300",
  rejected: "border-red-400/40 text-red-300",
  withdrawn: "border-white/20 text-muted-foreground",
  proposed: "border-sky-400/40 text-sky-300",
  superseded: "border-white/20 text-muted-foreground",
};

function terms(t: {
  currency: string;
  offerPrice: number;
  exclusivityDays: number;
  validityDays: number;
}): string {
  return `${t.currency} ${t.offerPrice.toLocaleString("en-US")} · exclusivity ${t.exclusivityDays}d · valid ${t.validityDays}d`;
}

/** Version history of an LOI: original terms plus every counter, verbatim. */
function LoiHistory({ loi }: { loi: Loi }) {
  const counters = loi.counters ?? [];
  if (counters.length === 0) return null;
  return (
    <div className="space-y-1.5 pt-1 border-t border-white/5" data-testid={`history-loi-${loi.id}`}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Version history</p>
      <ul className="space-y-1">
        {counters.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2 text-xs text-muted-foreground" data-testid={`row-counter-${c.id}`}>
            <span className="truncate">Counter — {terms(c)}{c.conditions ? ` · ${c.conditions}` : ""}</span>
            <LoiStatusBadge status={c.status} />
          </li>
        ))}
        <li className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate">Original LOI — {terms(loi)}</span>
          <span className="text-[10px] uppercase tracking-wider">v1</span>
        </li>
      </ul>
    </div>
  );
}

function LoiStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={`text-[10px] uppercase tracking-wider font-semibold ${STATUS_STYLE[status] ?? "border-white/20 text-muted-foreground"}`}
      data-testid={`badge-loi-status-${status}`}
    >
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

function recordUrl(loiId: number, download = false): string {
  const base = import.meta.env.BASE_URL;
  return `${base}api/lois/${loiId}/record${download ? "?download=1" : ""}`;
}

/**
 * Letter of Intent step on the deal page.
 * - Investors with a signed NDA can open a pre-generated LOI draft, fill in
 *   their terms and submit; the exact text is preserved server-side.
 * - The deal manager sees all submitted LOIs and moves them through
 *   under review → accepted/rejected.
 */
export function DealLoiPanel({
  dealId,
  ndaSigned,
}: {
  dealId: number;
  ndaSigned: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [preparing, setPreparing] = useState(false);
  const [offerPrice, setOfferPrice] = useState("");
  const [conditions, setConditions] = useState("");
  const [exclusivityDays, setExclusivityDays] = useState("");
  const [validityDays, setValidityDays] = useState("");

  const { data: loiData } = useListDealLois(dealId, {
    query: { queryKey: getListDealLoisQueryKey(dealId) },
  });
  const { data: draft } = useGetLoiDraft(dealId, {
    query: {
      enabled: ndaSigned && preparing,
      queryKey: getGetLoiDraftQueryKey(dealId),
    },
  });
  const submitLoi = useSubmitLoi();
  const updateStatus = useUpdateLoiStatus();
  const counterLoi = useCounterLoi();
  const respondToCounter = useRespondToLoiCounter();
  // Which LOI the manager is drafting a counter for, plus its form fields.
  const [counteringId, setCounteringId] = useState<number | null>(null);
  const [counterPrice, setCounterPrice] = useState("");
  const [counterConditions, setCounterConditions] = useState("");
  const [counterExclusivity, setCounterExclusivity] = useState("");
  const [counterValidity, setCounterValidity] = useState("");

  const canManage = loiData?.canManage ?? false;
  const lois = loiData?.lois ?? [];
  const myOpenLoi = !canManage
    ? lois.find((l) => l.status !== "rejected" && l.status !== "withdrawn")
    : undefined;
  const myOpenCounter = myOpenLoi?.status === "countered"
    ? (myOpenLoi.counters ?? []).find((c) => c.status === "proposed")
    : undefined;

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListDealLoisQueryKey(dealId) });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const price = Number(offerPrice);
    const excl = Number(exclusivityDays || draft?.defaults.exclusivityDays);
    const val = Number(validityDays || draft?.defaults.validityDays);
    if (!Number.isFinite(price) || price <= 0) {
      toast({ title: "Invalid offer", description: "Enter a valid offered price.", variant: "destructive" });
      return;
    }
    submitLoi.mutate(
      {
        id: dealId,
        data: {
          offerPrice: price,
          conditions: conditions.trim() || undefined,
          exclusivityDays: excl,
          validityDays: val,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "LOI Submitted", description: "The deal manager has been notified of your Letter of Intent." });
          setPreparing(false);
          invalidate();
        },
        onError: () => {
          toast({ title: "Submission failed", description: "Please review your terms and try again.", variant: "destructive" });
        },
      },
    );
  };

  const handleCounter = (loi: Loi) => {
    const price = Number(counterPrice);
    const excl = Number(counterExclusivity || loi.exclusivityDays);
    const val = Number(counterValidity || loi.validityDays);
    if (!Number.isFinite(price) || price <= 0) {
      toast({ title: "Invalid counter", description: "Enter a valid counter price.", variant: "destructive" });
      return;
    }
    counterLoi.mutate(
      {
        id: loi.id,
        data: {
          offerPrice: price,
          conditions: counterConditions.trim() || undefined,
          exclusivityDays: excl,
          validityDays: val,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Counterproposal sent", description: "The investor has been notified of your counterproposal." });
          setCounteringId(null);
          setCounterPrice("");
          setCounterConditions("");
          setCounterExclusivity("");
          setCounterValidity("");
          invalidate();
        },
        onError: () => toast({ title: "Counter failed", description: "Could not issue the counterproposal.", variant: "destructive" }),
      },
    );
  };

  const respond = (counter: LoiCounter, action: "accept" | "withdraw") => {
    respondToCounter.mutate(
      { id: counter.id, data: { action } },
      {
        onSuccess: () => {
          toast(
            action === "accept"
              ? { title: "Counter accepted", description: "The agreed terms are those of the counterproposal." }
              : { title: "LOI withdrawn", description: "Your Letter of Intent has been withdrawn." },
          );
          invalidate();
        },
        onError: () => toast({ title: "Response failed", description: "Could not respond to the counterproposal.", variant: "destructive" }),
      },
    );
  };

  const transition = (loi: Loi, status: "under_review" | "accepted" | "rejected") => {
    updateStatus.mutate(
      { id: loi.id, data: { status } },
      {
        onSuccess: () => invalidate(),
        onError: () => toast({ title: "Update failed", description: "Could not update the LOI status.", variant: "destructive" }),
      },
    );
  };

  // Nothing to show: not the manager, NDA not signed, and no own LOI.
  if (!canManage && !ndaSigned && lois.length === 0) return null;

  return (
    <div className="p-4 rounded-xl bg-background border border-white/10 space-y-4" data-testid="panel-loi">
      <div className="flex items-center gap-2">
        <ScrollText className="w-4 h-4 text-primary" />
        <h4 className="font-heading font-semibold text-sm uppercase tracking-wider">
          {canManage ? "Letters of Intent" : "Letter of Intent"}
        </h4>
      </div>

      {/* Manager: review submitted LOIs */}
      {canManage &&
        (lois.length === 0 ? (
          <p className="text-xs text-muted-foreground">No LOIs submitted yet.</p>
        ) : (
          <ul className="space-y-3">
            {lois.map((loi) => (
              <li key={loi.id} className="p-3 rounded-lg bg-card/50 border border-white/5 space-y-2" data-testid={`card-loi-${loi.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{loi.investorName}</p>
                    <p className="text-xs text-muted-foreground truncate">{loi.investorCompany}</p>
                  </div>
                  <LoiStatusBadge status={loi.status} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Offer {terms(loi)}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs border border-white/10">
                    <a href={recordUrl(loi.id)} target="_blank" rel="noreferrer" data-testid={`link-loi-record-${loi.id}`}>
                      <FileText className="w-3 h-3 mr-1" /> View
                    </a>
                  </Button>
                  {loi.status === "submitted" && (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs border border-amber-400/30 text-amber-300" onClick={() => transition(loi, "under_review")} data-testid={`button-loi-review-${loi.id}`}>
                      Start review
                    </Button>
                  )}
                  {(loi.status === "submitted" || loi.status === "under_review") && (
                    <>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs border border-emerald-400/30 text-emerald-300" onClick={() => transition(loi, "accepted")} data-testid={`button-loi-accept-${loi.id}`}>
                        Accept
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs border border-red-400/30 text-red-300" onClick={() => transition(loi, "rejected")} data-testid={`button-loi-reject-${loi.id}`}>
                        Reject
                      </Button>
                    </>
                  )}
                  {(loi.status === "submitted" || loi.status === "under_review" || loi.status === "countered") && counteringId !== loi.id && (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs border border-sky-400/30 text-sky-300" onClick={() => { setCounteringId(loi.id); setCounterPrice(""); setCounterConditions(""); setCounterExclusivity(""); setCounterValidity(""); }} data-testid={`button-loi-counter-${loi.id}`}>
                      {loi.status === "countered" ? "New counter" : "Counter"}
                    </Button>
                  )}
                  {loi.status === "countered" && (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs border border-red-400/30 text-red-300" onClick={() => transition(loi, "rejected")} data-testid={`button-loi-reject-${loi.id}`}>
                      Reject
                    </Button>
                  )}
                </div>
                {counteringId === loi.id && (
                  <form
                    className="space-y-2 p-2 rounded-md bg-background/60 border border-sky-400/20"
                    onSubmit={(e) => { e.preventDefault(); handleCounter(loi); }}
                    data-testid={`form-counter-${loi.id}`}
                  >
                    <p className="text-[10px] uppercase tracking-wider text-sky-300 font-semibold">Counterproposal</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label htmlFor={`counter-price-${loi.id}`} className="text-[10px] uppercase tracking-wider text-muted-foreground">Price ({loi.currency})</Label>
                        <Input id={`counter-price-${loi.id}`} required type="number" min="1" value={counterPrice} onChange={(e) => setCounterPrice(e.target.value)} placeholder={String(loi.offerPrice)} className="h-8 bg-background/50 border-white/10 text-xs" data-testid={`input-counter-price-${loi.id}`} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`counter-excl-${loi.id}`} className="text-[10px] uppercase tracking-wider text-muted-foreground">Exclusivity (d)</Label>
                        <Input id={`counter-excl-${loi.id}`} type="number" min="1" max="365" value={counterExclusivity} onChange={(e) => setCounterExclusivity(e.target.value)} placeholder={String(loi.exclusivityDays)} className="h-8 bg-background/50 border-white/10 text-xs" data-testid={`input-counter-exclusivity-${loi.id}`} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`counter-valid-${loi.id}`} className="text-[10px] uppercase tracking-wider text-muted-foreground">Validity (d)</Label>
                        <Input id={`counter-valid-${loi.id}`} type="number" min="1" max="180" value={counterValidity} onChange={(e) => setCounterValidity(e.target.value)} placeholder={String(loi.validityDays)} className="h-8 bg-background/50 border-white/10 text-xs" data-testid={`input-counter-validity-${loi.id}`} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`counter-cond-${loi.id}`} className="text-[10px] uppercase tracking-wider text-muted-foreground">Amended conditions (optional)</Label>
                      <Input id={`counter-cond-${loi.id}`} value={counterConditions} onChange={(e) => setCounterConditions(e.target.value)} placeholder="e.g. shorter exclusivity, no financing condition" className="h-8 bg-background/50 border-white/10 text-xs" data-testid={`input-counter-conditions-${loi.id}`} />
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant="ghost" className="h-7 flex-1 text-xs border border-white/10" onClick={() => setCounteringId(null)}>Cancel</Button>
                      <Button type="submit" size="sm" disabled={counterLoi.isPending || !counterPrice} className="h-7 flex-1 text-xs bg-sky-500/90 text-white hover:bg-sky-500 font-bold" data-testid={`button-send-counter-${loi.id}`}>
                        {counterLoi.isPending ? "Sending..." : "Send counter"}
                      </Button>
                    </div>
                  </form>
                )}
                <LoiHistory loi={loi} />
              </li>
            ))}
          </ul>
        ))}

      {/* Investor: own LOI status */}
      {!canManage && myOpenLoi && (
        <div className="space-y-2" data-testid="card-my-loi">
          <div className="flex items-center justify-between">
            <p className="text-sm">Submitted {new Date(myOpenLoi.submittedAt).toLocaleDateString()}</p>
            <LoiStatusBadge status={myOpenLoi.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            Offer {terms(myOpenLoi)}
          </p>
          {myOpenCounter && (
            <div className="space-y-2 p-3 rounded-lg bg-sky-500/5 border border-sky-400/20" data-testid="card-counter-offer">
              <p className="text-[10px] uppercase tracking-wider text-sky-300 font-semibold">Counterproposal from the deal manager</p>
              <p className="text-xs text-foreground">{terms(myOpenCounter)}</p>
              {myOpenCounter.conditions && (
                <p className="text-xs text-muted-foreground">Conditions: {myOpenCounter.conditions}</p>
              )}
              <div className="p-2 rounded-md bg-background/60 border border-white/5 max-h-36 overflow-y-auto text-xs text-muted-foreground leading-relaxed space-y-1.5">
                {myOpenCounter.documentText.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
              <div className="flex gap-2">
                <Button size="sm" disabled={respondToCounter.isPending} onClick={() => respond(myOpenCounter, "accept")} className="h-8 flex-1 text-xs bg-emerald-500/90 text-white hover:bg-emerald-500 font-bold" data-testid="button-accept-counter">
                  {respondToCounter.isPending ? "Working..." : "Accept counter"}
                </Button>
                <Button size="sm" variant="ghost" disabled={respondToCounter.isPending} onClick={() => respond(myOpenCounter, "withdraw")} className="h-8 flex-1 text-xs border border-red-400/30 text-red-300" data-testid="button-withdraw-loi">
                  Withdraw LOI
                </Button>
              </div>
            </div>
          )}
          <LoiHistory loi={myOpenLoi} />
          <div className="flex gap-2">
            <Button asChild size="sm" variant="ghost" className="h-8 text-xs border border-white/10 flex-1">
              <a href={recordUrl(myOpenLoi.id)} target="_blank" rel="noreferrer" data-testid="link-my-loi-record">
                <FileText className="w-3 h-3 mr-1" /> View LOI
              </a>
            </Button>
            <Button asChild size="sm" variant="ghost" className="h-8 text-xs border border-white/10 flex-1">
              <a href={recordUrl(myOpenLoi.id, true)} data-testid="link-my-loi-download">
                <Download className="w-3 h-3 mr-1" /> Download
              </a>
            </Button>
          </div>
        </div>
      )}

      {/* Investor: prepare & submit */}
      {!canManage && !myOpenLoi && ndaSigned && !preparing && (
        <div className="text-center space-y-2">
          <p className="text-xs text-muted-foreground">
            Your NDA is signed. A Letter of Intent pre-filled with the deal facts is ready for you.
          </p>
          <Button onClick={() => setPreparing(true)} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold" data-testid="button-prepare-loi">
            <ScrollText className="w-4 h-4 mr-2" /> Prepare LOI
          </Button>
        </div>
      )}
      {!canManage && !myOpenLoi && ndaSigned && preparing && (
        <form onSubmit={handleSubmit} className="space-y-3" data-testid="form-loi">
          <div className="p-3 rounded-lg bg-card/60 border border-white/10 max-h-44 overflow-y-auto text-xs text-muted-foreground leading-relaxed space-y-2">
            <p className="font-semibold text-foreground uppercase tracking-wider">{draft?.title ?? "Letter of Intent"}</p>
            {(draft?.paragraphs ?? []).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loi-offer" className="text-xs uppercase tracking-wider text-muted-foreground">
              Offered Price {draft ? `(${draft.currency})` : ""}
            </Label>
            <Input id="loi-offer" required type="number" min="1" value={offerPrice} onChange={(e) => setOfferPrice(e.target.value)} placeholder={draft?.askingPrice != null ? String(draft.askingPrice) : "Amount"} className="bg-background/50 border-white/10" data-testid="input-loi-offer" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="loi-excl" className="text-xs uppercase tracking-wider text-muted-foreground">Exclusivity (days)</Label>
              <Input id="loi-excl" type="number" min="1" max="365" value={exclusivityDays} onChange={(e) => setExclusivityDays(e.target.value)} placeholder={String(draft?.defaults.exclusivityDays ?? 45)} className="bg-background/50 border-white/10" data-testid="input-loi-exclusivity" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loi-valid" className="text-xs uppercase tracking-wider text-muted-foreground">Validity (days)</Label>
              <Input id="loi-valid" type="number" min="1" max="180" value={validityDays} onChange={(e) => setValidityDays(e.target.value)} placeholder={String(draft?.defaults.validityDays ?? 14)} className="bg-background/50 border-white/10" data-testid="input-loi-validity" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loi-cond" className="text-xs uppercase tracking-wider text-muted-foreground">Additional Conditions (optional)</Label>
            <Input id="loi-cond" value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder="e.g. subject to board approval" className="bg-background/50 border-white/10" data-testid="input-loi-conditions" />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setPreparing(false)} className="flex-1 border border-white/10">Back</Button>
            <Button type="submit" disabled={submitLoi.isPending || !offerPrice} className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 font-bold" data-testid="button-submit-loi">
              {submitLoi.isPending ? "Submitting..." : "Submit LOI"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
