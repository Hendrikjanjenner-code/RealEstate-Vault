import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  doublePrecision,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const brokersTable = pgTable("brokers", {
  id: serial("id").primaryKey(),
  // Auth user id this profile belongs to. Null for seeded demo personas.
  userId: varchar("user_id").unique(),
  // Seeded demo personas are flagged so the UI can label them clearly.
  isDemo: boolean("is_demo").notNull().default(false),
  name: text("name").notNull(),
  company: text("company").notNull(),
  title: text("title").notNull(),
  city: text("city").notNull(),
  country: text("country").notNull(),
  verified: boolean("verified").notNull().default(false),
  score: doublePrecision("score").notNull().default(0),
  closedDeals: integer("closed_deals").notNull().default(0),
  transactionVolume: doublePrecision("transaction_volume").notNull().default(0),
  yearsExperience: integer("years_experience").notNull().default(0),
  specialisations: text("specialisations").array().notNull().default([]),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
});

export type Broker = typeof brokersTable.$inferSelect;

export const mandatesTable = pgTable("mandates", {
  id: serial("id").primaryKey(),
  // Auth user id of the investor who created the mandate. Null for seeded demo data.
  ownerUserId: varchar("owner_user_id"),
  title: text("title").notNull(),
  investorName: text("investor_name").notNull(),
  investorType: text("investor_type").notNull(),
  assetClasses: text("asset_classes").array().notNull().default([]),
  countries: text("countries").array().notNull().default([]),
  minSize: doublePrecision("min_size").notNull(),
  maxSize: doublePrecision("max_size").notNull(),
  strategy: text("strategy").notNull(),
  yieldTarget: doublePrecision("yield_target"),
  status: text("status").notNull().default("active"),
  matches: integer("matches").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Mandate = typeof mandatesTable.$inferSelect;

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  dealTitle: text("deal_title").notNull(),
  assetClass: text("asset_class").notNull(),
  country: text("country").notNull(),
  city: text("city").notNull(),
  price: doublePrecision("price").notNull(),
  currency: text("currency").notNull().default("EUR"),
  verified: boolean("verified").notNull().default(true),
  closedAt: timestamp("closed_at", { withTimezone: true }).notNull(),
  brokerName: text("broker_name").notNull(),
  buyerType: text("buyer_type").notNull(),
});

export type Transaction = typeof transactionsTable.$inferSelect;

export const threadsTable = pgTable("threads", {
  id: serial("id").primaryKey(),
  subject: text("subject").notNull(),
  dealId: integer("deal_id"),
  counterpartName: text("counterpart_name").notNull(),
  counterpartCompany: text("counterpart_company").notNull(),
  unread: integer("unread").notNull().default(0),
  // Real account-to-account threads carry both participants' auth user ids.
  // Legacy/seeded showcase threads leave both null and stay visible to all
  // authenticated users.
  participantAUserId: varchar("participant_a_user_id"),
  participantBUserId: varchar("participant_b_user_id"),
  // Display identities for each participant so the counterpart can be
  // presented per viewer. Null on legacy threads (which use the static
  // counterpartName/Company fields for everyone).
  participantAName: text("participant_a_name"),
  participantACompany: text("participant_a_company"),
  participantBName: text("participant_b_name"),
  participantBCompany: text("participant_b_company"),
  // For participant threads: which participant the unread count applies to.
  // Null on legacy threads (their static unread is shown to everyone).
  unreadForUserId: varchar("unread_for_user_id"),
});

export type Thread = typeof threadsTable.$inferSelect;

export const messagesTable = pgTable("messages", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").notNull(),
  senderName: text("sender_name").notNull(),
  body: text("body").notNull(),
  fromMe: boolean("from_me").notNull().default(false),
  // Auth user id of the sender for participant threads; null on legacy
  // seeded messages (which rely on the static fromMe flag instead).
  senderUserId: varchar("sender_user_id"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Message = typeof messagesTable.$inferSelect;

// A property owner's assignment: a property they want a broker for
// (sale, lease, or valuation). Visible to brokers while open.
export const ownerAssignmentsTable = pgTable("owner_assignments", {
  id: serial("id").primaryKey(),
  // Auth user id of the property owner who posted the assignment.
  ownerUserId: varchar("owner_user_id").notNull(),
  ownerName: text("owner_name").notNull(),
  ownerCompany: text("owner_company"),
  title: text("title").notNull(),
  // Property type, e.g. Hotels | Offices | Retail | Residential | Logistics | Mixed-use
  propertyType: text("property_type").notNull(),
  country: text("country").notNull(),
  city: text("city").notNull(),
  areaSqm: doublePrecision("area_sqm"),
  indicativeValue: doublePrecision("indicative_value"),
  currency: text("currency").notNull().default("EUR"),
  // Goal: sell | lease | valuation
  goal: text("goal").notNull(),
  description: text("description"),
  // open | closed
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type OwnerAssignment = typeof ownerAssignmentsTable.$inferSelect;

// An owner's connection request to a broker (optionally about a specific
// assignment). Acceptance opens a private thread between the two accounts.
export const brokerConnectionsTable = pgTable("broker_connections", {
  id: serial("id").primaryKey(),
  ownerUserId: varchar("owner_user_id").notNull(),
  ownerName: text("owner_name").notNull(),
  ownerCompany: text("owner_company"),
  // Broker directory profile the request is addressed to.
  brokerId: integer("broker_id").notNull(),
  assignmentId: integer("assignment_id"),
  message: text("message").notNull(),
  // pending | accepted | declined
  status: text("status").notNull().default("pending"),
  threadId: integer("thread_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
});

export type BrokerConnection = typeof brokerConnectionsTable.$inferSelect;

export const activityTable = pgTable("activity", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ActivityItem = typeof activityTable.$inferSelect;
