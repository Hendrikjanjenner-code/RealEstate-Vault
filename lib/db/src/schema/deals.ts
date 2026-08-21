import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  doublePrecision,
  timestamp,
  varchar,
  primaryKey,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dealsTable = pgTable("deals", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  dealType: text("deal_type").notNull(),
  assetClass: text("asset_class").notNull(),
  country: text("country").notNull(),
  city: text("city").notNull(),
  region: text("region"),
  locationPrivacy: text("location_privacy"),
  askingPrice: doublePrecision("asking_price"),
  priceMax: doublePrecision("price_max"),
  currency: text("currency").notNull().default("EUR"),
  grossYield: doublePrecision("gross_yield"),
  netYield: doublePrecision("net_yield"),
  areaSqm: doublePrecision("area_sqm"),
  keys: integer("keys"),
  constructionYear: integer("construction_year"),
  occupancyPct: doublePrecision("occupancy_pct"),
  status: text("status").notNull().default("active"),
  confidential: boolean("confidential").notNull().default(false),
  teaser: text("teaser"),
  description: text("description"),
  imageUrl: text("image_url"),
  brokerId: integer("broker_id"),
  // Auth user id of the listing broker (owner). Null for legacy/seeded deals.
  brokerUserId: varchar("broker_user_id"),
  brokerName: text("broker_name"),
  brokerCompany: text("broker_company"),
  views: integer("views").notNull().default(0),
  accessRequests: integer("access_requests").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertDealSchema = createInsertSchema(dealsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertDeal = z.infer<typeof insertDealSchema>;
export type Deal = typeof dealsTable.$inferSelect;

export const dealDocumentsTable = pgTable("deal_documents", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  sizeKb: integer("size_kb").notNull(),
  ndaRequired: boolean("nda_required").notNull().default(true),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type DealDocument = typeof dealDocumentsTable.$inferSelect;

// Per-user saved deals: one row means the user has saved that deal.
export const savedDealsTable = pgTable(
  "saved_deals",
  {
    userId: varchar("user_id").notNull(),
    dealId: integer("deal_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.dealId] })],
);

export type SavedDeal = typeof savedDealsTable.$inferSelect;

export const accessRequestsTable = pgTable("access_requests", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").notNull(),
  dealTitle: text("deal_title").notNull(),
  // Auth user id of the requesting investor. Null for legacy/seeded requests.
  requesterUserId: varchar("requester_user_id"),
  requesterName: text("requester_name").notNull(),
  requesterCompany: text("requester_company").notNull(),
  message: text("message"),
  status: text("status").notNull().default("pending"),
  // Recorded when the investor signs the NDA themselves.
  signerName: text("signer_name"),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AccessRequest = typeof accessRequestsTable.$inferSelect;
