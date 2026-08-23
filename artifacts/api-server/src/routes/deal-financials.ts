import { Router, type IRouter, type Request } from "express";
import { and, asc, eq } from "drizzle-orm";
import {
  db,
  dealsTable,
  dealDocumentsTable,
  dealFinancialsTable,
  financingScenariosTable,
  type Deal,
  type DealFinancialYear,
  type FinancingScenario,
} from "@workspace/db";
import {
  GetDealFinancialsParams,
  GetDealFinancialsResponse,
  UpsertDealFinancialsParams,
  UpsertDealFinancialsBody,
  UpsertDealFinancialsResponse,
  ListFinancingScenariosParams,
  ListFinancingScenariosResponse,
  CreateFinancingScenarioParams,
  CreateFinancingScenarioBody,
  CreateFinancingScenarioResponse,
  UpdateFinancingScenarioParams,
  UpdateFinancingScenarioBody,
  UpdateFinancingScenarioResponse,
  GetFinancingReadinessParams,
  GetFinancingReadinessResponse,
  PrepareFinancingPackParams,
  PrepareFinancingPackResponse,
} from "@workspace/api-zod";
import { getAccessStatuses } from "./deals";
import { recordDealEvent } from "../lib/dealEvents";
import { loadDeal, actorName } from "./deal-ai";

const router: IRouter = Router();

const toJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const READINESS_DISCLAIMER =
  "The Financing Readiness Score reflects how complete this deal's documentation, financial history and debt capacity indicators are. It is explicitly NOT a guarantee, promise or prediction that financing will be obtained.";

// ---------------------------------------------------------------------------
// Access policy: financial figures and financing tools are confidential deal
// content — restricted to the deal manager and viewers with granted access
// (signed NDA / owner / non-confidential deal). Category-scoped engagement
// professionals and basic viewers get 403, mirroring the advisory policy.
// ---------------------------------------------------------------------------
/**
 * Strict manager check: only the deal's assigned listing broker manages its
 * financials. Deliberately NOT the data-room convenience fallback where any
 * broker can manage an unowned deal — that would leak confidential figures.
 */
function isFinancialManager(req: Request, deal: Deal): boolean {
  return (
    req.isAuthenticated() &&
    deal.brokerUserId != null &&
    req.user.id === deal.brokerUserId
  );
}

async function requireFinancialAccess(
  req: Request,
  deal: Deal,
): Promise<"manager" | "granted" | null> {
  if (!req.isAuthenticated()) return null;
  if (isFinancialManager(req, deal)) return "manager";
  const statuses = await getAccessStatuses([deal], req.user.id);
  if (statuses.get(deal.id) === "granted") return "granted";
  return null;
}

function presentYear(y: DealFinancialYear) {
  return {
    id: y.id,
    dealId: y.dealId,
    year: y.year,
    revenue: y.revenue,
    ebitda: y.ebitda,
    noi: y.noi,
    cashflow: y.cashflow,
    debtOutstanding: y.debtOutstanding,
    workingCapital: y.workingCapital,
    opex: y.opex,
    capex: y.capex,
    occupancyPct: y.occupancyPct,
    adr: y.adr,
    revpar: y.revpar,
    gop: y.gop,
    fnbRevenue: y.fnbRevenue,
  };
}

async function loadYears(dealId: number): Promise<DealFinancialYear[]> {
  return db
    .select()
    .from(dealFinancialsTable)
    .where(eq(dealFinancialsTable.dealId, dealId))
    .orderBy(asc(dealFinancialsTable.year));
}

