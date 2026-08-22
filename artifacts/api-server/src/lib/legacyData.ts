import { notInArray } from "drizzle-orm";
import { db, mandatesTable } from "@workspace/db";

export const MANDATE_STATUSES = ["active", "paused", "closed"] as const;
export type MandateStatus = (typeof MANDATE_STATUSES)[number];

/**
 * Coerce a stored mandate status to the current enum. Databases provisioned
 * before the enum existed contain legacy values such as "fulfilled"; those
 * mandates are no longer being actively pursued, so they map to "closed".
 */
export function coerceMandateStatus(status: string): MandateStatus {
  return (MANDATE_STATUSES as readonly string[]).includes(status)
    ? (status as MandateStatus)
    : "closed";
}

/**
 * Idempotent startup migration: rewrite any legacy mandate status (e.g. the
 * old seeded "fulfilled") to "closed" so enum-validated API responses never
 * fail on pre-existing rows.
 */
export async function normalizeLegacyMandateStatuses(): Promise<void> {
  await db
    .update(mandatesTable)
    .set({ status: "closed" })
    .where(notInArray(mandatesTable.status, [...MANDATE_STATUSES]));
}
