import { toJson } from "../lib/serialize";
import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, threadsTable, messagesTable } from "@workspace/db";
import {
  ListThreadsResponse,
  ListThreadMessagesParams,
  ListThreadMessagesResponse,
  SendMessageParams,
  SendMessageBody,
  SendMessageResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/threads", async (_req, res): Promise<void> => {
  const threads = await db.select().from(threadsTable);

  const enriched = await Promise.all(
    threads.map(async (thread) => {
      const [last] = await db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.threadId, thread.id))
        .orderBy(desc(messagesTable.sentAt))
        .limit(1);
      return {
        ...thread,
        lastMessage: last?.body ?? "",
        lastMessageAt: last?.sentAt ?? new Date(),
        unread: thread.unread,
      };
    }),
  );

  enriched.sort(
    (a, b) =>
      new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
  );

  res.json(ListThreadsResponse.parse(toJson(enriched)));
});

router.get("/threads/:id/messages", async (req, res): Promise<void> => {
  const params = ListThreadMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const messages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.threadId, params.data.id))
    .orderBy(messagesTable.sentAt);

  await db
    .update(threadsTable)
    .set({ unread: 0 })
    .where(eq(threadsTable.id, params.data.id));

  res.json(ListThreadMessagesResponse.parse(toJson(messages)));
});

router.post("/threads/:id/messages", async (req, res): Promise<void> => {
  const params = SendMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = SendMessageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [thread] = await db
    .select()
    .from(threadsTable)
    .where(eq(threadsTable.id, params.data.id));

  if (!thread) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }

  const [message] = await db
    .insert(messagesTable)
    .values({
      threadId: thread.id,
      senderName: "You",
      body: body.data.body,
      fromMe: true,
    })
    .returning();

  res.status(201).json(SendMessageResponse.parse(toJson(message)));
});

export default router;