/** Latest historical NOI, if any. */
function latestNoi(years: DealFinancialYear[]): number | null {
  for (let i = years.length - 1; i >= 0; i--) {
    const noi = years[i].noi;
    if (noi != null) return noi;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Financing math (annuity-based debt service)
// ---------------------------------------------------------------------------
export function annualDebtService(
  debt: number,
  interestRatePct: number,
  amortizationYears: number,
): number | null {
  if (debt <= 0) return 0;
  const r = interestRatePct / 100;
  if (amortizationYears === 0) {
    // Interest-only loan
    return debt * r;
  }
  if (r === 0) return debt / amortizationYears;
  const f = Math.pow(1 + r, amortizationYears);
  return (debt * r * f) / (f - 1);
}

function scenarioMetrics(
  s: FinancingScenario,
  historicalNoi: number | null,
): Record<string, unknown> {
  const noiUsed = s.noiOverride ?? historicalNoi;
  const noiSource = s.noiOverride != null ? "override" : historicalNoi != null ? "historical" : "none";
  const ads = annualDebtService(s.debtAmount, s.interestRatePct, s.amortizationYears);
  return {
    ltvPct: s.purchasePrice > 0 ? (s.debtAmount / s.purchasePrice) * 100 : null,
    dscr: noiUsed != null && ads != null && ads > 0 ? noiUsed / ads : null,
    debtYieldPct: noiUsed != null && s.debtAmount > 0 ? (noiUsed / s.debtAmount) * 100 : null,
    annualDebtService: ads,
    noiUsed,
    noiSource,
  };
}

function presentScenario(s: FinancingScenario, historicalNoi: number | null) {
  return {
    id: s.id,
    dealId: s.dealId,
    name: s.name,
    purchasePrice: s.purchasePrice,
    equity: s.equity,
    debtAmount: s.debtAmount,
    interestRatePct: s.interestRatePct,
    amortizationYears: s.amortizationYears,
    termYears: s.termYears,
    noiOverride: s.noiOverride,
    metrics: scenarioMetrics(s, historicalNoi),
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Financial history
// ---------------------------------------------------------------------------
router.get("/deals/:id/financials", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = GetDealFinancialsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const deal = await loadDeal(params.data.id);
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }
  if (!(await requireFinancialAccess(req, deal))) {
    res.status(403).json({
      error: "Financial details require granted access to this deal.",
    });
    return;
  }
  const years = await loadYears(deal.id);
  res.json(
    GetDealFinancialsResponse.parse(
      toJson({
        currency: deal.currency,
        assetClass: deal.assetClass,
        years: years.map(presentYear),
      }),
    ),
  );
});

router.put("/deals/:id/financials", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = UpsertDealFinancialsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpsertDealFinancialsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const deal = await loadDeal(params.data.id);
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }
  if (!isFinancialManager(req, deal)) {
    res.status(403).json({ error: "Only the deal manager can edit financials." });
    return;
  }
  const seen = new Set<number>();
  for (const y of body.data.years) {
    if (seen.has(y.year)) {
      res.status(400).json({ error: `Duplicate year ${y.year} in input.` });
      return;
    }
    seen.add(y.year);
  }
  await db.transaction(async (tx) => {
    await tx
      .delete(dealFinancialsTable)
      .where(eq(dealFinancialsTable.dealId, deal.id));
    if (body.data.years.length > 0) {
      await tx.insert(dealFinancialsTable).values(
        body.data.years.map((y) => ({
          dealId: deal.id,
          year: y.year,
          revenue: y.revenue ?? null,
          ebitda: y.ebitda ?? null,
          noi: y.noi ?? null,
          cashflow: y.cashflow ?? null,
          debtOutstanding: y.debtOutstanding ?? null,
          workingCapital: y.workingCapital ?? null,
          opex: y.opex ?? null,
          capex: y.capex ?? null,
          occupancyPct: y.occupancyPct ?? null,
          adr: y.adr ?? null,
          revpar: y.revpar ?? null,
          gop: y.gop ?? null,
          fnbRevenue: y.fnbRevenue ?? null,
        })),
      );
    }
  });
  const years = await loadYears(deal.id);
  res.json(
    UpsertDealFinancialsResponse.parse(
      toJson({
        currency: deal.currency,
        assetClass: deal.assetClass,
        years: years.map(presentYear),
      }),
    ),
  );
});

