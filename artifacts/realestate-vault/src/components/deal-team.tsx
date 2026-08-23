import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useGetDealTeam,
  getGetDealTeamQueryKey,
  useListDealTeamCandidates,
  getListDealTeamCandidatesQueryKey,
  useCreateTeamInvitation,
  useUpdateEngagement,
  useUpdateFeeProposal,
  type DealTeamResponse,
  type CandidateMatch,
  type EngagementWithProfessional,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { VerificationBadge } from "@/components/verification-badge";
import { useAuth } from "@workspace/replit-auth-web";
import {
  Users,
  Star,
  Search,
  X,
  ShieldCheck,
  ChevronRight,
  Sparkles,
} from "lucide-react";

const PERMISSION_OPTIONS = [
  { value: "no_access", label: "No access" },
  { value: "view", label: "View" },
  { value: "download", label: "Download" },
];

const FEE_TYPES = [
  { value: "", label: "No fee proposal yet" },
  { value: "fixed", label: "Fixed" },
  { value: "hourly", label: "Hourly" },
  { value: "percentage", label: "Percentage" },
  { value: "success", label: "Success fee" },
  { value: "retainer", label: "Retainer" },
  { value: "custom", label: "Custom" },
];

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

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

export function DealTeamSection({ dealId }: { dealId: number }) {
  const { data: team, isLoading } = useGetDealTeam(dealId, {
    query: { enabled: !!dealId, queryKey: getGetDealTeamQueryKey(dealId) },
  });

  if (isLoading) {
    return <Skeleton className="h-40 rounded-xl" data-testid="skeleton-deal-team" />;
  }
  if (!team) return null;
  if (!team.canManage && team.members.length === 0) return null;

  return (
    <div data-testid="section-deal-team">
      <h2 className="text-xl font-heading font-bold flex items-center gap-2 mb-6">
        <Users className="w-5 h-5 text-primary" /> Deal Team
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {team.roles.map((role) => (
          <RoleSlot key={role.id} dealId={dealId} team={team} roleId={role.id} />
        ))}
      </div>
    </div>
  );
}

function RoleSlot({
  dealId,
  team,
  roleId,
}: {
  dealId: number;
  team: DealTeamResponse;
  roleId: string;
}) {
  const role = team.roles.find((r) => r.id === roleId)!;
  const engagements = team.members.filter((m) => m.engagement.role === roleId);
  const [finding, setFinding] = useState(false);

  if (!team.canManage && engagements.length === 0) return null;

  return (
    <Card className="bg-card/30 backdrop-blur border-white/5">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {role.label}
          </span>
          {team.canManage && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setFinding(true)}
              data-testid={`button-find-${role.id}`}
            >
              <Search className="w-3 h-3 mr-1" /> Find Professional
            </Button>
          )}
        </div>
        {engagements.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid={`text-empty-${role.id}`}>
            No professional engaged yet.
          </p>
        ) : (
          engagements.map((m) => (
            <MemberRow key={m.engagement.id} dealId={dealId} member={m} canManage={team.canManage} />
          ))
        )}
        {finding && (
          <FindProfessionalDialog
            dealId={dealId}
            roleId={role.id}
            roleLabel={role.label}
            documentCategories={team.documentCategories}
            onClose={() => setFinding(false)}
          />
        )}
      </CardContent>
    </Card>
  );
}

