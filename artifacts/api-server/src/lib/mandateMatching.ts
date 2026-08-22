import type { Deal, Mandate } from "@workspace/db";

const norm = (s: string) => s.trim().toLowerCase();

/**
 * A deal matches a mandate when:
 * - its asset class is one of the mandate's asset classes (case-insensitive)
 * - its country is one of the mandate's countries (case-insensitive)
 * - its price range (askingPrice..priceMax) overlaps the mandate's
 *   minSize..maxSize ticket range. Deals with no price never match.
 */
export function dealMatchesMandate(
  deal: Pick<Deal, "assetClass" | "country" | "askingPrice" | "priceMax">,
  mandate: Pick<Mandate, "assetClasses" | "countries" | "minSize" | "maxSize">,
): boolean {
  const assetOk = mandate.assetClasses.some(
    (ac) => norm(ac) === norm(deal.assetClass),
  );
  if (!assetOk) return false;

  const countryOk = mandate.countries.some(
    (co) => norm(co) === norm(deal.country),
  );
  if (!countryOk) return false;

  const dealMin = deal.askingPrice ?? deal.priceMax;
  const dealMax = deal.priceMax ?? deal.askingPrice;
  if (dealMin == null || dealMax == null) return false;

  return dealMin <= mandate.maxSize && dealMax >= mandate.minSize;
}

/**
 * Yield fit of a deal against a mandate's optional yield target.
 * - "meets": deal grossYield >= yieldTarget
 * - "below": deal grossYield < yieldTarget
 * - "unknown": mandate has no target or deal has no yield
 */
export type YieldFit = "meets" | "below" | "unknown";

export function yieldFit(
  deal: Pick<Deal, "grossYield">,
  mandate: Pick<Mandate, "yieldTarget">,
): YieldFit {
  if (mandate.yieldTarget == null || deal.grossYield == null) return "unknown";
  return deal.grossYield >= mandate.yieldTarget ? "meets" : "below";
}

const fitRank: Record<YieldFit, number> = { meets: 0, unknown: 1, below: 2 };

/**
 * Stable sort of matched deals by yield fit: deals meeting the mandate's
 * yield target first, then deals with unknown yield, then deals below
 * target. Within the "meets" group, higher yield sorts first. Deals are
 * never excluded based on yield.
 */
export function sortByYieldFit<D extends Pick<Deal, "grossYield">>(
  deals: D[],
  mandate: Pick<Mandate, "yieldTarget">,
): D[] {
  if (mandate.yieldTarget == null) return deals;
  return [...deals].sort((a, b) => {
    const rankDiff = fitRank[yieldFit(a, mandate)] - fitRank[yieldFit(b, mandate)];
    if (rankDiff !== 0) return rankDiff;
    return (b.grossYield ?? 0) - (a.grossYield ?? 0);
  });
}
