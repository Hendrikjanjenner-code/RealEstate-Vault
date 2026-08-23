import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  brokersTable,
  professionalEngagementsTable,
  dealDocumentPermissionsTable,
} from "@workspace/db";

/** Engagement statuses that grant data-room access per permissions. */
export const DATAROOM_ACTIVE_STATUSES = ["appointed", "active"] as const;

/**
 * Data-room access map for a viewer on a deal, derived from their
 * appointed/active engagements: category -> permission. Returns null when
 * the viewer has no engagement-based access. Enforced server-side by the
 * deal documents routes; never trusted from the client.
 */
export async function getEngagementDocAccess(
  dealId: number,
  userId: string,
): Promise<Map<string, string> | null> {
  const rows = await db
    .select({ id: professionalEngagementsTable.id })
    .from(professionalEngagementsTable)
    .innerJoin(
      brokersTable,
      eq(professionalEngagementsTable.professionalId, brokersTable.id),
    )
    .where(
      and(
        eq(professionalEngagementsTable.dealId, dealId),
        eq(brokersTable.userId, userId),
        inArray(professionalEngagementsTable.status, [
          ...DATAROOM_ACTIVE_STATUSES,
        ]),
      ),
    );
  if (rows.length === 0) return null;

  const permissions = await db
    .select()
    .from(dealDocumentPermissionsTable)
    .where(
      inArray(
        dealDocumentPermissionsTable.engagementId,
        rows.map((r) => r.id),
      ),
    );
  const access = new Map<string, string>();
  const strength: Record<string, number> = {
    no_access: 0,
    view: 1,
    download: 2,
  };
  for (const p of permissions) {
    const current = access.get(p.category);
    if (!current || (strength[p.permission] ?? 0) > (strength[current] ?? 0)) {
      access.set(p.category, p.permission);
    }
  }
  return access;
}

/** True when the permission level allows seeing the document at all. */
export function permissionAllowsView(permission: string | undefined): boolean {
  return permission != null && permission !== "no_access";
}

/** True when the permission level allows downloading the file. */
export function permissionAllowsDownload(
  permission: string | undefined,
): boolean {
  return permission === "download";
}
