import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

// In-app notifications, e.g. an investor's access request changing status.
export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  // Auth user id of the recipient.
  userId: varchar("user_id").notNull(),
  // Machine-readable kind, e.g. "access_request_status".
  type: text("type").notNull(),
  message: text("message").notNull(),
  dealId: integer("deal_id"),
  accessRequestId: integer("access_request_id"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Notification = typeof notificationsTable.$inferSelect;
