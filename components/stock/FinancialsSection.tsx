'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TermTooltip } from '@/components/ui/TermTooltip';
import { useExperienceLevel } from '@/hooks/use-experience-level';
import { useAIPanel } from '@/components/ai/AIPanelProvider';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type {
  IncomeStatementPeriod,
  BalanceSheetPeriod,
  CashFlowPeriod,
  DividendItem,
  SplitItem,
} from '@/lib/twelvedata/twelvedata-client';

type Tab = 'income' | 'balance' | 'cashflow' | 'dividends' | 'splits';
type Period = 'quarterly' | 'annual';

interface FinancialsResponse {
  success: boolean;
  data?: unknown[];
  type: Tab;
  period: Period;
  error?: string;
}

// ---- Formatting helpers ----

function fmtNum(v: number | null | undefined): string {
  if (v === null || v === undefined || isNaN(v as number)) return '—';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1_000_000_000_000) return `${sign}$${(abs / 1_000_000_000_000).toFixed(2)}T`;
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${v.toFixed(2)}`;
}

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined || isNaN(v as number)) return '—';
  return `$${v.toFixed(2)}`;
}

// ---- Trend helpers ----

/**
 * Compares the most-recent value against the oldest visible period.
 * Returns a short label + color class to show directional trend.
 * For "cost" metrics (expenses, debt) an increase is negative.
 */
function getTrend(
  values: (number | null | undefined)[],
  costMetric = false
): { label: string; cls: string } | null {
  const filtered = values.filter((v): v is number => v != null && !isNaN(v));
  if (filtered.length < 2) return null;

  const newest = filtered[0];
  const oldest = filtered[filtered.length - 1];
  if (oldest === 0) return null;

  const pct = ((newest - oldest) / Math.abs(oldest)) * 100;
  const improving = costMetric ? pct < 0 : pct > 0;
  const neutral = Math.abs(pct) < 2;

  if (neutral) return { label: 'Flat', cls: 'text-muted-foreground/60' };
  if (improving) return { label: `+${Math.abs(pct).toFixed(0)}%`, cls: 'text-emerald-500' };
  return { label: `-${Math.abs(pct).toFixed(0)}%`, cls: 'text-red-500' };
}

// ---- Sub-components ----

interface TableRow<T> {
  label: string;
  key: keyof T;
  fmt: (v: T[keyof T]) => string;
  highlight?: boolean;
  /** Set true for expense/debt rows where growth = bad */
  costMetric?: boolean;
}

interface TableProps<T> {
  rows: TableRow<T>[];
  data: T[];
  dateKey: keyof T;
}

function FinancialTable<T extends Record<string, unknown>>({ rows, data, dateKey }: TableProps<T>) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        No data available
      </div>
    );
  }

  const cols = data.slice(0, 5);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="py-2.5 text-left font-medium text-muted-foreground w-44 min-w-[160px]">
              Period
            </th>
            {/* Trend column */}
            <th className="py-2.5 text-center font-medium text-muted-foreground px-3 min-w-[60px]">
              Trend
            </th>
            {cols.map((col, i) => (
              <th key={i} className="py-2.5 text-right font-medium text-muted-foreground tabular-nums px-3 min-w-[90px]">
                {String(col[dateKey]).slice(0, 7)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ label, key, fmt: fmtFn, highlight, costMetric }) => {
            const allValues = cols.map((col) => col[key] as number | null | undefined);
            const trend = getTrend(allValues, costMetric);

            return (
              <tr
                key={String(key)}
                className={`border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors ${
                  highlight ? 'bg-muted/20' : ''
                }`}
              >
                <td className={`py-2.5 pr-4 ${highlight ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                  {label}
                </td>
                {/* Trend cell */}
                <td className="py-2.5 text-center px-3">
                  {trend ? (
                    <span className={`font-medium tabular-nums ${trend.cls}`}>{trend.label}</span>
                  ) : (
                    <span className="text-muted-foreground/30">—</span>
                  )}
                </td>
                {cols.map((col, i) => {
                  const val = col[key];
                  const formatted = fmtFn(val);
                  const isNeg = typeof val === 'number' && val < 0;
                  return (
                    <td
                      key={i}
                      className={`py-2.5 text-right tabular-nums px-3 ${
                        highlight ? 'font-semibold' : ''
                      } ${isNeg ? 'text-red-500/80' : ''}`}
                    >
                      {formatted}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function IncomeTable({ data }: { data: IncomeStatementPeriod[] }) {
  const rows: TableProps<IncomeStatementPeriod>['rows'] = [
    { label: 'Revenue',          key: 'revenue',                                   fmt: (v) => fmtNum(v as number), highlight: true },
    { label: 'Gross Profit',     key: 'gross_profit',                              fmt: (v) => fmtNum(v as number), highlight: true },
    { label: 'Operating Income', key: 'operating_income',                          fmt: (v) => fmtNum(v as number) },
    { label: 'EBITDA',           key: 'ebitda',                                    fmt: (v) => fmtNum(v as number) },
    { label: 'Net Income',       key: 'net_income',                                fmt: (v) => fmtNum(v as number), highlight: true },
    { label: 'EPS (Diluted)',    key: 'eps_diluted',                               fmt: (v) => fmtPct(v as number) },
    { label: 'EPS (Basic)',      key: 'eps_basic',                                 fmt: (v) => fmtPct(v as number) },
    { label: 'R&D Expenses',     key: 'r_and_d_expenses',                          fmt: (v) => fmtNum(v as number), costMetric: true },
    { label: 'SG&A Expenses',    key: 'selling_general_administrative_expenses',   fmt: (v) => fmtNum(v as number), costMetric: true },
    { label: 'Interest Expense', key: 'interest_expense',                          fmt: (v) => fmtNum(v as number), costMetric: true },
    { label: 'Income Tax',       key: 'income_tax_expense',                        fmt: (v) => fmtNum(v as number) },
  ];
  return <FinancialTable rows={rows} data={data} dateKey="fiscal_date" />;
}

function BalanceTable({ data }: { data: BalanceSheetPeriod[] }) {
  const rows: TableProps<BalanceSheetPeriod>['rows'] = [
    { label: 'Total Assets',          key: 'total_assets',                fmt: (v) => fmtNum(v as number), highlight: true },
    { label: 'Current Assets',        key: 'total_current_assets',        fmt: (v) => fmtNum(v as number) },
    { label: 'Cash & Equivalents',    key: 'cash_and_equivalents',        fmt: (v) => fmtNum(v as number), highlight: true },
    { label: 'Goodwill & Intangibles',key: 'goodwill_and_intangible_assets', fmt: (v) => fmtNum(v as number) },
    { label: 'Total Liabilities',     key: 'total_liabilities',           fmt: (v) => fmtNum(v as number), highlight: true, costMetric: true },
    { label: 'Current Liabilities',   key: 'total_current_liabilities',   fmt: (v) => fmtNum(v as number), costMetric: true },
    { label: 'Long-Term Debt',        key: 'long_term_debt',              fmt: (v) => fmtNum(v as number), costMetric: true },
    { label: "Stockholders' Equity",  key: 'total_stockholders_equity',   fmt: (v) => fmtNum(v as number), highlight: true },
    { label: 'Retained Earnings',     key: 'retained_earnings',           fmt: (v) => fmtNum(v as number) },
  ];
  return <FinancialTable rows={rows} data={data} dateKey="fiscal_date" />;
}

function CashFlowTable({ data }: { data: CashFlowPeriod[] }) {
  const rows: TableProps<CashFlowPeriod>['rows'] = [
    { label: 'Operating Cash Flow', key: 'operating_cash_flow',           fmt: (v) => fmtNum(v as number), highlight: true },
    { label: 'Capital Expenditures',key: 'capital_expenditures',          fmt: (v) => fmtNum(v as number), costMetric: true },
    { label: 'Free Cash Flow',      key: 'free_cash_flow',                fmt: (v) => fmtNum(v as number), highlight: true },
    { label: 'Net Income',          key: 'net_income',                    fmt: (v) => fmtNum(v as number) },
    { label: 'D&A',                 key: 'depreciation_and_amortization', fmt: (v) => fmtNum(v as number) },
    { label: 'Investing Activities',key: 'investing_activities_cash_flow',fmt: (v) => fmtNum(v as number) },
    { label: 'Financing Activities',key: 'financing_activities_cash_flow',fmt: (v) => fmtNum(v as number) },
    { label: 'Dividends Paid',      key: 'dividends_paid',                fmt: (v) => fmtNum(v as number) },
  ];
  return <FinancialTable rows={rows} data={data} dateKey="fiscal_date" />;
}

function DividendsTable({ data }: { data: DividendItem[] }) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        No dividend history available
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            {['Ex-Dividend Date', 'Payment Date', 'Amount', 'Currency'].map((h) => (
              <th key={h} className="py-2.5 text-left font-medium text-muted-foreground pr-4 first:pl-0">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={i} className="border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors">
              <td className="py-2.5 pr-4 text-foreground/80">{d.ex_dividend_date}</td>
              <td className="py-2.5 pr-4 text-muted-foreground">{d.payment_date ?? '—'}</td>
              <td className="py-2.5 pr-4 font-medium tabular-nums">${d.amount.toFixed(4)}</td>
              <td className="py-2.5 text-muted-foreground">{d.currency}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SplitsTable({ data }: { data: SplitItem[] }) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        No split history available
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            {['Date', 'Ratio', 'From', 'To'].map((h) => (
              <th key={h} className="py-2.5 text-left font-medium text-muted-foreground pr-4 first:pl-0">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((s, i) => (
            <tr key={i} className="border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors">
              <td className="py-2.5 pr-4 text-foreground/80">{s.date}</td>
              <td className="py-2.5 pr-4 font-medium tabular-nums">{s.ratio}</td>
              <td className="py-2.5 pr-4 text-muted-foreground tabular-nums">{s.from_factor}</td>
              <td className="py-2.5 text-muted-foreground tabular-nums">{s.to_factor}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- Key Takeaways (simple mode) ----

interface TakeawayRow {
  term: string;
  value: string;
  positive?: boolean | null;
}

function KeyTakeawaysCard({
  rows,
  description,
  onShowMore,
  ticker,
  onAskAI,
}: {
  rows: TakeawayRow[];
  description: string;
  onShowMore: () => void;
  ticker?: string;
  onAskAI?: (q: string) => void;
}) {
  return (
    <div className="mb-4">
      <p className="text-xs text-muted-foreground mb-3">{description}</p>
      <div className="space-y-2">
        {rows.map((r) => (
          <div
            key={r.term}
            className="flex items-center justify-between gap-4 rounded-lg bg-muted/30 px-3 py-2.5"
          >
            <span className="text-sm text-muted-foreground">
              <TermTooltip term={r.term} ticker={ticker} onAskAI={onAskAI} />
            </span>
            <span
              className={`text-sm font-semibold tabular-nums ${
                r.positive === true
                  ? 'text-emerald-500'
                  : r.positive === false
                  ? 'text-red-500'
                  : 'text-foreground'
              }`}
            >
              {r.value}
            </span>
          </div>
        ))}
      </div>
      <button
        onClick={onShowMore}
        className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
      >
        <ChevronDown className="h-3.5 w-3.5" />
        Show full breakdown
      </button>
    </div>
  );
}

// ---- Main component ----

const TABS: { key: Tab; label: string }[] = [
  { key: 'income', label: 'Income Statement' },
  { key: 'balance', label: 'Balance Sheet' },
  { key: 'cashflow', label: 'Cash Flow' },
  { key: 'dividends', label: 'Dividends' },
  { key: 'splits', label: 'Splits' },
];

export function FinancialsSection({ ticker }: { ticker: string }) {
  const [activeTab, setActiveTab] = useState<Tab>('income');
  const [period, setPeriod] = useState<Period>('quarterly');
  const [showFullBreakdown, setShowFullBreakdown] = useState(false);
  const { isSimplified } = useExperienceLevel();
  const { open: openAIPanel } = useAIPanel();
  const handleAskAI = useCallback((q: string) => openAIPanel({ query: q }), [openAIPanel]);

  const { data, isLoading } = useQuery<FinancialsResponse>({
    queryKey: ['stock-financials', ticker, activeTab, (activeTab === 'dividends' || activeTab === 'splits') ? null : period],
    queryFn: async () => {
      const params = new URLSearchParams({ type: activeTab });
      if (activeTab !== 'dividends' && activeTab !== 'splits') params.set('period', period);
      const res = await fetch(`/api/stock/${ticker}/financials?${params}`);
      return res.json();
    },
    enabled: !!ticker,
    staleTime: 15 * 60 * 1000,
  });

  return (
    <Card className="mb-8">
      <CardHeader className="pb-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base font-semibold">Financials</CardTitle>

          {activeTab !== 'dividends' && activeTab !== 'splits' && (
            <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5 self-start">
              {(['quarterly', 'annual'] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-all ${
                    period === p
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {p === 'quarterly' ? 'Quarterly' : 'Annual'}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Tab strip */}
        <div className="flex gap-0 border-b border-border mt-3 -mx-6 px-6 overflow-x-auto">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setActiveTab(key); setShowFullBreakdown(false); }}
              className={`pb-2.5 mr-6 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                activeTab === key
                  ? 'text-foreground border-primary'
                  : 'text-muted-foreground border-transparent hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-40" />
                <div className="flex gap-6 ml-auto">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <Skeleton key={j} className="h-4 w-16" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && data?.success && data.data && (
          <>
            {/* ── Simple mode: Key Takeaways + optional full breakdown ──── */}
            {isSimplified && !showFullBreakdown && (activeTab === 'income' || activeTab === 'balance' || activeTab === 'cashflow') && (
              <>
                {activeTab === 'income' && (() => {
                  const rows = data.data as IncomeStatementPeriod[];
                  const latest = rows[0];
                  const prior = rows[1];
                  if (!latest) return <div className="py-8 text-center text-sm text-muted-foreground">No data available</div>;
                  const revGrowth = latest.revenue && prior?.revenue ? ((latest.revenue - prior.revenue) / Math.abs(prior.revenue)) : null;
                  return (
                    <KeyTakeawaysCard
                      description="The most important numbers from this company's income statement. These tell you how much money the company made and kept."
                      rows={[
                        { term: 'Revenue', value: fmtNum(latest.revenue), positive: revGrowth != null ? revGrowth > 0 : null },
                        { term: 'Gross Profit', value: fmtNum(latest.gross_profit), positive: (latest.gross_profit ?? 0) > 0 },
                        { term: 'Net Income', value: fmtNum(latest.net_income), positive: (latest.net_income ?? 0) > 0 },
                      ]}
                      onShowMore={() => setShowFullBreakdown(true)}
                      ticker={ticker}
                      onAskAI={handleAskAI}
                    />
                  );
                })()}
                {activeTab === 'balance' && (() => {
                  const rows = data.data as BalanceSheetPeriod[];
                  const latest = rows[0];
                  if (!latest) return <div className="py-8 text-center text-sm text-muted-foreground">No data available</div>;
                  return (
                    <KeyTakeawaysCard
                      description="A snapshot of what the company owns vs. what it owes. Healthy companies have more assets than liabilities."
                      rows={[
                        { term: 'Total Assets', value: fmtNum(latest.total_assets), positive: null },
                        { term: 'Total Liabilities', value: fmtNum(latest.total_liabilities), positive: false },
                        { term: "Stockholders' Equity", value: fmtNum(latest.total_stockholders_equity), positive: (latest.total_stockholders_equity ?? 0) > 0 },
                      ]}
                      onShowMore={() => setShowFullBreakdown(true)}
                      ticker={ticker}
                      onAskAI={handleAskAI}
                    />
                  );
                })()}
                {activeTab === 'cashflow' && (() => {
                  const rows = data.data as CashFlowPeriod[];
                  const latest = rows[0];
                  if (!latest) return <div className="py-8 text-center text-sm text-muted-foreground">No data available</div>;
                  return (
                    <KeyTakeawaysCard
                      description="Cash flow shows the actual money moving in and out of the business — harder to manipulate than reported profit."
                      rows={[
                        { term: 'Operating Cash Flow', value: fmtNum(latest.operating_cash_flow), positive: (latest.operating_cash_flow ?? 0) > 0 },
                        { term: 'Capital Expenditures', value: fmtNum(latest.capital_expenditures), positive: null },
                        { term: 'Free Cash Flow', value: fmtNum(latest.free_cash_flow), positive: (latest.free_cash_flow ?? 0) > 0 },
                      ]}
                      onShowMore={() => setShowFullBreakdown(true)}
                      ticker={ticker}
                      onAskAI={handleAskAI}
                    />
                  );
                })()}
              </>
            )}

            {/* ── Full breakdown (pro mode or after "Show full breakdown") ─ */}
            {(!isSimplified || showFullBreakdown || activeTab === 'dividends' || activeTab === 'splits') && (
              <>
                {isSimplified && showFullBreakdown && (activeTab === 'income' || activeTab === 'balance' || activeTab === 'cashflow') && (
                  <button
                    onClick={() => setShowFullBreakdown(false)}
                    className="mb-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                    Show key takeaways
                  </button>
                )}
                {activeTab === 'income' && <IncomeTable data={data.data as IncomeStatementPeriod[]} />}
                {activeTab === 'balance' && <BalanceTable data={data.data as BalanceSheetPeriod[]} />}
                {activeTab === 'cashflow' && <CashFlowTable data={data.data as CashFlowPeriod[]} />}
                {activeTab === 'dividends' && <DividendsTable data={data.data as DividendItem[]} />}
                {activeTab === 'splits' && <SplitsTable data={data.data as SplitItem[]} />}
              </>
            )}
          </>
        )}

        {!isLoading && !data?.success && data?.error === 'plan_restricted' && (
          <div className="flex flex-col items-center justify-center py-12 gap-1.5 text-center">
            <p className="text-sm text-muted-foreground">Financial statements require an Enterprise plan.</p>
            <p className="text-xs text-muted-foreground/60">Dividends may still be available — try the Dividends tab.</p>
          </div>
        )}

        {!isLoading && !data?.success && data?.error !== 'plan_restricted' && (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            No financial data available
          </div>
        )}
      </CardContent>
    </Card>
  );
}