function MemberRow({
  dealId,
  member,
  canManage,
}: {
  dealId: number;
  member: EngagementWithProfessional;
  canManage: boolean;
}) {
  const { engagement, professional, feeProposals } = member;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const decideFee = useUpdateFeeProposal({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetDealTeamQueryKey(dealId) });
      },
      onError: (e) =>
        toast({ title: "Could not update proposal", description: String((e as Error)?.message ?? e), variant: "destructive" }),
    },
  });
  const update = useUpdateEngagement({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetDealTeamQueryKey(dealId) });
      },
      onError: (e) =>
        toast({ title: "Could not update engagement", description: String((e as Error)?.message ?? e), variant: "destructive" }),
    },
  });

  const act = (action: "appoint" | "activate" | "cancel" | "complete") =>
    update.mutate({ id: engagement.id, data: { action } });

  return (
    <div
      className="rounded-lg border border-white/10 p-3 space-y-2"
      data-testid={`row-engagement-${engagement.id}`}
    >
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/demo/professionals/${professional.id}`}
          className="font-semibold text-sm hover:text-primary transition-colors"
          data-testid={`link-member-${engagement.id}`}
        >
          {professional.name}
        </Link>
        <Badge
          variant="outline"
          className={`text-[10px] uppercase tracking-wider ${STATUS_STYLES[engagement.status] ?? ""}`}
          data-testid={`badge-status-${engagement.id}`}
        >
          {statusLabel(engagement.status)}
        </Badge>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{professional.company}</span>
        <VerificationBadge status={professional.verificationStatus} />
      </div>
      {engagement.matchScore != null && (
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-primary" /> Match score {engagement.matchScore}
        </div>
      )}
      {canManage && feeProposals.length > 0 && (
        <div className="space-y-1">
          {feeProposals.map((fee) => (
            <div key={fee.id} className="flex items-center justify-between gap-2 text-[11px] rounded-md border border-white/10 px-2 py-1.5" data-testid={`row-team-fee-${fee.id}`}>
              <span>
                {fee.percentage != null ? `${fee.percentage}%` : fee.amount != null ? `${fee.currency} ${fee.amount.toLocaleString()}` : ""} {fee.feeType} · {fee.proposedByName}
              </span>
              <span className="flex items-center gap-1">
                <Badge variant="outline" className="text-[9px] uppercase">{fee.status}</Badge>
                {fee.status === "proposed" && fee.proposedByUserId !== user?.id && (
                  <>
                    <Button size="sm" className="h-5 text-[10px] px-2" onClick={() => decideFee.mutate({ id: fee.id, data: { status: "accepted" } })} data-testid={`button-team-accept-fee-${fee.id}`}>
                      Accept
                    </Button>
                    <Button size="sm" variant="ghost" className="h-5 text-[10px] px-2" onClick={() => decideFee.mutate({ id: fee.id, data: { status: "rejected" } })} data-testid={`button-team-reject-fee-${fee.id}`}>
                      Reject
                    </Button>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
      {canManage && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {["invited", "interested", "proposal_sent", "negotiation"].includes(engagement.status) && (
            <Button size="sm" className="h-6 text-xs" onClick={() => act("appoint")} data-testid={`button-appoint-${engagement.id}`}>
              Appoint
            </Button>
          )}
          {engagement.status === "appointed" && (
            <Button size="sm" className="h-6 text-xs" onClick={() => act("activate")} data-testid={`button-activate-${engagement.id}`}>
              Activate
            </Button>
          )}
          {engagement.status === "active" && (
            <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => act("complete")} data-testid={`button-complete-${engagement.id}`}>
              Complete
            </Button>
          )}
          {!["declined", "completed", "cancelled"].includes(engagement.status) && (
            <Button size="sm" variant="ghost" className="h-6 text-xs text-muted-foreground" onClick={() => act("cancel")} data-testid={`button-cancel-${engagement.id}`}>
              Cancel
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function FindProfessionalDialog({
  dealId,
  roleId,
  roleLabel,
  documentCategories,
  onClose,
}: {
  dealId: number;
  roleId: string;
  roleLabel: string;
  documentCategories: string[];
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<CandidateMatch | null>(null);
  const params = useMemo(() => ({ dealId, role: roleId, ...(q.trim() ? { q: q.trim() } : {}) }), [dealId, roleId, q]);
  const { data: candidates, isLoading } = useListDealTeamCandidates(params, {
    query: { queryKey: getListDealTeamCandidatesQueryKey(params) },
  });

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" data-testid="dialog-find-professional">
      <div className="bg-card border border-white/10 rounded-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-bold text-lg">
            {selected ? `Invite ${selected.professional.name}` : `Find ${roleLabel}`}
          </h3>
          <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-close-find">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {!selected ? (
          <>
            <Input
              placeholder="Search by name, firm, specialisation…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              data-testid="input-candidate-search"
            />
            {isLoading ? (
              <Skeleton className="h-32 rounded-lg" />
            ) : !candidates || candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No matching professionals found.</p>
            ) : (
              <div className="space-y-2">
                {candidates.map((c) => (
                  <button
                    key={c.professional.id}
                    className="w-full text-left rounded-lg border border-white/10 p-3 hover:border-primary/40 transition-colors"
                    onClick={() => setSelected(c)}
                    data-testid={`button-candidate-${c.professional.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold text-sm flex items-center gap-2">
                          {c.professional.name}
                          <VerificationBadge status={c.professional.verificationStatus} />
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {c.professional.company} · {c.professional.city}, {c.professional.country}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-heading font-bold text-primary flex items-center gap-1 justify-end">
                          <Sparkles className="w-3.5 h-3.5" /> {c.matchScore}
                        </div>
                        {c.professional.avgRating != null && (
                          <div className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                            <Star className="w-3 h-3 text-primary" /> {c.professional.avgRating.toFixed(1)}
                          </div>
                        )}
                      </div>
                    </div>
                    <ul className="mt-2 space-y-0.5">
                      {c.matchReasons.slice(0, 3).map((reason, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-center gap-1">
                          <ChevronRight className="w-3 h-3 text-primary shrink-0" /> {reason}
                        </li>
                      ))}
                    </ul>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <InviteForm
            dealId={dealId}
            roleId={roleId}
            candidate={selected}
            documentCategories={documentCategories}
            onBack={() => setSelected(null)}
            onDone={onClose}
          />
        )}
      </div>
    </div>
  );
}

