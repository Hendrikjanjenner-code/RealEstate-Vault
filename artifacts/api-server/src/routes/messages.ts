import { toJson } from "../lib/serialize";
import { Router, type IRouter } from "express";
import { desc, eq, isNull, or, and } from "drizzle-orm";
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

type ThreadRow = typeof threadsTable.$inferSelect;

// Legacy/seeded showcase threads have no participants and stay visible to
// every authenticated user. Real threads are private to their participants.
function canViewThread(thread: ThreadRow, userId: string): boolean {
  if (thread.participantAUserId == null && thread.participantBUserId == null) {
    return true;
  }
  return (
    thread.participantAUserId === userId || thread.participantBUserId === userId
  );
}

router.get("/threads", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const threads = await db
    .select()
    .from(threadsTable)
    .where(
      or(
        and(
          isNull(threadsTable.participantAUserId),
          isNull(threadsTable.participantBUserId),
        ),
        eq(threadsTable.participantAUserId, req.user.id),
        eq(threadsTable.participantBUserId, req.user.id),
      ),
    );

  const enriched = await Promise.all(
    threads.map(async (thread) => {
      const [last] = await db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.threadId, thread.id))
        .orderBy(desc(messagesTable.sentAt))
        .limit(1);
      // Present the counterpart per viewer on participant threads; legacy
      // threads keep their static counterpart fields.
      const viewerIsA = thread.participantAUserId === req.user.id;
      const counterpart =
        thread.participantAUserId != null || thread.participantBUserId != null
          ? {
              counterpartName:
                (viewerIsA ? thread.participantBName : thread.participantAName) ??
                thread.counterpartName,
              counterpartCompany:
                (viewerIsA
                  ? thread.participantBCompany
                  : thread.participantACompany) ?? thread.counterpartCompany,
            }
          : {};
      return {
        ...thread,
        ...counterpart,
        lastMessage: last?.body ?? "",
        lastMessageAt: last?.sentAt ?? new Date(),
        // Participant threads: the unread count belongs to one participant.
        unread:
          thread.participantAUserId != null || thread.participantBUserId != null
            ? thread.unreadForUserId === req.user.id
              ? thread.unread
              : 0
            : thread.unread,
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
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = ListThreadMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [thread] = await db
    .select()
    .from(threadsTable)
    .where(eq(threadsTable.id, params.data.id));
  if (!thread || !canViewThread(thread, req.user.id)) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }

  const messages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.threadId, params.data.id))
    .orderBy(messagesTable.sentAt);

  // Legacy threads: everyone shares the static counter, so reading clears it.
  // Participant threads: only the participant the unread count belongs to
  // clears it by reading.
  const isParticipantThread =
    thread.participantAUserId != null || thread.participantBUserId != null;
  if (!isParticipantThread || thread.unreadForUserId === req.user.id) {
    await db
      .update(threadsTable)
      .set({ unread: 0, unreadForUserId: null })
      .where(eq(threadsTable.id, params.data.id));
  }

  // For participant threads, compute fromMe per viewer; legacy seeded
  // messages keep their stored fromMe flag.
  const presented = messages.map((message) => ({
    ...message,
    fromMe:
      message.senderUserId != null
        ? message.senderUserId === req.user.id
        : message.fromMe,
  }));

  res.json(ListThreadMessagesResponse.parse(toJson(presented)));
});

router.post("/threads/:id/messages", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
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

  if (!thread || !canViewThread(thread, req.user.id)) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }

  const senderName =
    [req.user.firstName, req.user.lastName].filter(Boolean).join(" ") ||
    req.user.email ||
    "Member";
  const isParticipantThread =
    thread.participantAUserId != null || thread.participantBUserId != null;

  const [message] = await db
    .insert(messagesTable)
    .values({
      threadId: thread.id,
      senderName: isParticipantThread ? senderName : "You",
      senderUserId: isParticipantThread ? req.user.id : null,
      body: body.data.body,
      fromMe: true,
    })
    .returning();

  // Surface the new message to the other participant only. If unread was
  // already attributed to the other participant, add to it; if it belonged
  // to the sender (or nobody), restart the count at 1 for the recipient.
  if (isParticipantThread) {
    const recipientId =
      thread.participantAUserId === req.user.id
        ? thread.participantBUserId
        : thread.participantAUserId;
    await db
      .update(threadsTable)
      .set({
        unread: thread.unreadForUserId === recipientId ? thread.unread + 1 : 1,
        unreadForUserId: recipientId,
      })
      .where(eq(threadsTable.id, thread.id));
  }

  res
    .status(201)
    .json(SendMessageResponse.parse(toJson({ ...message, fromMe: true })));
});

export default router;
