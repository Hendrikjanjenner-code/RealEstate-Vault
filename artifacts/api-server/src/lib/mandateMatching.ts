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
