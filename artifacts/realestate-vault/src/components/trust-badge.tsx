import { useState } from "react";
import {
  useGetProfessionalTrust,
  getGetProfessionalTrustQueryKey,
} from "@workspace/api-client-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ShieldCheck, ShieldQuestion, Shield } from "lucide-react";

const TIER_LABEL: Record<string, string> = {
  established: "Established",
  developing: "Developing",
  new: "New on Closa",
};

const TIER_CLASS: Record<string, string> = {
  established: "border-primary/50 text-primary",
  developing: "border-amber-400/40 text-amber-300",
  new: "border-white/20 text-muted-foreground",
};

function TierIcon({ tier }: { tier: string }) {
  if (tier === "established") return <ShieldCheck className="w-3.5 h-3.5" />;
  if (tier === "developing") return <Shield className="w-3.5 h-3.5" />;
  return <ShieldQuestion className="w-3.5 h-3.5" />;
}

/**
 * Trust badge with an on-demand breakdown popover. The score and every
 * signal behind it are computed server-side from verifiable platform data;
 * self-claimed signals are shown as "unconfirmed" and weigh less.
 */
export function TrustBadge({
  professionalId,
  score: scoreProp,
  tier: tierProp,
  size = "sm",
}: {
  professionalId: number;
  /** When omitted, the badge fetches the trust report itself. */
  score?: number | null;
  tier?: string | null;
  size?: "sm" | "lg";
}) {
  const [open, setOpen] = useState(false);
  const selfFetch = scoreProp === undefined;
  const { data: report, isLoading } = useGetProfessionalTrust(professionalId, {
    query: {
      enabled: open || selfFetch,
      queryKey: getGetProfessionalTrustQueryKey(professionalId),
    },
  });
  const score = scoreProp !== undefined ? scoreProp : (report?.score ?? null);
  const tier = tierProp !== undefined && tierProp !== null ? tierProp : (report?.tier ?? null);

  if (score == null || tier == null) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={`relative z-[2] inline-flex items-center gap-1.5 rounded-full border bg-background/60 font-semibold uppercase tracking-wider transition-colors hover:bg-background ${TIER_CLASS[tier] ?? TIER_CLASS.new} ${size === "lg" ? "px-3 py-1.5 text-xs" : "px-2 py-1 text-[10px]"}`}
          data-testid={`badge-trust-${professionalId}`}
          aria-label={`Trust score ${score} out of 100 — ${TIER_LABEL[tier] ?? tier}. Show breakdown.`}
        >
          <TierIcon tier={tier} />
          Trust {Math.round(score)}
          <span className="font-normal normal-case tracking-normal opacity-80">
            · {TIER_LABEL[tier] ?? tier}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-96 max-w-[90vw] bg-card border-white/10 z-50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-3" data-testid={`popover-trust-${professionalId}`}>
          <div>
            <div className="flex items-baseline justify-between">
              <h4 className="font-heading font-bold text-base">Trust score</h4>
              <span className="text-xl font-heading font-bold text-primary">
                {Math.round(score)}<span className="text-xs text-muted-foreground font-normal">/100</span>
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Computed by Closa from verifiable platform activity. Self-reported
              claims are marked unconfirmed and weigh less.
            </p>
            {report?.isDemo && (
              <Badge variant="outline" className="mt-2 text-[10px] uppercase tracking-wider border-white/20 text-muted-foreground">
                Demo profile — illustrative data
              </Badge>
            )}
          </div>
          {isLoading && <p className="text-sm text-muted-foreground">Loading breakdown…</p>}
          {report && (
            <ul className="space-y-2.5">
              {report.signals.map((s) => (
                <li key={s.key}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{s.label}</span>
                      {!s.confirmed && (
                        <Badge variant="outline" className="shrink-0 text-[9px] uppercase tracking-wider border-amber-400/40 text-amber-300">
                          Unconfirmed
                        </Badge>
                      )}
                    </span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {s.points}/{s.maxPoints}
                    </span>
                  </div>
                  <Progress value={s.maxPoints > 0 ? (s.points / s.maxPoints) * 100 : 0} className="h-1 mt-1" />
                  <p className="text-xs text-muted-foreground/80 mt-0.5">{s.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
