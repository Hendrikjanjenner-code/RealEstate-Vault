import {
  doublePrecision,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { dealsTable } from "./deals";

/**
 * One historical financial year for a deal. All monetary values are in the
 * deal's currency. Hotel-specific metrics (occupancy/ADR/RevPAR/GOP/F&B)
 * are null for non-hotel assets.
 */
export const dealFinancialsTable = pgTable(
  "deal_financials",
  {
    id: serial("id").primaryKey(),
    dealId: integer("deal_id")
      .notNull()
      .references(() => dealsTable.id),
    year: integer("year").notNull(),
    revenue: doublePrecision("revenue"),
    ebitda: doublePrecision("ebitda"),
    noi: doublePrecision("noi"),
    cashflow: doublePrecision("cashflow"),
    debtOutstanding: doublePrecision("debt_outstanding"),
    workingCapital: doublePrecision("working_capital"),
    opex: doublePrecision("opex"),
    capex: doublePrecision("capex"),
    // Hotel metrics
    occupancyPct: doublePrecision("occupancy_pct"),
    adr: doublePrecision("adr"),
    revpar: doublePrecision("revpar"),
    gop: doublePrecision("gop"),
    fnbRevenue: doublePrecision("fnb_revenue"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("deal_financials_deal_year_idx").on(t.dealId, t.year)],
);

/**
 * A named financing scenario. Scenarios are private to the user who created
 * them (each viewer models their own financing); inputs are stored, ratios
 * are computed server-side on read.
 */
export const financingScenariosTable = pgTable("financing_scenarios", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id")
    .notNull()
    .references(() => dealsTable.id),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  purchasePrice: doublePrecision("purchase_price").notNull(),
  equity: doublePrecision("equity").notNull(),
  debtAmount: doublePrecision("debt_amount").notNull(),
  interestRatePct: doublePrecision("interest_rate_pct").notNull(),
  amortizationYears: integer("amortization_years").notNull(),
  termYears: integer("term_years").notNull(),
  // Optional NOI override when historical financials are absent/adjusted.
  noiOverride: doublePrecision("noi_override"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type DealFinancialYear = typeof dealFinancialsTable.$inferSelect;
export type FinancingScenario = typeof financingScenariosTable.$inferSelect;
