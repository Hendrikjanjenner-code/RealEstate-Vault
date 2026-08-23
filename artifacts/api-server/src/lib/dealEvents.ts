import { db, dealEventsTable } from "@workspace/db";
import type { Request } from "express";

/**
 * Append an immutable, deal-scoped audit event. Events are never updated or
 * deleted; the transaction timeline renders them alongside creation facts
 * synthesized from immutable row timestamps, so overwriting mutations
 * (risk status changes, checklist overrides, document edits/deletions,
 * access decisions) retain full history here.
 */
export async function recordDealEvent(event: {
  dealId: number;
  kind: string;
  title: string;
  detail?: string | null;
  /** Document category for document events; used for per-category redaction. */
  category?: string | null;
  /** 'all' (default) or 'manager' — manager-only events are hidden from other readers. */
  visibility?: "all" | "manager";
  req?: Request;
}): Promise<void> {
  const user = event.req?.isAuthenticated() ? event.req.user : undefined;
  const actorName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.email ||
      null
    : null;
  await db.insert(dealEventsTable).values({
    dealId: event.dealId,
    kind: event.kind,
    title: event.title,
    detail: event.detail ?? null,
    category: event.category ?? null,
    visibility: event.visibility ?? "all",
    actorUserId: user?.id ?? null,
    actorName,
  });
}
