import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  doublePrecision,
  timestamp,
  varchar,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Deal Team engagements: one row per professional invited to a deal role.
 * The row carries the full invitation → engagement lifecycle:
 *   invited → interested | info_requested | declined
 *   → proposal_sent | negotiation (fee back-and-forth)
 *   → appointed → active → completed | cancelled
 * Appointed/active/completed rows ARE the deal team members.
 */
export const professionalEngagementsTable = pgTable(
  "professional_engagements",
  {
    id: serial("id").primaryKey(),
    dealId: integer("deal_id").notNull(),
    // brokers.id of the invited professional.
    professionalId: integer("professional_id").notNull(),
    // Deal team role slug (selling_broker, legal_counsel, ...). The canonical
    // list is served by the API, never hardcoded in clients.
    role: text("role").notNull(),
    // Auth user id of the broker who sent the invitation.
    invitedByUserId: varchar("invited_by_user_id").notNull(),
    invitedByName: text("invited_by_name").notNull(),
    scope: text("scope"),
    message: text("message"),
    status: text("status").notNull().default("invited"),
    // Reasoned match score snapshot at invitation time.
    matchScore: doublePrecision("match_score"),
    matchReasons: text("match_reasons").array(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // One live engagement per professional per deal role.
    uniqueIndex("engagement_deal_role_professional_idx").on(
      table.dealId,
      table.role,
      table.professionalId,
    ),
  ],
);

export type ProfessionalEngagement =
  typeof professionalEngagementsTable.$inferSelect;

/**
 * Fee proposals attached to an engagement. Either side can propose; a new
 * proposal supersedes earlier open ones.
 */
export const feeProposalsTable = pgTable("fee_proposals", {
  id: serial("id").primaryKey(),
  engagementId: integer("engagement_id").notNull(),
  proposedByUserId: varchar("proposed_by_user_id").notNull(),
  proposedByName: text("proposed_by_name").notNull(),
  // fixed | hourly | percentage | success | retainer | custom
  feeType: text("fee_type").notNull(),
  amount: doublePrecision("amount"),
  currency: text("currency").notNull().default("EUR"),
  percentage: doublePrecision("percentage"),
  vatIncluded: boolean("vat_included").notNull().default(false),
  paymentTerms: text("payment_terms"),
  scopeDescription: text("scope_description"),
  // proposed | accepted | rejected | superseded
  status: text("status").notNull().default("proposed"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type FeeProposal = typeof feeProposalsTable.$inferSelect;

/**
 * Granular data-room rights per engagement per document category.
 * Enforced server-side in the deal documents routes; a professional only
 * ever sees categories they were explicitly granted.
 * permission: view | download | upload | comment | no_access
 */
export const dealDocumentPermissionsTable = pgTable(
  "deal_document_permissions",
  {
    id: serial("id").primaryKey(),
    engagementId: integer("engagement_id").notNull(),
    category: text("category").notNull(),
    permission: text("permission").notNull().default("no_access"),
  },
  (table) => [
    uniqueIndex("doc_permission_engagement_category_idx").on(
      table.engagementId,
      table.category,
    ),
  ],
);

export type DealDocumentPermission =
  typeof dealDocumentPermissionsTable.$inferSelect;
