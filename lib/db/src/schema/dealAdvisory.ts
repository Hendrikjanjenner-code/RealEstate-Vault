import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  varchar,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Admin-configurable document checklist templates. A template applies to
 * deals matching its (nullable = any) asset class / country / deal type /
 * transaction structure. Readiness is computed by matching a deal's data-room
 * documents against the template's items — never hardcoded.
 */
export const checklistTemplatesTable = pgTable("checklist_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  // Match criteria; null means "applies to any".
  assetClass: text("asset_class"),
  country: text("country"),
  dealType: text("deal_type"),
  transactionStructure: text("transaction_structure"),
  createdByUserId: varchar("created_by_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ChecklistTemplate = typeof checklistTemplatesTable.$inferSelect;

/**
 * Immutable, deal-scoped audit events. Rows are append-only: mutations that
 * overwrite state elsewhere (risk status changes, checklist overrides,
 * document edits/deletions, access decisions) each write an event here so
 * the transaction timeline retains full history.
 */
export const dealEventsTable = pgTable("deal_events", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  detail: text("detail"),
  // Data-room document category for document events; lets the timeline apply
  // category-level engagement permissions even for deleted documents.
  category: text("category"),
  // 'all' = visible to any timeline reader; 'manager' = deal manager only.
  visibility: text("visibility").notNull().default("all"),
  actorUserId: varchar("actor_user_id"),
  actorName: text("actor_name"),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type DealEvent = typeof dealEventsTable.$inferSelect;

/** Items in a checklist template, matched to deal document categories. */
export const checklistTemplateItemsTable = pgTable("checklist_template_items", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull(),
  // Data-room document category this item is satisfied by (e.g. Financials).
  category: text("category").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  required: boolean("required").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export type ChecklistTemplateItem =
  typeof checklistTemplateItemsTable.$inferSelect;

/**
 * Per-deal manual status overrides for checklist items. Default status is
 * computed from the data room (available/missing); the deal manager can mark
 * items outdated, needing signature, or needing professional review.
 * status: available | missing | outdated | needs_signature | needs_review
 */
export const dealChecklistStatusTable = pgTable(
  "deal_checklist_status",
  {
    id: serial("id").primaryKey(),
    dealId: integer("deal_id").notNull(),
    templateItemId: integer("template_item_id").notNull(),
    status: text("status").notNull(),
    note: text("note"),
    updatedByUserId: varchar("updated_by_user_id").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("deal_checklist_status_deal_item_idx").on(
      table.dealId,
      table.templateItemId,
    ),
  ],
);

export type DealChecklistStatus = typeof dealChecklistStatusTable.$inferSelect;

/**
 * Risks & attention points per deal.
 * severity: critical | high | medium | low | informational
 * status: open | under_review | information_requested | resolved |
 *         accepted_risk | not_applicable
 */
export const dealRisksTable = pgTable("deal_risks", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  // financial | legal | tax | technical | financing | documentation | other
  category: text("category").notNull().default("other"),
  severity: text("severity").notNull().default("medium"),
  // Where the risk was identified (manual entry, document review, ...).
  source: text("source"),
  assignedToName: text("assigned_to_name"),
  status: text("status").notNull().default("open"),
  createdByUserId: varchar("created_by_user_id").notNull(),
  createdByName: text("created_by_name").notNull(),
  detectedAt: timestamp("detected_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type DealRisk = typeof dealRisksTable.$inferSelect;

/** Discussion comments on a risk. */
export const riskCommentsTable = pgTable("risk_comments", {
  id: serial("id").primaryKey(),
  riskId: integer("risk_id").notNull(),
  authorUserId: varchar("author_user_id").notNull(),
  authorName: text("author_name").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type RiskComment = typeof riskCommentsTable.$inferSelect;
