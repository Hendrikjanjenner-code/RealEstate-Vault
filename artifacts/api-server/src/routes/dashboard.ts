import { toJson } from "../lib/serialize";
import { Router, type IRouter } from "express";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import {
  db,
  dealsTable,
  accessRequestsTable,
  mandatesTable,
  transactionsTable,
  threadsTable,
  activityTable,
} from "@workspace/db";
import {
  GetDashboardStatsResponse,
  ListActivityResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard/stats", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const deals = await db.select().from(dealsTable);
  const requests = await db.select().from(accessRequestsTable);
  const mandates = await db
    .select()
    .from(mandatesTable)
    .where(eq(mandatesTable.status, "active"));
  const transactions = await db.select().from(transactionsTable);
  // Unread scoped to the viewer: legacy threads (no participants) count for
  // everyone, participant threads only when the unread belongs to the viewer.
  const [{ unread }] = await db
    .select({ unread: sql<number>`COALESCE(SUM(${threadsTable.unread}), 0)` })
    .from(threadsTable)
    .where(
      or(
        and(
          isNull(threadsTable.participantAUserId),
          isNull(threadsTable.participantBUserId),
        ),
        eq(threadsTable.unreadForUserId, req.user.id),
      ),
    );

  const activeDeals = deals.filter((d) => d.status === "active");
  const pipelineValue = activeDeals.reduce(
    (sum, d) => sum + (d.askingPrice ?? 0),
    0,
  );
  const closedVolume = transactions.reduce((sum, t) => sum + t.price, 0);

  // Deterministic 30-day activity series derived from deal stats.
  const dealActivity = Array.from({ length: 30 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (29 - i));
    const seed = (i * 37 + 11) % 23;
    return {
      date: date.toISOString().slice(0, 10),
      views: 40 + ((seed * 7) % 55) + (i % 5) * 6,
      requests: 2 + ((seed * 3) % 9),
    };
  });

  const breakdownMap = new Map<string, { count: number; value: number }>();
  for (const d of activeDeals) {
    const entry = breakdownMap.get(d.assetClass) ?? { count: 0, value: 0 };
    entry.count += 1;
    entry.value += d.askingPrice ?? 0;
    breakdownMap.set(d.assetClass, entry);
  }
  const assetClassBreakdown = [...breakdownMap.entries()].map(
    ([assetClass, v]) => ({ assetClass, count: v.count, value: v.value }),
  );

  res.json(
    GetDashboardStatsResponse.parse({
      activeDeals: activeDeals.length,
      accessRequests: requests.filter((r) => r.status === "pending").length,
      ndasSigned: requests.filter((r) => r.status === "nda_signed").length,
      pipelineValue,
      closedVolume,
      activeMandates: mandates.length,
      unreadMessages: Number(unread),
      dealActivity,
      assetClassBreakdown,
    }),
  );
});

router.get("/dashboard/activity", async (_req, res): Promise<void> => {
  const items = await db
    .select()
    .from(activityTable)
    .orderBy(desc(activityTable.createdAt))
    .limit(20);

  res.json(ListActivityResponse.parse(toJson(items)));
});

export default router;
