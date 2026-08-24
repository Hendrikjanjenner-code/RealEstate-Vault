import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetLoiDraft,
  getGetLoiDraftQueryKey,
  useListDealLois,
  getListDealLoisQueryKey,
  useSubmitLoi,
  useUpdateLoiStatus,
  type Loi,
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
  accepted: "border-emerald-400/40 text-emerald-300",
  rejected: "border-red-400/40 text-red-300",
};

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

  const canManage = loiData?.canManage ?? false;
  const lois = loiData?.lois ?? [];
  const myOpenLoi = !canManage
    ? lois.find((l) => l.status !== "rejected")
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
                  Offer {loi.currency} {loi.offerPrice.toLocaleString("en-US")} · exclusivity {loi.exclusivityDays}d · valid {loi.validityDays}d
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
                </div>
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
            Offer {myOpenLoi.currency} {myOpenLoi.offerPrice.toLocaleString("en-US")} · exclusivity {myOpenLoi.exclusivityDays}d · valid {myOpenLoi.validityDays}d
          </p>
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