// ---------------------------------------------------------------------------
// Financing scenarios (private to their creator)
// ---------------------------------------------------------------------------
router.get(
  "/deals/:id/financing/scenarios",
  async (req, res): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const params = ListFinancingScenariosParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const deal = await loadDeal(params.data.id);
    if (!deal) {
      res.status(404).json({ error: "Deal not found" });
      return;
    }
    if (!(await requireFinancialAccess(req, deal))) {
      res.status(403).json({
        error: "Financing tools require granted access to this deal.",
      });
      return;
    }
    const noi = latestNoi(await loadYears(deal.id));
    const scenarios = await db
      .select()
      .from(financingScenariosTable)
      .where(
        and(
          eq(financingScenariosTable.dealId, deal.id),
          eq(financingScenariosTable.userId, req.user.id),
        ),
      )
      .orderBy(asc(financingScenariosTable.id));
    res.json(
      ListFinancingScenariosResponse.parse(
        toJson(scenarios.map((s) => presentScenario(s, noi))),
      ),
    );
  },
);

router.post(
  "/deals/:id/financing/scenarios",
  async (req, res): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const params = CreateFinancingScenarioParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = CreateFinancingScenarioBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const deal = await loadDeal(params.data.id);
    if (!deal) {
      res.status(404).json({ error: "Deal not found" });
      return;
    }
    if (!(await requireFinancialAccess(req, deal))) {
      res.status(403).json({
        error: "Financing tools require granted access to this deal.",
      });
      return;
    }
    if (body.data.equity + body.data.debtAmount > body.data.purchasePrice * 1.5) {
      res.status(400).json({
        error:
          "Equity plus debt exceeds 150% of the purchase price — check the scenario inputs.",
      });
      return;
    }
    const [scenario] = await db
      .insert(financingScenariosTable)
      .values({
        dealId: deal.id,
        userId: req.user.id,
        name: body.data.name,
        purchasePrice: body.data.purchasePrice,
        equity: body.data.equity,
        debtAmount: body.data.debtAmount,
        interestRatePct: body.data.interestRatePct,
        amortizationYears: body.data.amortizationYears,
        termYears: body.data.termYears,
        noiOverride: body.data.noiOverride ?? null,
      })
      .returning();
    const noi = latestNoi(await loadYears(deal.id));
    res
      .status(201)
      .json(
        CreateFinancingScenarioResponse.parse(
          toJson(presentScenario(scenario, noi)),
        ),
      );
  },
);

router.patch("/financing/scenarios/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = UpdateFinancingScenarioParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateFinancingScenarioBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [existing] = await db
    .select()
    .from(financingScenariosTable)
    .where(
      and(
        eq(financingScenariosTable.id, params.data.id),
        eq(financingScenariosTable.userId, req.user.id),
      ),
    );
  if (!existing) {
    res.status(404).json({ error: "Scenario not found" });
    return;
  }
  // Require *current* access to the underlying deal — a scenario created
  // while granted must not keep exposing computed metrics after revocation.
  const scenarioDeal = await loadDeal(existing.dealId);
  if (!scenarioDeal || !(await requireFinancialAccess(req, scenarioDeal))) {
    res.status(403).json({ error: "Financing tools require granted access to this deal." });
    return;
  }
  const [scenario] = await db
    .update(financingScenariosTable)
    .set({
      name: body.data.name,
      purchasePrice: body.data.purchasePrice,
      equity: body.data.equity,
      debtAmount: body.data.debtAmount,
      interestRatePct: body.data.interestRatePct,
      amortizationYears: body.data.amortizationYears,
      termYears: body.data.termYears,
      noiOverride: body.data.noiOverride ?? null,
      updatedAt: new Date(),
    })
    .where(eq(financingScenariosTable.id, existing.id))
    .returning();
  const noi = latestNoi(await loadYears(existing.dealId));
  res.json(
    UpdateFinancingScenarioResponse.parse(
      toJson(presentScenario(scenario, noi)),
    ),
  );
});