function InviteForm({
  dealId,
  roleId,
  candidate,
  documentCategories,
  onBack,
  onDone,
}: {
  dealId: number;
  roleId: string;
  candidate: CandidateMatch;
  documentCategories: string[];
  onBack: () => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [scope, setScope] = useState("");
  const [message, setMessage] = useState("");
  const [permissions, setPermissions] = useState<Record<string, string>>(
    Object.fromEntries(documentCategories.map((c) => [c, "no_access"])),
  );
  const [feeType, setFeeType] = useState("");
  const [feeAmount, setFeeAmount] = useState("");
  const [feePercentage, setFeePercentage] = useState("");
  const [feeVat, setFeeVat] = useState(false);
  const [feeTerms, setFeeTerms] = useState("");

  const invite = useCreateTeamInvitation({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetDealTeamQueryKey(dealId) });
        toast({ title: "Invitation sent", description: `${candidate.professional.name} has been invited.` });
        onDone();
      },
      onError: (e) =>
        toast({ title: "Could not send invitation", description: String((e as Error)?.message ?? e), variant: "destructive" }),
    },
  });

  const submit = () => {
    invite.mutate({
      id: dealId,
      data: {
        professionalId: candidate.professional.id,
        role: roleId,
        ...(scope.trim() ? { scope: scope.trim() } : {}),
        ...(message.trim() ? { message: message.trim() } : {}),
        permissions: Object.entries(permissions).map(([category, permission]) => ({
          category,
          permission: permission as "view" | "download" | "no_access",
        })),
        ...(feeType
          ? {
              feeProposal: {
                feeType: feeType as "fixed" | "hourly" | "percentage" | "success" | "retainer" | "custom",
                ...(feeAmount ? { amount: Number(feeAmount) } : {}),
                ...(feePercentage ? { percentage: Number(feePercentage) } : {}),
                vatIncluded: feeVat,
                ...(feeTerms.trim() ? { paymentTerms: feeTerms.trim() } : {}),
              },
            }
          : {}),
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="invite-scope">Scope of work</Label>
        <Input
          id="invite-scope"
          placeholder="e.g. Full legal workstream incl. SPA"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          data-testid="input-invite-scope"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="invite-message">Message</Label>
        <Input
          id="invite-message"
          placeholder="Personal note to the professional"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          data-testid="input-invite-message"
        />
      </div>

      <div className="space-y-2">
        <Label className="flex items-center gap-1">
          <ShieldCheck className="w-4 h-4 text-primary" /> Data room access per category
        </Label>
        {documentCategories.length === 0 ? (
          <p className="text-xs text-muted-foreground">This deal has no data room documents yet.</p>
        ) : (
          <div className="space-y-1.5">
            {documentCategories.map((category) => (
              <div key={category} className="flex items-center justify-between gap-2 text-sm">
                <span className="capitalize">{category}</span>
                <select
                  className="bg-background border border-white/10 rounded-md text-xs px-2 py-1"
                  value={permissions[category]}
                  onChange={(e) =>
                    setPermissions((prev) => ({ ...prev, [category]: e.target.value }))
                  }
                  data-testid={`select-permission-${category}`}
                >
                  {PERMISSION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label>Fee proposal (optional)</Label>
        <select
          className="w-full bg-background border border-white/10 rounded-md text-sm px-2 py-2"
          value={feeType}
          onChange={(e) => setFeeType(e.target.value)}
          data-testid="select-fee-type"
        >
          {FEE_TYPES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {feeType && (
          <div className="grid grid-cols-2 gap-2">
            {feeType === "percentage" || feeType === "success" ? (
              <Input
                placeholder="Percentage %"
                type="number"
                value={feePercentage}
                onChange={(e) => setFeePercentage(e.target.value)}
                data-testid="input-fee-percentage"
              />
            ) : (
              <Input
                placeholder="Amount (EUR)"
                type="number"
                value={feeAmount}
                onChange={(e) => setFeeAmount(e.target.value)}
                data-testid="input-fee-amount"
              />
            )}
            <Input
              placeholder="Payment terms"
              value={feeTerms}
              onChange={(e) => setFeeTerms(e.target.value)}
              data-testid="input-fee-terms"
            />
            <label className="flex items-center gap-2 text-xs text-muted-foreground col-span-2">
              <input
                type="checkbox"
                checked={feeVat}
                onChange={(e) => setFeeVat(e.target.checked)}
                data-testid="checkbox-fee-vat"
              />
              VAT included
            </label>
          </div>
        )}
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="ghost" onClick={onBack} data-testid="button-invite-back">
          Back
        </Button>
        <Button onClick={submit} disabled={invite.isPending} data-testid="button-send-invitation">
          {invite.isPending ? "Sending…" : "Send invitation"}
        </Button>
      </div>
    </div>
  );
}
