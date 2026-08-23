import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { dealsTable, dealDocumentsTable } from "./deals";
import { professionalEngagementsTable } from "./dealTeam";

/**
 * Due diligence workstream per deal. Standard workstreams (financial, legal,
 * tax, technical, commercial, environmental, operational) are provisioned
 * server-side; hotel deals additionally get hotel_operational,
 * management_agreement and franchise_review. `key` is stable and unique per
 * deal so re-provisioning is idempotent.
 */
export const ddWorkstreamsTable = pgTable(
  "dd_workstreams",
  {
    id: serial("id").primaryKey(),
    dealId: integer("deal_id")
      .notNull()
      .references(() => dealsTable.id),
    key: text("key").notNull(),
    label: text("label").notNull(),
    // Appointed/active professional engagement responsible for this workstream.
    responsibleEngagementId: integer("responsible_engagement_id").references(
      () => professionalEngagementsTable.id,
    ),
    status: text("status").notNull().default("not_started"), // 'not_started' | 'in_progress' | 'blocked' | 'completed'
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique("dd_workstreams_deal_key_unique").on(t.dealId, t.key)],
);

/** Checklist item within a DD workstream. */
export const ddItemsTable = pgTable("dd_items", {
  id: serial("id").primaryKey(),
  workstreamId: integer("workstream_id")
    .notNull()
    .references(() => ddWorkstreamsTable.id),
  dealId: integer("deal_id")
    .notNull()
    .references(() => dealsTable.id),
  title: text("title").notNull(),
  description: text("description"),
  required: boolean("required").notNull().default(false),
  status: text("status").notNull().default("open"), // 'open' | 'in_progress' | 'waiting' | 'done' | 'na'
  note: text("note"),
  documentId: integer("document_id").references(() => dealDocumentsTable.id),
  updatedByUserId: text("updated_by_user_id"),
  updatedByName: text("updated_by_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Structured deal Q&A. Questions are asked by granted viewers (buy side /
 * advisors), assigned by the deal manager, and answered with text and/or a
 * data-room document. Lifecycle: open → assigned → answered → follow_up →
 * closed.
 */
export const dealQuestionsTable = pgTable("deal_questions", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id")
    .notNull()
    .references(() => dealsTable.id),
  // DD workstream key the question belongs to ('legal', 'financial', ...).
  category: text("category").notNull(),
  question: text("question").notNull(),
  detail: text("detail"),
  askedByUserId: text("asked_by_user_id").notNull(),
  askedByName: text("asked_by_name"),
  // Assignment target: an engagement on the deal team, or the manager.
  assignedEngagementId: integer("assigned_engagement_id").references(
    () => professionalEngagementsTable.id,
  ),
  assignedParty: text("assigned_party"), // 'manager' | deal-team role key
  status: text("status").notNull().default("open"), // 'open' | 'assigned' | 'answered' | 'follow_up' | 'closed'
  answerText: text("answer_text"),
  answerDocumentId: integer("answer_document_id").references(
    () => dealDocumentsTable.id,
  ),
  answeredByUserId: text("answered_by_user_id"),
  answeredByName: text("answered_by_name"),
  answeredAt: timestamp("answered_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type DdWorkstream = typeof ddWorkstreamsTable.$inferSelect;
export type DdItem = typeof ddItemsTable.$inferSelect;
export type DealQuestion = typeof dealQuestionsTable.$inferSelect;
