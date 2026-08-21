import { toJson } from "../lib/serialize";
import { Router, type IRouter } from "express";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import {
  ListNotificationsResponse,
  MarkNotificationsReadResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/notifications", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const rows = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, req.user.id))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);

  const notifications = rows.map(({ readAt, ...rest }) => ({
    ...rest,
    read: readAt != null,
  }));

  res.json(ListNotificationsResponse.parse(toJson(notifications)));
});

router.post("/notifications/mark-read", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  await db
    .update(notificationsTable)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notificationsTable.userId, req.user.id),
        isNull(notificationsTable.readAt),
      ),
    );
  res.json(MarkNotificationsReadResponse.parse({ success: true }));
});

export default router;
