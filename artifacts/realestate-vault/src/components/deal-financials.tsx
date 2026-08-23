import { useState } from "react";
import {
  useGetDealFinancials,
  useListFinancingScenarios,
  getListFinancingScenariosQueryKey,
  useCreateFinancingScenario,
  useUpdateFinancingScenario,
  useDeleteFinancingScenario,
  useGetFinancingReadiness,
  usePrepareFinancingPack,
  getGetDealTimelineQueryKey,
} from "@workspace/api-client-react";
import type {
  DealFinancialYear,
  FinancingScenario,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Lock,
  TrendingUp,
  Landmark,
  Download,
  Plus,
  Trash2,
  Pencil,
  X,
  Gauge,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Formatting helpers (tabular figures, EUR-style compact money)
// ---------------------------------------------------------------------------
function fmtMoney(v: number | null | undefined, currency: string): string {
  if (v == null) return "—";
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${currency === "EUR" ? "€" : currency + " "}${(v / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  if (abs >= 1_000) return `${currency === "EUR" ? "€" : currency + " "}${(v / 1_000).toFixed(0)}K`;
  return `${currency === "EUR" ? "€" : currency + " "}${v.toFixed(0)}`;
}

function pct(v: number | null | undefined, digits = 1): string {
  return v == null ? "—" : `${v.toFixed(digits)}%`;
}

const CHART_COLORS = {
  primary: "hsl(43, 65%, 52%)", // Closa gold
  secondary: "hsl(210, 15%, 60%)",
  tertiary: "hsl(160, 45%, 45%)",
  grid: "hsl(220, 15%, 20%)",
};

const tooltipStyle = {
  backgroundColor: "hsl(222, 18%, 12%)",
  border: "1px solid hsl(220, 15%, 24%)",
  borderRadius: 8,
  fontSize: 12,
};

function LockedNotice({ label }: { label: string }) {
  return (
    <div className="border border-border rounded-xl p-8 text-center" data-testid="notice-financials-locked">
      <Lock className="w-6 h-6 mx-auto mb-3 text-muted-foreground" />
      <p className="text-sm text-muted-foreground max-w-md mx-auto">{label}</p>
    </div>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-border rounded-lg p-3 bg-card">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums mt-0.5">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground tabular-nums">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Financials tab
// ---------------------------------------------------------------------------
export function FinancialsTab({ dealId }: { dealId: number }) {
  const { data, isLoading, error } = useGetDealFinancials(dealId, {
    query: { enabled: !!dealId, queryKey: ["dealFinancials", dealId], retry: false },
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error) {
    return (
      <LockedNotice label="Financial details require granted access to this deal. Request access and sign the NDA to view historical figures and trends." />
    );
  }
  if (!data || data.years.length === 0) {
    return (
      <div className="border border-border rounded-xl p-8 text-center text-sm text-muted-foreground" data-testid="notice-no-financials">
        No historical financial figures have been recorded for this deal yet.
      </div>
    );
  }

  const { currency, years } = data;
  const isHotel = data.assetClass.toLowerCase().includes("hotel");
  const latest = years[years.length - 1];
  const prev = years.length > 1 ? years[years.length - 2] : null;
  const growth =
    latest.revenue != null && prev?.revenue != null && prev.revenue > 0
      ? ((latest.revenue - prev.revenue) / prev.revenue) * 100
      : null;
  const ebitdaMargin =
    latest.ebitda != null && latest.revenue != null && latest.revenue > 0
      ? (latest.ebitda / latest.revenue) * 100
      : null;
  const debtToEbitda =
    latest.debtOutstanding != null && latest.ebitda != null && latest.ebitda > 0
      ? latest.debtOutstanding / latest.ebitda
      : null;

  const chartData = years.map((y: DealFinancialYear) => ({
    year: String(y.year),
    Revenue: y.revenue,
    EBITDA: y.ebitda,
    NOI: y.noi,
    Cashflow: y.cashflow,
    Debt: y.debtOutstanding,
    Opex: y.opex,
    Capex: y.capex,
    Occupancy: y.occupancyPct,
    ADR: y.adr,
    RevPAR: y.revpar,
    GOP: y.gop,
    "F&B": y.fnbRevenue,
  }));

  const moneyTick = (v: number) => fmtMoney(v, currency);

  return (
    <div className="space-y-6" data-testid="tab-financials">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Revenue"
          value={fmtMoney(latest.revenue, currency)}
          sub={growth != null ? `${growth >= 0 ? "+" : ""}${growth.toFixed(1)}% YoY` : undefined}
        />
        <MetricCard
          label="EBITDA"
          value={fmtMoney(latest.ebitda, currency)}
          sub={ebitdaMargin != null ? `${ebitdaMargin.toFixed(1)}% margin` : undefined}
        />
        <MetricCard label="NOI" value={fmtMoney(latest.noi, currency)} />
        <MetricCard label="Cashflow" value={fmtMoney(latest.cashflow, currency)} />
        <MetricCard
          label="Debt"
          value={fmtMoney(latest.debtOutstanding, currency)}
          sub={debtToEbitda != null ? `${debtToEbitda.toFixed(1)}x Debt/EBITDA` : undefined}
        />
        <MetricCard label="Working capital" value={fmtMoney(latest.workingCapital, currency)} />
        <MetricCard label="Opex" value={fmtMoney(latest.opex, currency)} />
        <MetricCard label="Capex" value={fmtMoney(latest.capex, currency)} />
        {isHotel && (
          <>
            <MetricCard label="Occupancy" value={pct(latest.occupancyPct, 0)} />
            <MetricCard label="ADR" value={fmtMoney(latest.adr, currency)} />
            <MetricCard label="RevPAR" value={fmtMoney(latest.revpar, currency)} />
            <MetricCard label="GOP" value={fmtMoney(latest.gop, currency)} sub={`F&B ${fmtMoney(latest.fnbRevenue, currency)}`} />
          </>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="border border-border rounded-xl p-4">
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" /> Revenue, EBITDA & NOI
          </h4>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <XAxis dataKey="year" stroke={CHART_COLORS.secondary} fontSize={11} />
              <YAxis stroke={CHART_COLORS.secondary} fontSize={11} tickFormatter={moneyTick} width={64} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtMoney(v as number, currency)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="Revenue" stroke={CHART_COLORS.primary} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="EBITDA" stroke={CHART_COLORS.tertiary} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="NOI" stroke={CHART_COLORS.secondary} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="border border-border rounded-xl p-4">
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Landmark className="w-4 h-4 text-primary" /> Debt, Cashflow & Capex
          </h4>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <XAxis dataKey="year" stroke={CHART_COLORS.secondary} fontSize={11} />
              <YAxis stroke={CHART_COLORS.secondary} fontSize={11} tickFormatter={moneyTick} width={64} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtMoney(v as number, currency)} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Debt" fill={CHART_COLORS.secondary} radius={[3, 3, 0, 0]} />
              <Bar dataKey="Cashflow" fill={CHART_COLORS.primary} radius={[3, 3, 0, 0]} />
              <Bar dataKey="Capex" fill={CHART_COLORS.tertiary} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {isHotel && (
          <div className="border border-border rounded-xl p-4 md:col-span-2">
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" /> Hotel KPIs — ADR, RevPAR & Occupancy
            </h4>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <XAxis dataKey="year" stroke={CHART_COLORS.secondary} fontSize={11} />
                <YAxis yAxisId="money" stroke={CHART_COLORS.secondary} fontSize={11} width={48} />
                <YAxis yAxisId="pct" orientation="right" stroke={CHART_COLORS.secondary} fontSize={11} tickFormatter={(v) => `${v}%`} width={40} domain={[0, 100]} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line yAxisId="money" type="monotone" dataKey="ADR" stroke={CHART_COLORS.primary} strokeWidth={2} dot={{ r: 3 }} />
                <Line yAxisId="money" type="monotone" dataKey="RevPAR" stroke={CHART_COLORS.tertiary} strokeWidth={2} dot={{ r: 3 }} />
                <Line yAxisId="pct" type="monotone" dataKey="Occupancy" stroke={CHART_COLORS.secondary} strokeWidth={2} strokeDasharray="4 3" dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm" data-testid="table-financial-history">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
              <th className="px-3 py-2">Year</th>
              <th className="px-3 py-2 text-right">Revenue</th>
              <th className="px-3 py-2 text-right">EBITDA</th>
              <th className="px-3 py-2 text-right">NOI</th>
              <th className="px-3 py-2 text-right">Cashflow</th>
              <th className="px-3 py-2 text-right">Debt</th>
              <th className="px-3 py-2 text-right">Work. cap.</th>
              <th className="px-3 py-2 text-right">Opex</th>
              <th className="px-3 py-2 text-right">Capex</th>
              {isHotel && (
                <>
                  <th className="px-3 py-2 text-right">Occ.</th>
                  <th className="px-3 py-2 text-right">ADR</th>
                  <th className="px-3 py-2 text-right">RevPAR</th>
                  <th className="px-3 py-2 text-right">GOP</th>
                  <th className="px-3 py-2 text-right">F&B</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {years.map((y: DealFinancialYear) => (
              <tr key={y.year} className="border-b border-border/50 last:border-0">
                <td className="px-3 py-2 font-medium tabular-nums">{y.year}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(y.revenue, currency)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(y.ebitda, currency)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(y.noi, currency)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(y.cashflow, currency)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(y.debtOutstanding, currency)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(y.workingCapital, currency)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(y.opex, currency)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(y.capex, currency)}</td>
                {isHotel && (
                  <>
                    <td className="px-3 py-2 text-right tabular-nums">{pct(y.occupancyPct, 0)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(y.adr, currency)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(y.revpar, currency)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(y.gop, currency)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(y.fnbRevenue, currency)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Figures as provided by the deal manager; not independently audited.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Financing tab
// ---------------------------------------------------------------------------
const EMPTY_FORM = {
  name: "",
  purchasePrice: "",
  equity: "",
  debtAmount: "",
  interestRatePct: "",
  amortizationYears: "",
  termYears: "",
  noiOverride: "",
};

export function FinancingTab({ dealId, dealTitle }: { dealId: number; dealTitle: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const scenariosKey = getListFinancingScenariosQueryKey(dealId);
  const { data: scenarios, isLoading, error } = useListFinancingScenarios(dealId, {
    query: { enabled: !!dealId, queryKey: scenariosKey, retry: false },
  });
  const { data: readiness } = useGetFinancingReadiness(dealId, {
    query: { enabled: !!dealId && !error, queryKey: ["financingReadiness", dealId], retry: false },
  });
  const createScenario = useCreateFinancingScenario();
  const updateScenario = useUpdateFinancingScenario();
  const deleteScenario = useDeleteFinancingScenario();
  const preparePack = usePrepareFinancingPack();
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error) {
    return (
      <LockedNotice label="Financing tools require granted access to this deal. Request access and sign the NDA to model financing scenarios." />
    );
  }

  const num = (v: string) => (v.trim() === "" ? NaN : Number(v));
  const submit = () => {
    const body = {
      name: form.name.trim(),
      purchasePrice: num(form.purchasePrice),
      equity: num(form.equity),
      debtAmount: num(form.debtAmount),
      interestRatePct: num(form.interestRatePct),
      amortizationYears: num(form.amortizationYears),
      termYears: num(form.termYears),
      noiOverride: form.noiOverride.trim() === "" ? null : Number(form.noiOverride),
    };
    if (!body.name || Object.entries(body).some(([k, v]) => k !== "noiOverride" && k !== "name" && Number.isNaN(v))) {
      toast({ title: "Missing inputs", description: "Fill in all scenario fields with numbers.", variant: "destructive" });
      return;
    }
    const onDone = {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: scenariosKey });
        setForm(EMPTY_FORM);
        setShowForm(false);
        setEditingId(null);
      },
      onError: (e: unknown) => {
        const msg = e instanceof Error ? e.message : "Could not save the scenario.";
        toast({ title: "Scenario not saved", description: msg, variant: "destructive" });
      },
    };
    if (editingId != null) {
      updateScenario.mutate({ id: editingId, data: body }, onDone);
    } else {
      createScenario.mutate({ id: dealId, data: body }, onDone);
    }
  };

  const startEdit = (s: FinancingScenario) => {
    setEditingId(s.id);
    setShowForm(true);
    setForm({
      name: s.name,
      purchasePrice: String(s.purchasePrice),
      equity: String(s.equity),
      debtAmount: String(s.debtAmount),
      interestRatePct: String(s.interestRatePct),
      amortizationYears: String(s.amortizationYears),
      termYears: String(s.termYears),
      noiOverride: s.noiOverride != null ? String(s.noiOverride) : "",
    });
  };

  const downloadPack = () => {
    preparePack.mutate(
      { id: dealId },
      {
        onSuccess: (pack) => {
          const blob = new Blob([pack.report], { type: "text/markdown" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `financing-pack-${dealTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`;
          a.click();
          URL.revokeObjectURL(url);
          queryClient.invalidateQueries({ queryKey: getGetDealTimelineQueryKey(dealId) });
          toast({ title: "Financing pack ready", description: "The pack has been downloaded as a Markdown report." });
        },
        onError: (e: unknown) => {
          const msg = e instanceof Error ? e.message : "Could not prepare the financing pack.";
          toast({ title: "Financing pack failed", description: msg, variant: "destructive" });
        },
      },
    );
  };

  const fields: Array<{ key: keyof typeof EMPTY_FORM; label: string; placeholder: string }> = [
    { key: "name", label: "Scenario name", placeholder: "e.g. Base Case" },
    { key: "purchasePrice", label: "Purchase price", placeholder: "38500000" },
    { key: "equity", label: "Equity", placeholder: "15500000" },
    { key: "debtAmount", label: "Desired debt", placeholder: "23000000" },
    { key: "interestRatePct", label: "Interest rate %", placeholder: "4.2" },
    { key: "amortizationYears", label: "Amortization (years, 0 = interest-only)", placeholder: "25" },
    { key: "termYears", label: "Term (years)", placeholder: "7" },
    { key: "noiOverride", label: "NOI override (optional)", placeholder: "Latest historical NOI is used if empty" },
  ];

  return (
    <div className="space-y-6" data-testid="tab-financing">
      {readiness && (
        <div className="border border-border rounded-xl p-4" data-testid="panel-readiness">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Gauge className="w-4 h-4 text-primary" /> Financing Readiness Score
            </h4>
            <span className="text-2xl font-semibold tabular-nums" data-testid="text-readiness-score">
              {readiness.score}<span className="text-sm text-muted-foreground">/{readiness.maxScore}</span>
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {readiness.factors.map((f) => (
              <div key={f.key}>
                <div className="flex justify-between text-xs mb-0.5">
                  <span>{f.label}</span>
                  <span className="tabular-nums text-muted-foreground">{Math.round(f.score)}/{f.maxScore}</span>
                </div>
                <div className="h-1.5 rounded bg-border overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${(f.score / f.maxScore) * 100}%` }} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{f.explanation}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-amber-400/80 mt-3" data-testid="text-readiness-disclaimer">{readiness.disclaimer}</p>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="text-sm font-medium">Financing scenarios</h4>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => { setShowForm((v) => !v); setEditingId(null); setForm(EMPTY_FORM); }} data-testid="btn-new-scenario">
            {showForm && editingId == null ? <X className="w-4 h-4 mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
            {showForm && editingId == null ? "Cancel" : "New scenario"}
          </Button>
          <Button size="sm" onClick={downloadPack} disabled={preparePack.isPending} data-testid="btn-financing-pack">
            <Download className="w-4 h-4 mr-1" /> {preparePack.isPending ? "Preparing…" : "Prepare Financing Pack"}
          </Button>
        </div>
      </div>

      {showForm && (
        <div className="border border-border rounded-xl p-4 grid sm:grid-cols-2 gap-3" data-testid="form-scenario">
          {fields.map((f) => (
            <div key={f.key} className={f.key === "name" || f.key === "noiOverride" ? "sm:col-span-2" : ""}>
              <Label className="text-xs">{f.label}</Label>
              <Input
                value={form[f.key]}
                placeholder={f.placeholder}
                inputMode={f.key === "name" ? undefined : "decimal"}
                onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                data-testid={`input-scenario-${f.key}`}
              />
            </div>
          ))}
          <div className="sm:col-span-2">
            <Button size="sm" onClick={submit} disabled={createScenario.isPending || updateScenario.isPending} data-testid="btn-save-scenario">
              {editingId != null ? "Save changes" : "Create scenario"}
            </Button>
          </div>
        </div>
      )}

      {(scenarios ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="notice-no-scenarios">
          You have not modelled any financing scenarios for this deal yet. Create e.g. Conservative, Base and Higher Leverage scenarios to compare LTV, DSCR and Debt Yield.
        </p>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(scenarios ?? []).map((s) => (
            <div key={s.id} className="border border-border rounded-xl p-4 space-y-3" data-testid={`card-scenario-${s.id}`}>
              <div className="flex items-start justify-between gap-2">
                <h5 className="font-medium">{s.name}</h5>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(s)} data-testid={`btn-edit-scenario-${s.id}`}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() =>
                      deleteScenario.mutate(
                        { id: s.id },
                        { onSuccess: () => queryClient.invalidateQueries({ queryKey: scenariosKey }) },
                      )
                    }
                    data-testid={`btn-delete-scenario-${s.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-card border border-border py-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">LTV</p>
                  <p className="font-semibold tabular-nums">{s.metrics.ltvPct != null ? `${s.metrics.ltvPct.toFixed(1)}%` : "—"}</p>
                </div>
                <div className="rounded-lg bg-card border border-border py-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">DSCR</p>
                  <p className={`font-semibold tabular-nums ${s.metrics.dscr != null && s.metrics.dscr < 1.2 ? "text-amber-400" : ""}`}>
                    {s.metrics.dscr != null ? `${s.metrics.dscr.toFixed(2)}x` : "—"}
                  </p>
                </div>
                <div className="rounded-lg bg-card border border-border py-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Debt Yield</p>
                  <p className="font-semibold tabular-nums">{s.metrics.debtYieldPct != null ? `${s.metrics.debtYieldPct.toFixed(1)}%` : "—"}</p>
                </div>
              </div>
              <dl className="text-xs space-y-1 text-muted-foreground">
                <div className="flex justify-between"><dt>Purchase price</dt><dd className="tabular-nums text-foreground">{fmtMoney(s.purchasePrice, "EUR")}</dd></div>
                <div className="flex justify-between"><dt>Equity / Debt</dt><dd className="tabular-nums text-foreground">{fmtMoney(s.equity, "EUR")} / {fmtMoney(s.debtAmount, "EUR")}</dd></div>
                <div className="flex justify-between"><dt>Rate / Amort. / Term</dt><dd className="tabular-nums text-foreground">{s.interestRatePct}% / {s.amortizationYears === 0 ? "IO" : `${s.amortizationYears}y`} / {s.termYears}y</dd></div>
                <div className="flex justify-between"><dt>Annual debt service</dt><dd className="tabular-nums text-foreground">{fmtMoney(s.metrics.annualDebtService, "EUR")}</dd></div>
                <div className="flex justify-between"><dt>NOI used</dt><dd className="tabular-nums text-foreground">{fmtMoney(s.metrics.noiUsed, "EUR")} ({s.metrics.noiSource})</dd></div>
              </dl>
              <p className="text-[10px] text-muted-foreground border-t border-border/50 pt-2">
                Assumptions as entered by you. DSCR and Debt Yield use {s.metrics.noiSource === "override" ? "your NOI override" : s.metrics.noiSource === "historical" ? "the latest historical NOI" : "no NOI (add an override)"}.
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
