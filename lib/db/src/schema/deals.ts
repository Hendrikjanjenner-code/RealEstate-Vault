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
import { uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dealsTable = pgTable("deals", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  dealType: text("deal_type").notNull(),
  // e.g. asset_deal | share_deal; used for checklist template matching.
  transactionStructure: text("transaction_structure"),
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
  objectPath: text("object_path"),
  contentType: text("content_type"),
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
  // Capability token issued when the investor signs the NDA (Task 2: data room).
  downloadToken: text("download_token"),
  ndaSignedAt: timestamp("nda_signed_at", { withTimezone: true }),
  // Recorded when the investor signs the NDA themselves via the signing form.
  signerName: text("signer_name"),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  // Unguessable key the requester uses to self-sign and check their own status.
  requestKey: text("request_key"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AccessRequest = typeof accessRequestsTable.$inferSelect;

// Letters of Intent submitted by investors after signing the NDA. The full
// rendered LOI text is stored VERBATIM at submission time so later template
// changes never alter what was submitted (same principle as the NDA record).
export const loisTable = pgTable(
  "lois",
  {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").notNull(),
  // The nda_signed access request that unlocked this LOI.
  accessRequestId: integer("access_request_id"),
  investorUserId: varchar("investor_user_id").notNull(),
  investorName: text("investor_name").notNull(),
  investorCompany: text("investor_company").notNull(),
  // Verbatim LOI paragraphs as submitted (JSON array of strings serialized as text).
  documentText: text("document_text").notNull(),
  offerPrice: doublePrecision("offer_price").notNull(),
  currency: text("currency").notNull().default("EUR"),
  conditions: text("conditions"),
  exclusivityDays: integer("exclusivity_days").notNull(),
  validityDays: integer("validity_days").notNull(),
  // submitted -> under_review -> accepted | rejected
  status: text("status").notNull().default("submitted"),
  submittedAt: timestamp("submitted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  },
  (table) => [
    // At most one open (submitted/under_review/accepted) LOI per investor per deal.
    uniqueIndex("lois_open_per_investor_idx")
      .on(table.dealId, table.investorUserId)
      .where(sql`"status" IN ('submitted', 'under_review', 'accepted')`),
  ],
);

export type Loi = typeof loisTable.$inferSelect;