router.delete("/financing/scenarios/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [existing] = await db
    .select()
    .from(financingScenariosTable)
    .where(
      and(
        eq(financingScenariosTable.id, id),
        eq(financingScenariosTable.userId, req.user.id),
      ),
    );
  if (!existing) {
    res.status(404).json({ error: "Scenario not found" });
    return;
  }
  const scenarioDeal = await loadDeal(existing.dealId);
  if (!scenarioDeal || !(await requireFinancialAccess(req, scenarioDeal))) {
    res.status(403).json({ error: "Financing tools require granted access to this deal." });
    return;
  }
  await db
    .delete(financingScenariosTable)
    .where(eq(financingScenariosTable.id, existing.id));
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Financing readiness score — deterministic, explicitly not a guarantee.
// ---------------------------------------------------------------------------
async function computeReadiness(deal: Deal) {
  const years = await loadYears(deal.id);
  const docs = await db
    .select()
    .from(dealDocumentsTable)
    .where(eq(dealDocumentsTable.dealId, deal.id));
  const categories = new Set(docs.map((d) => d.category));

  const factors: Array<{
    key: string;
    label: string;
    score: number;
    maxScore: number;
    explanation: string;
  }> = [];

  // 1. Documentation coverage (0–40)
  const wanted = ["Financials", "Legal", "Technical", "Tax", "Commercial"];
  const present = wanted.filter((c) => categories.has(c));
  factors.push({
    key: "documentation",
    label: "Data-room documentation",
    score: (present.length / wanted.length) * 40,
    maxScore: 40,
    explanation:
      present.length > 0
        ? `Categories present: ${present.join(", ")}. Missing: ${wanted.filter((c) => !categories.has(c)).join(", ") || "none"}.`
        : "No data-room documents in the key categories (Financials, Legal, Technical, Tax, Commercial) yet.",
  });

  // 2. Financial history depth (0–30)
  const yearsWithNumbers = years.filter(
    (y) => y.revenue != null || y.noi != null || y.ebitda != null,
  );
  factors.push({
    key: "history",
    label: "Financial history",
    score: Math.min(yearsWithNumbers.length, 3) * 10,
    maxScore: 30,
    explanation:
      yearsWithNumbers.length > 0
        ? `${yearsWithNumbers.length} year(s) of historical figures available (3+ years scores full points).`
        : "No historical financial figures recorded for this deal.",
  });

  // 3. Debt capacity indicators (0–30): NOI available and, if debt figures
  // exist, a healthy indicative debt yield at the asking price.
  const noi = latestNoi(years);
  let capacityScore = 0;
  let capacityExplanation = "No NOI available, so debt capacity cannot be assessed.";
  if (noi != null && noi > 0) {
    capacityScore = 15;
    capacityExplanation = "NOI is available for debt service assessment.";
    if (deal.askingPrice != null && deal.askingPrice > 0) {
      const indicativeDebtYield = (noi / (deal.askingPrice * 0.6)) * 100;
      if (indicativeDebtYield >= 8) {
        capacityScore = 30;
        capacityExplanation +=
          " Indicative debt yield at 60% LTV is 8%+ — comfortable capacity.";
      } else if (indicativeDebtYield >= 6) {
        capacityScore = 22;
        capacityExplanation +=
          " Indicative debt yield at 60% LTV is 6–8% — moderate capacity.";
      } else {
        capacityScore = 15;
        capacityExplanation +=
          " Indicative debt yield at 60% LTV is below 6% — leverage will be constrained.";
      }
    }
  }
  factors.push({
    key: "capacity",
    label: "Debt capacity indicators",
    score: capacityScore,
    maxScore: 30,
    explanation: capacityExplanation,
  });

  const score = Math.round(factors.reduce((sum, f) => sum + f.score, 0));
  return { score, maxScore: 100, factors, disclaimer: READINESS_DISCLAIMER };
}

router.get(
  "/deals/:id/financing/readiness",
  async (req, res): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const params = GetFinancingReadinessParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const deal = await loadDeal(params.data.id);
    if (!deal) {
      res.status(404).json({ error: "Deal not found" });
      return;
    }
    if (!(await requireFinancialAccess(req, deal))) {
      res.status(403).json({
        error: "Financing tools require granted access to this deal.",
      });
      return;
    }
    res.json(
      GetFinancingReadinessResponse.parse(toJson(await computeReadiness(deal))),
    );
  },
);

