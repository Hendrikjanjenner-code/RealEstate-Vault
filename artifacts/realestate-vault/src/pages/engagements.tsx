import { useState } from "react";
import { Link } from "wouter";
import {
  useListMyEngagements,
  getListMyEngagementsQueryKey,
  useUpdateEngagement,
  useCreateFeeProposal,
  useUpdateFeeProposal,
  type MyEngagement,
} from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Briefcase,
  MapPin,
  ShieldCheck,
  FileText,
  Euro,
  ChevronRight,
} from "lucide-react";

const STATUS_STYLES: Record<string, string> = {
  invited: "bg-white/5 text-muted-foreground border-white/10",
  interested: "bg-primary/10 text-primary border-primary/30",
  info_requested: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  proposal_sent: "bg-sky-500/10 text-sky-400 border-sky-500/30",
  negotiation: "bg-sky-500/10 text-sky-400 border-sky-500/30",
  appointed: "bg-primary/15 text-primary border-primary/40",
  active: "bg-primary/20 text-primary border-primary/50",
  declined: "bg-destructive/10 text-destructive border-destructive/30",
  completed: "bg-white/10 text-foreground border-white/20",
  cancelled: "bg-white/5 text-muted-foreground border-white/10",
};

function formatFee(fee: MyEngagement["feeProposals"][number]): string {
  if (fee.percentage != null) return `${fee.percentage}% (${fee.feeType})`;
  if (fee.amount != null)
    return `${fee.currency} ${fee.amount.toLocaleString()} (${fee.feeType})`;
  return fee.feeType;
}

