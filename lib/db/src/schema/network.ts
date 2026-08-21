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
});

export type Thread = typeof threadsTable.$inferSelect;

export const messagesTable = pgTable("messages", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").notNull(),
  senderName: text("sender_name").notNull(),
  body: text("body").notNull(),
  fromMe: boolean("from_me").notNull().default(false),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Message = typeof messagesTable.$inferSelect;

export const activityTable = pgTable("activity", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ActivityItem = typeof activityTable.$inferSelect;
