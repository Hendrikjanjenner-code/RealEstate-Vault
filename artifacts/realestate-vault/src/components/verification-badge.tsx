import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldQuestion, Clock3, Award, Building } from "lucide-react";

// Presentation for the verification tiers defined by the API's
// verificationStatus enum. Unknown values degrade to the unverified look.
const STYLES: Record<
  string,
  { label: string; className: string; Icon: typeof ShieldCheck }
> = {
  unverified: {
    label: "Unverified",
    className: "border-white/15 text-muted-foreground",
    Icon: ShieldQuestion,
  },
  verification_pending: {
    label: "Verification Pending",
    className: "border-amber-400/30 text-amber-300/90",
    Icon: Clock3,
  },
  verified_professional: {
    label: "Verified Professional",
    className: "border-primary/40 text-primary",
    Icon: ShieldCheck,
  },
  verified_firm: {
    label: "Verified Firm",
    className: "border-primary/40 text-primary",
    Icon: Building,
  },
  specialist_verified: {
    label: "Specialist Verified",
    className: "border-primary/60 text-primary",
    Icon: Award,
  },
};

export function VerificationBadge({ status }: { status: string }) {
  const style = STYLES[status] ?? STYLES.unverified;
  const { Icon } = style;
  return (
    <Badge
      variant="outline"
      className={`gap-1 text-[11px] font-semibold uppercase tracking-wider bg-transparent ${style.className}`}
      data-testid={`badge-verification-${status}`}
    >
      <Icon className="w-3 h-3" /> {style.label}
    </Badge>
  );
}