// ---------------------------------------------------------------------------
// Financing pack — structured, downloadable report. Audited.
// ---------------------------------------------------------------------------
function fmtMoney(v: number | null | undefined, currency: string): string {
  if (v == null) return "—";
  return `${currency} ${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

router.post("/deals/:id/financing/pack", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = PrepareFinancingPackParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const deal = await loadDeal(params.data.id);
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }
  if (!(await requireFinancialAccess(req, deal))) {
    res.status(403).json({
      error: "Financing tools require granted access to this deal.",
    });
    return;
  }

  const [years, readiness] = await Promise.all([
    loadYears(deal.id),
    computeReadiness(deal),
  ]);
  const noi = latestNoi(years);
  const scenarios = await db
    .select()
    .from(financingScenariosTable)
    .where(
      and(
        eq(financingScenariosTable.dealId, deal.id),
        eq(financingScenariosTable.userId, req.user.id),
      ),
    )
    .orderBy(asc(financingScenariosTable.id));

  const cur = deal.currency;
  const isHotel = deal.assetClass.toLowerCase().includes("hotel");
  const latest = years[years.length - 1];
  const missing: string[] = [];
  if (years.length === 0) missing.push("Historical financial figures");
  if (years.length > 0 && years.length < 3)
    missing.push("At least 3 years of financial history");
  if (noi == null) missing.push("Net Operating Income (NOI)");
  if (deal.transactionStructure == null) missing.push("Transaction structure");
  for (const f of readiness.factors) {
    if (f.key === "documentation" && f.score < f.maxScore)
      missing.push(`Complete data-room documentation (${f.explanation})`);
  }

  const lines: string[] = [];
  lines.push(`# Financing Pack — ${deal.title}`);
  lines.push("");
  lines.push("## 1. Executive Summary");
  lines.push(
    `${deal.assetClass} ${deal.dealType} in ${deal.city}, ${deal.country}. Asking price ${fmtMoney(deal.askingPrice, cur)}. ${years.length} year(s) of historical financials on record${noi != null ? `; latest NOI ${fmtMoney(noi, cur)}` : ""}. Financing Readiness Score: ${readiness.score}/100 (not a financing guarantee).`,
  );
  lines.push("");
  lines.push("## 2. Transaction Overview");
  lines.push(`- Deal type: ${deal.dealType}`);
  lines.push(`- Transaction structure: ${deal.transactionStructure ?? "not specified"}`);
  lines.push(`- Asset class: ${deal.assetClass}`);
  lines.push(`- Location: ${deal.city}, ${deal.region ?? ""} ${deal.country}`.replace(/\s+/g, " "));
  lines.push(`- Asking price: ${fmtMoney(deal.askingPrice, cur)}`);
  if (deal.grossYield != null) lines.push(`- Gross yield: ${deal.grossYield}%`);
  if (deal.netYield != null) lines.push(`- Net yield: ${deal.netYield}%`);
  if (deal.areaSqm != null) lines.push(`- Area: ${deal.areaSqm} sqm`);
  if (deal.keys != null) lines.push(`- Keys: ${deal.keys}`);
  lines.push("");
  lines.push("## 3. Historical Figures");
  if (years.length === 0) {
    lines.push("No historical financial figures are on record for this deal.");
  } else {
    const cols = ["Year", "Revenue", "EBITDA", "NOI", "Cashflow", "Debt", "Opex", "Capex"];
    if (isHotel) cols.push("Occupancy %", "ADR", "RevPAR", "GOP", "F&B");
    lines.push(`| ${cols.join(" | ")} |`);
    lines.push(`|${cols.map(() => "---").join("|")}|`);
    for (const y of years) {
      const row = [
        String(y.year),
        fmtMoney(y.revenue, cur),
        fmtMoney(y.ebitda, cur),
        fmtMoney(y.noi, cur),
        fmtMoney(y.cashflow, cur),
        fmtMoney(y.debtOutstanding, cur),
        fmtMoney(y.opex, cur),
        fmtMoney(y.capex, cur),
      ];
      if (isHotel)
        row.push(
          y.occupancyPct != null ? `${y.occupancyPct}%` : "—",
          fmtMoney(y.adr, cur),
          fmtMoney(y.revpar, cur),
          fmtMoney(y.gop, cur),
          fmtMoney(y.fnbRevenue, cur),
        );
      lines.push(`| ${row.join(" | ")} |`);
    }
    if (latest?.ebitda != null && latest?.revenue != null && latest.revenue > 0) {
      lines.push("");
      lines.push(
        `Latest EBITDA margin: ${((latest.ebitda / latest.revenue) * 100).toFixed(1)}%.`,
      );
    }
  }
  lines.push("");
  lines.push("## 4. Financing Ratios & Scenarios");
  if (scenarios.length === 0) {
    lines.push("No financing scenarios have been modelled by you for this deal yet.");
  } else {
    lines.push(
      "| Scenario | Purchase price | Equity | Debt | Rate | Amort. | Term | LTV | DSCR | Debt Yield |",
    );
    lines.push(`|${Array(10).fill("---").join("|")}|`);
    for (const s of scenarios) {
      const m = scenarioMetrics(s, noi) as {
        ltvPct: number | null;
        dscr: number | null;
        debtYieldPct: number | null;
      };
      lines.push(
        `| ${s.name} | ${fmtMoney(s.purchasePrice, cur)} | ${fmtMoney(s.equity, cur)} | ${fmtMoney(s.debtAmount, cur)} | ${s.interestRatePct}% | ${s.amortizationYears === 0 ? "IO" : `${s.amortizationYears}y`} | ${s.termYears}y | ${m.ltvPct != null ? `${m.ltvPct.toFixed(1)}%` : "—"} | ${m.dscr != null ? m.dscr.toFixed(2) : "—"} | ${m.debtYieldPct != null ? `${m.debtYieldPct.toFixed(1)}%` : "—"} |`,
      );
    }
    lines.push("");
    lines.push(
      "Assumptions per scenario are as entered by the preparer; DSCR/Debt Yield use the NOI override when provided, otherwise the latest historical NOI.",
    );
  }
  lines.push("");
  lines.push("## 5. Ownership & Structure");
  lines.push(
    `Listed by ${deal.brokerName ?? "the deal manager"}${deal.brokerCompany ? ` (${deal.brokerCompany})` : ""}. Transaction structure: ${deal.transactionStructure ?? "not specified"}. Detailed ownership/corporate structure documents should be verified in the data room.`,
  );
  lines.push("");
  lines.push("## 6. Financing Readiness");
  lines.push(`Score: ${readiness.score}/100`);
  for (const f of readiness.factors) {
    lines.push(`- ${f.label}: ${Math.round(f.score)}/${f.maxScore} — ${f.explanation}`);
  }
  lines.push("");
  lines.push("## 7. Missing Information");
  if (missing.length === 0) {
    lines.push("No key items identified as missing.");
  } else {
    for (const m of missing) lines.push(`- ${m}`);
  }
  lines.push("");
  lines.push("---");
  lines.push(READINESS_DISCLAIMER);

  const generatedAt = new Date();
  const generatedBy = actorName(req) ?? "Unknown user";

  await recordDealEvent({
    dealId: deal.id,
    kind: "financing_pack",
    title: `Financing pack prepared by ${generatedBy}`,
    detail: "Structured financing pack generated from recorded deal facts, financial history and scenarios.",
    visibility: "manager",
    req,
  });

  res.json(
    PrepareFinancingPackResponse.parse(
      toJson({
        report: lines.join("\n"),
        generatedAt: generatedAt.toISOString(),
        generatedBy,
        provenance:
          "Compiled from deal facts, recorded historical financials and the preparer's own financing scenarios. Figures are as provided by the deal manager and have not been independently audited.",
      }),
    ),
  );
});

export default router;