export default function Engagements() {
  const { user } = useAuth();
  const { data: engagements, isLoading } = useListMyEngagements({
    query: { enabled: !!user, queryKey: getListMyEngagementsQueryKey() },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
          <Briefcase className="w-6 h-6 text-primary" /> My Engagements
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Deal team invitations and mandates where you act as a professional.
          You only ever see the deal information you have been authorised for.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : !engagements || engagements.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground rounded-xl border border-dashed border-white/10" data-testid="text-no-engagements">
          <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p>No engagements yet. Invitations from deal managers will appear here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {engagements.map((item) => (
            <EngagementCard key={item.engagement.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function EngagementCard({ item }: { item: MyEngagement }) {
  const { engagement, deal, permissions, feeProposals } = item;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showFeeForm, setShowFeeForm] = useState(false);
  const [feeType, setFeeType] = useState("fixed");
  const [feeAmount, setFeeAmount] = useState("");
  const [feePercentage, setFeePercentage] = useState("");
  const [feeTerms, setFeeTerms] = useState("");

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListMyEngagementsQueryKey() });

  const update = useUpdateEngagement({
    mutation: {
      onSuccess: invalidate,
      onError: (e) =>
        toast({ title: "Could not update", description: String((e as Error)?.message ?? e), variant: "destructive" }),
    },
  });
  const proposeFee = useCreateFeeProposal({
    mutation: {
      onSuccess: () => {
        invalidate();
        setShowFeeForm(false);
        toast({ title: "Fee proposal sent" });
      },
      onError: (e) =>
        toast({ title: "Could not send proposal", description: String((e as Error)?.message ?? e), variant: "destructive" }),
    },
  });
  const decideFee = useUpdateFeeProposal({
    mutation: {
      onSuccess: invalidate,
      onError: (e) =>
        toast({ title: "Could not update proposal", description: String((e as Error)?.message ?? e), variant: "destructive" }),
    },
  });

  const act = (action: "interested" | "request_info" | "decline") =>
    update.mutate({ id: engagement.id, data: { action } });

  // Mirror the server's per-party transition rules so we never offer an
  // action the API would reject.
  const canInterested = ["invited", "info_requested"].includes(engagement.status);
  const canRequestInfo = ["invited", "interested"].includes(engagement.status);
  const canRespond = ["invited", "interested", "info_requested", "proposal_sent", "negotiation"].includes(engagement.status);
  const hasDataroomAccess = ["appointed", "active"].includes(engagement.status);
  const grantedCategories = permissions.filter((p) => p.permission !== "no_access");

  return (
    <Card className="bg-card/30 backdrop-blur border-white/5" data-testid={`card-engagement-${engagement.id}`}>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-heading font-bold text-lg">{deal.title}</div>
            <div className="text-sm text-muted-foreground flex items-center gap-2 mt-0.5">
              <MapPin className="w-3.5 h-3.5" /> {deal.city}, {deal.country}
              <span>·</span>
              <span className="capitalize">{deal.assetClass}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Invited by {engagement.invitedByName} · role:{" "}
              <span className="capitalize">{engagement.role.replace(/_/g, " ")}</span>
            </div>
          </div>
          <Badge
            variant="outline"
            className={`text-[10px] uppercase tracking-wider shrink-0 ${STATUS_STYLES[engagement.status] ?? ""}`}
            data-testid={`badge-engagement-status-${engagement.id}`}
          >
            {engagement.status.replace(/_/g, " ")}
          </Badge>
        </div>

        {engagement.scope && (
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">Scope:</span> {engagement.scope}
          </p>
        )}

        {grantedCategories.length > 0 && (
          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-primary" /> Data room access:
            {grantedCategories.map((p) => (
              <Badge key={p.category} variant="secondary" className="bg-background border-white/10 text-[10px]">
                {p.category}: {p.permission}
              </Badge>
            ))}
            {!hasDataroomAccess && (
              <span className="italic">(available once appointed)</span>
            )}
          </div>
        )}

        {feeProposals.length > 0 && (
          <div className="space-y-1.5">
            {feeProposals.map((fee) => (
              <div
                key={fee.id}
                className="flex items-center justify-between gap-2 text-xs rounded-md border border-white/10 px-3 py-2"
                data-testid={`row-fee-${fee.id}`}
              >
                <span className="flex items-center gap-1.5">
                  <Euro className="w-3.5 h-3.5 text-primary" />
                  {formatFee(fee)} · by {fee.proposedByName}
                  {fee.vatIncluded && <span className="text-muted-foreground">incl. VAT</span>}
                </span>
                <span className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px] uppercase">{fee.status}</Badge>
                  {fee.status === "proposed" && fee.proposedByUserId !== user?.id && (
                    <>
                      <Button size="sm" className="h-6 text-xs" onClick={() => decideFee.mutate({ id: fee.id, data: { status: "accepted" } })} data-testid={`button-accept-fee-${fee.id}`}>
                        Accept
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => decideFee.mutate({ id: fee.id, data: { status: "rejected" } })} data-testid={`button-reject-fee-${fee.id}`}>
                        Reject
                      </Button>
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {canInterested && (
            <Button size="sm" className="h-7 text-xs" onClick={() => act("interested")} disabled={update.isPending} data-testid={`button-interested-${engagement.id}`}>
              I'm interested
            </Button>
          )}
          {canRequestInfo && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => act("request_info")} disabled={update.isPending} data-testid={`button-request-info-${engagement.id}`}>
              Request info
            </Button>
          )}
          {canRespond && (
            <>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowFeeForm((v) => !v)} data-testid={`button-propose-fee-${engagement.id}`}>
                Propose fee
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => act("decline")} disabled={update.isPending} data-testid={`button-decline-${engagement.id}`}>
                Decline
              </Button>
            </>
          )}
          {hasDataroomAccess && (
            <Link href={`/demo/deals/${deal.id}`}>
              <Button size="sm" variant="outline" className="h-7 text-xs" data-testid={`link-dataroom-${engagement.id}`}>
                <FileText className="w-3.5 h-3.5 mr-1" /> Open deal & data room
                <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          )}
        </div>

        {showFeeForm && (
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-white/10 p-3">
            <select
              className="bg-background border border-white/10 rounded-md text-sm px-2 py-1.5"
              value={feeType}
              onChange={(e) => setFeeType(e.target.value)}
              data-testid="select-counter-fee-type"
            >
              {["fixed", "hourly", "percentage", "success", "retainer", "custom"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            {feeType === "percentage" || feeType === "success" ? (
              <Input placeholder="Percentage %" type="number" value={feePercentage} onChange={(e) => setFeePercentage(e.target.value)} data-testid="input-counter-fee-percentage" />
            ) : (
              <Input placeholder="Amount (EUR)" type="number" value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} data-testid="input-counter-fee-amount" />
            )}
            <Input className="col-span-2" placeholder="Payment terms" value={feeTerms} onChange={(e) => setFeeTerms(e.target.value)} data-testid="input-counter-fee-terms" />
            <div className="col-span-2 flex justify-end">
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={proposeFee.isPending}
                onClick={() =>
                  proposeFee.mutate({
                    id: engagement.id,
                    data: {
                      feeType: feeType as "fixed" | "hourly" | "percentage" | "success" | "retainer" | "custom",
                      ...(feeAmount ? { amount: Number(feeAmount) } : {}),
                      ...(feePercentage ? { percentage: Number(feePercentage) } : {}),
                      ...(feeTerms.trim() ? { paymentTerms: feeTerms.trim() } : {}),
                    },
                  })
                }
                data-testid="button-send-counter-fee"
              >
                Send proposal
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
