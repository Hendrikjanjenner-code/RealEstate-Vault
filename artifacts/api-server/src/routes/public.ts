import { Router, type IRouter } from "express";
import { and, desc, eq, isNotNull, notInArray, sql } from "drizzle-orm";
import { db, dealsTable, brokersTable, usersTable } from "@workspace/db";
import {
  ListPublicDealTeasersQueryParams,
  ListPublicDealTeasersResponse,
  GetPublicPlatformStatsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

/**
 * Coarse value band for anonymous teasers. Never exposes the exact asking
 * price — only which bracket the deal falls into.
 */
function valueBand(askingPrice: number | null): string {
  if (askingPrice == null || askingPrice <= 0) return "On request";
  const m = askingPrice / 1_000_000;
  if (m < 10) return "< €10M";
  if (m < 25) return "€10–25M";
  if (m < 50) return "€25–50M";
  if (m < 100) return "€50–100M";
  return "€100M+";
}

/**
 * Location shown to anonymous visitors, honouring the listing's
 * locationPrivacy setting. The region is only revealed when the deal is not
 * confidential, or when the broker explicitly chose a region-level (or
 * looser) public display. "country_only", unknown, and legacy values such as
 * "district"/"city"/"exact" all fall back to country only — the region
 * column can hold district- or city-level detail we must not publish.
 */
export function publicTeaserRegion(deal: {
  confidential: boolean;
  locationPrivacy: string | null;
  region: string | null;
}): string | null {
  if (!deal.confidential) return deal.region;
  if (deal.locationPrivacy === "region_only") return deal.region;
  return null;
}

/**
 * Anonymous, redacted deal teasers for the public homepage. Only teaser
 * fields are exposed: masked title, asset class, country (region only when
 * the listing's privacy setting allows), value band and gross yield. Real
 * title, city, prices, broker identity and documents are never included.
 */
router.get("/public/deal-teasers", async (req, res): Promise<void> => {
  const query = ListPublicDealTeasersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const limit = query.data.limit ?? 3;

  const deals = await db
    .select({
      id: dealsTable.id,
      assetClass: dealsTable.assetClass,
      country: dealsTable.country,
      region: dealsTable.region,
      locationPrivacy: dealsTable.locationPrivacy,
      askingPrice: dealsTable.askingPrice,
      grossYield: dealsTable.grossYield,
      confidential: dealsTable.confidential,
    })
    .from(dealsTable)
    .where(eq(dealsTable.status, "active"))
    .orderBy(desc(dealsTable.createdAt))
    .limit(limit);

  const teasers = deals.map((deal) => ({
    id: deal.id,
    title: `Confidential ${deal.assetClass} Opportunity`,
    assetClass: deal.assetClass,
    country: deal.country,
    region: publicTeaserRegion(deal),
    valueBand: valueBand(deal.askingPrice),
    grossYield: deal.grossYield,
    confidential: deal.confidential,
  }));

  res.json(ListPublicDealTeasersResponse.parse(teasers));
});

/** Anonymous aggregate platform statistics for the public homepage. */
router.get("/public/stats", async (_req, res): Promise<void> => {
  const [dealAgg] = await db
    .select({
      liveDeals: sql<number>`COUNT(*)`,
      pipelineValue: sql<number>`COALESCE(SUM(${dealsTable.askingPrice}), 0)`,
    })
    .from(dealsTable)
    .where(eq(dealsTable.status, "active"));

  // Verified professionals = distinct union of verified broker profiles and
  // registered users who have chosen a marketplace role. Users linked to a
  // verified broker profile are not counted twice.
  const verifiedBrokerUserIds = db
    .select({ userId: brokersTable.userId })
    .from(brokersTable)
    .where(and(eq(brokersTable.verified, true), isNotNull(brokersTable.userId)));
  const [[{ userCount }], [{ brokerCount }]] = await Promise.all([
    db
      .select({ userCount: sql<number>`COUNT(*)` })
      .from(usersTable)
      .where(
        and(
          isNotNull(usersTable.role),
          notInArray(usersTable.id, verifiedBrokerUserIds),
        ),
      ),
    db
      .select({ brokerCount: sql<number>`COUNT(*)` })
      .from(brokersTable)
      .where(eq(brokersTable.verified, true)),
  ]);

  res.json(
    GetPublicPlatformStatsResponse.parse({
      pipelineValue: Number(dealAgg.pipelineValue),
      liveDeals: Number(dealAgg.liveDeals),
      verifiedProfessionals: Number(userCount) + Number(brokerCount),
    }),
  );
});

export default router;
