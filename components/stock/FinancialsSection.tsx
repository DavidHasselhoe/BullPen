'use client';

/**
 * FinancialsSection — chart-first Financials.
 *
 * Each statement tab leads with a FinancialsTrendChart answering one
 * question (growth & profit / owns vs owes / real cash / dividend growth /
 * split history). Tables stay below for full detail, with the "Trend"
 * column showing TrendBars micro bars instead of a bare percentage.
 */

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TermTooltip } from '@/components/ui/TermTooltip';
import { useExperienceLevel } from '@/hooks/use-experience-level';
import { useAIPanel } from '@/components/ai/AIPanelProvider';
import { useEarningsHistory } from '@/hooks/use-earnings-history';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { FinancialsTrendChart, type TrendPoint } from './FinancialsTrendChart';
import { TrendBars } from '@/components/viz/TrendBars';
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

function fmtEps(v: number | null | undefined): string {
  if (v === null || v === undefined || isNaN(v as number)) return '—';
  return `$${v.toFixed(2)}`;
}

/** $0.2050 → "$0.205", $0.2700 → "$0.27" — precise but not noisy. */
function fmtDividend(v: number): string {
  return `$${v.toFixed(4).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')}`;
}

/** "2026-08-26" → "Aug 26" — matches the compact style used inline in a hint. */
function fmtShortDate(dateStr: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(dateStr + 'T12:00:00Z'));
}

// ---- Trend helpers ----

function getTrend(
  values: (number | null | undefined)[],
  t: TFunction,
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

  if (neutral) return { label: t('financialsTrendFlat'), cls: 'text-muted-foreground/80' };
  if (improving) return { label: `+${Math.abs(pct).toFixed(0)}%`, cls: 'text-emerald-500' };
  return { label: `-${Math.abs(pct).toFixed(0)}%`, cls: 'text-red-500' };
}

// ---- Chart mapping ----

function toPoints<T extends Record<string, unknown>>(
  data: T[],
  dateKey: keyof T,
  primaryKey: keyof T,
  secondaryKey?: keyof T
): TrendPoint[] {
  return data
    .slice(0, 5)
    .map((row) => ({
      label: String(row[dateKey]).slice(0, 7),
      primary: (row[primaryKey] as number | null) ?? null,
      secondary: secondaryKey ? ((row[secondaryKey] as number | null) ?? null) : undefined,
    }));
}

// ---- Table ----

interface TableRow<T> {
  label: string;
  key: keyof T;
  fmt: (v: T[keyof T]) => string;
  highlight?: boolean;
  costMetric?: boolean;
}

interface TableProps<T> {
  rows: TableRow<T>[];
  data: T[];
  dateKey: keyof T;
}

function FinancialTable<T extends Record<string, unknown>>({ rows, data, dateKey }: TableProps<T>) {
  const { t } = useTranslation('stock');
  if (!data.length) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        {t('financialsNoDataAvailable')}
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
              {t('financialsColumnPeriod')}
            </th>
            <th className="py-2.5 text-center font-medium text-muted-foreground px-3 min-w-[96px]">
              {t('financialsColumnTrend')}
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
            const trend = getTrend(allValues, t, costMetric);
            const barValues = allValues
              .slice()
              .reverse()
              .map((v) => (v == null || isNaN(v as number) ? null : (v as number)));
            const hasBars = barValues.filter((v) => v != null).length >= 2;

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
                <td className="py-2.5 px-3">
                  <div className="flex items-center justify-center gap-2">
                    {hasBars && (
                      <TrendBars
                        values={barValues}
                        height={16}
                        signed
                        srLabel={t('financialsTrendBarsSrLabel', { label, count: barValues.length })}
                        className="text-foreground"
                      />
                    )}
                    {trend ? (
                      <span className={`font-medium tabular-nums ${trend.cls}`}>{trend.label}</span>
                    ) : (
                      <span className="text-muted-foreground/80">—</span>
                    )}
                  </div>
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
  const { t } = useTranslation('stock');
  const rows: TableProps<IncomeStatementPeriod>['rows'] = [
    { label: t('financialsRowRevenue'),          key: 'revenue',                                   fmt: (v) => fmtNum(v as number), highlight: true },
    { label: t('financialsRowGrossProfit'),      key: 'gross_profit',                              fmt: (v) => fmtNum(v as number), highlight: true },
    { label: t('financialsRowOperatingIncome'),  key: 'operating_income',                          fmt: (v) => fmtNum(v as number) },
    { label: t('financialsRowEbitda'),           key: 'ebitda',                                    fmt: (v) => fmtNum(v as number) },
    { label: t('financialsRowNetIncome'),        key: 'net_income',                                fmt: (v) => fmtNum(v as number), highlight: true },
    { label: t('financialsRowEpsDiluted'),       key: 'eps_diluted',                               fmt: (v) => fmtEps(v as number) },
    { label: t('financialsRowEpsBasic'),         key: 'eps_basic',                                 fmt: (v) => fmtEps(v as number) },
    { label: t('financialsRowRnDExpenses'),      key: 'r_and_d_expenses',                          fmt: (v) => fmtNum(v as number), costMetric: true },
    { label: t('financialsRowSgAExpenses'),      key: 'selling_general_administrative_expenses',   fmt: (v) => fmtNum(v as number), costMetric: true },
    { label: t('financialsRowInterestExpense'),  key: 'interest_expense',                          fmt: (v) => fmtNum(v as number), costMetric: true },
    { label: t('financialsRowIncomeTax'),        key: 'income_tax_expense',                        fmt: (v) => fmtNum(v as number) },
  ];
  return <FinancialTable rows={rows} data={data} dateKey="fiscal_date" />;
}

function BalanceTable({ data }: { data: BalanceSheetPeriod[] }) {
  const { t } = useTranslation('stock');
  const rows: TableProps<BalanceSheetPeriod>['rows'] = [
    { label: t('financialsRowTotalAssets'),          key: 'total_assets',                fmt: (v) => fmtNum(v as number), highlight: true },
    { label: t('financialsRowCurrentAssets'),        key: 'total_current_assets',        fmt: (v) => fmtNum(v as number) },
    { label: t('financialsRowCashAndEquivalents'),    key: 'cash_and_equivalents',        fmt: (v) => fmtNum(v as number), highlight: true },
    { label: t('financialsRowGoodwillAndIntangibles'),key: 'goodwill_and_intangible_assets', fmt: (v) => fmtNum(v as number) },
    { label: t('financialsRowTotalLiabilities'),     key: 'total_liabilities',           fmt: (v) => fmtNum(v as number), highlight: true, costMetric: true },
    { label: t('financialsRowCurrentLiabilities'),   key: 'total_current_liabilities',   fmt: (v) => fmtNum(v as number), costMetric: true },
    { label: t('financialsRowLongTermDebt'),        key: 'long_term_debt',              fmt: (v) => fmtNum(v as number), costMetric: true },
    { label: t('financialsRowStockholdersEquity'),  key: 'total_stockholders_equity',   fmt: (v) => fmtNum(v as number), highlight: true },
    { label: t('financialsRowRetainedEarnings'),     key: 'retained_earnings',           fmt: (v) => fmtNum(v as number) },
  ];
  return <FinancialTable rows={rows} data={data} dateKey="fiscal_date" />;
}

function CashFlowTable({ data }: { data: CashFlowPeriod[] }) {
  const { t } = useTranslation('stock');
  const rows: TableProps<CashFlowPeriod>['rows'] = [
    { label: t('financialsRowOperatingCashFlow'), key: 'operating_cash_flow',           fmt: (v) => fmtNum(v as number), highlight: true },
    { label: t('financialsRowCapitalExpenditures'),key: 'capital_expenditures',          fmt: (v) => fmtNum(v as number), costMetric: true },
    { label: t('financialsRowFreeCashFlow'),      key: 'free_cash_flow',                fmt: (v) => fmtNum(v as number), highlight: true },
    { label: t('financialsRowNetIncome'),          key: 'net_income',                    fmt: (v) => fmtNum(v as number) },
    { label: t('financialsRowDAndA'),                 key: 'depreciation_and_amortization', fmt: (v) => fmtNum(v as number) },
    { label: t('financialsRowInvestingActivities'),key: 'investing_activities_cash_flow',fmt: (v) => fmtNum(v as number) },
    { label: t('financialsRowFinancingActivities'),key: 'financing_activities_cash_flow',fmt: (v) => fmtNum(v as number) },
    { label: t('financialsRowDividendsPaid'),      key: 'dividends_paid',                fmt: (v) => fmtNum(v as number) },
  ];
  return <FinancialTable rows={rows} data={data} dateKey="fiscal_date" />;
}

function DividendsTable({ data }: { data: DividendItem[] }) {
  const { t } = useTranslation('stock');
  if (!data.length) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        {t('financialsNoDividendHistory')}
      </div>
    );
  }
  // The payment-date column is often entirely null from the API — drop it then.
  const hasPaymentDates = data.some((d) => d.payment_date);
  const headers = hasPaymentDates
    ? [t('financialsColumnExDividendDate'), t('financialsColumnPaymentDate'), t('financialsColumnAmount'), t('financialsColumnCurrency')]
    : [t('financialsColumnExDividendDate'), t('financialsColumnAmount'), t('financialsColumnCurrency')];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            {headers.map((h) => (
              <th key={h} className="py-2.5 text-left font-medium text-muted-foreground pr-4 first:pl-0">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={i} className="border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors">
              <td className="py-2.5 pr-4 text-foreground/80">{d.ex_dividend_date}</td>
              {hasPaymentDates && <td className="py-2.5 pr-4 text-muted-foreground">{d.payment_date ?? '—'}</td>}
              <td className="py-2.5 pr-4 font-medium tabular-nums">{fmtDividend(d.amount)}</td>
              <td className="py-2.5 text-muted-foreground">{d.currency}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * SplitsTimeline — splits as a story, not a table: a dot-timeline of each
 * split with its ratio, led by the cumulative "1 share then → N shares now".
 */
function SplitsTimeline({ data }: { data: SplitItem[] }) {
  const { t } = useTranslation('stock');
  if (data.length === 0) return null;
  const sorted = data.slice().sort((a, b) => a.date.localeCompare(b.date));
  // TwelveData semantics (verified against AAPL's 2020 4-for-1 split, which it
  // returns as from_factor=4, to_factor=1, ratio=0.25): shares multiplier is
  // from/to, and "from-for-to" reads as the conventional split name.
  const multiplier = (s: SplitItem) => (s.to_factor > 0 ? s.from_factor / s.to_factor : 1);
  const factor = sorted.reduce((f, s) => f * multiplier(s), 1);
  const firstYear = sorted[0].date.slice(0, 4);
  const fmtFactor = (f: number) => (Number.isInteger(f) ? f.toLocaleString('en-US') : f.toFixed(1));

  return (
    <div className="mb-5">
      {factor > 1 && (
        <p className="mb-4 text-sm font-medium text-foreground/80">
          {t('financialsSplitsSummaryPrefix', { year: firstYear })} <span className="tabular-nums">{fmtFactor(factor)}</span> {t('financialsSplitsSummarySuffix')}
        </p>
      )}
      <ol className="relative ml-1.5 border-l border-border/60 pl-5">
        {sorted.map((s, i) => {
          const m = multiplier(s);
          return (
            <li key={i} className="relative pb-4 last:pb-0">
              <span className="absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full border border-border bg-muted" aria-hidden />
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-sm font-medium text-foreground/80">{s.date}</span>
                <span className="rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs font-medium tabular-nums">
                  {t('financialsSplitRatio', { from: s.from_factor, to: s.to_factor })} {m < 1 ? t('financialsReverseSplit') : t('financialsSplit')}
                </span>
                <span className="text-xs text-muted-foreground">
                  {m >= 1
                    ? t('financialsSplitEachShareBecame', { factor: fmtFactor(m) })
                    : t('financialsSplitEveryNSharesBecame', { to: s.to_factor, from: s.from_factor })}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function SplitsTable({ data }: { data: SplitItem[] }) {
  const { t } = useTranslation('stock');
  if (!data.length) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        {t('financialsNoSplitHistory')}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            {[t('financialsColumnDate'), t('financialsColumnRatio'), t('financialsColumnFrom'), t('financialsColumnTo')].map((h) => (
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
  const { t } = useTranslation('stock');
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
        {t('financialsShowFullBreakdown')}
      </button>
    </div>
  );
}

// ---- Main component ----

function getTabs(t: TFunction): { key: Tab; label: string }[] {
  return [
    { key: 'income', label: t('financialsTabIncomeStatement') },
    { key: 'balance', label: t('financialsTabBalanceSheet') },
    { key: 'cashflow', label: t('financialsTabCashFlow') },
    { key: 'dividends', label: t('financialsTabDividends') },
    { key: 'splits', label: t('financialsTabSplits') },
  ];
}

export function FinancialsSection({ ticker }: { ticker: string }) {
  const { t } = useTranslation('stock');
  const TABS = getTabs(t);
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

  // ── Newest report vs. newest available statement ────────────────────────
  // Earnings calls happen same-day; the filed statement TwelveData ingests
  // typically trails by 1–4 weeks. When that gap is more than one quarter's
  // worth, the newest report's period genuinely isn't in the data yet — say
  // so instead of silently showing a chart that looks one quarter stale.
  const { data: earningsData } = useEarningsHistory(ticker);
  const pendingReportNote = (() => {
    if (activeTab !== 'income' && activeTab !== 'balance' && activeTab !== 'cashflow') return null;
    if (!data?.success || !data.data || data.data.length === 0) return null;
    if (!earningsData || earningsData.length === 0) return null;
    const today = new Date().toISOString().split('T')[0];
    const newestReport = earningsData
      .filter((e) => e.date < today)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!newestReport || !newestReport.quarter || !newestReport.year) return null;
    const newestFiscalDate = (data.data[0] as { fiscal_date: string }).fiscal_date;
    const gapDays = (new Date(newestReport.date).getTime() - new Date(newestFiscalDate).getTime()) / 86_400_000;
    if (gapDays <= 95) return null;
    return { quarter: newestReport.quarter, year: newestReport.year, date: newestReport.date };
  })();

  // ── Chart-first lead per statement tab ─────────────────────────────────
  let chart: React.ReactNode = null;
  if (!isLoading && data?.success && data.data) {
    if (activeTab === 'income') {
      chart = (
        <FinancialsTrendChart
          points={toPoints(data.data as IncomeStatementPeriod[], 'fiscal_date', 'revenue', 'net_income')}
          primaryLabel={t('financialsChartRevenue')}
          secondaryLabel={t('financialsChartNetIncome')}
          question={t('financialsQuestionIncome')}
          format={fmtNum}
          colorMode="signSecondary"
        />
      );
    } else if (activeTab === 'balance') {
      chart = (
        <FinancialsTrendChart
          points={toPoints(data.data as BalanceSheetPeriod[], 'fiscal_date', 'total_assets', 'total_liabilities')}
          primaryLabel={t('financialsChartAssets')}
          secondaryLabel={t('financialsChartLiabilities')}
          question={t('financialsQuestionBalance')}
          format={fmtNum}
          colorMode="ownVsOwe"
        />
      );
    } else if (activeTab === 'cashflow') {
      chart = (
        <FinancialsTrendChart
          points={toPoints(data.data as CashFlowPeriod[], 'fiscal_date', 'operating_cash_flow', 'free_cash_flow')}
          primaryLabel={t('financialsChartOperatingCashFlow')}
          secondaryLabel={t('financialsChartFreeCashFlow')}
          question={t('financialsQuestionCashFlow')}
          format={fmtNum}
          colorMode="signSecondary"
        />
      );
    } else if (activeTab === 'dividends') {
      const items = (data.data as DividendItem[])
        .slice()
        .sort((a, b) => a.ex_dividend_date.localeCompare(b.ex_dividend_date));
      if (items.length >= 2) {
        const first = items[0];
        const last = items[items.length - 1];
        const growthPct = first.amount > 0 ? ((last.amount - first.amount) / first.amount) * 100 : null;
        const raises = items.filter((d, i) => i > 0 && d.amount > items[i - 1].amount).length;
        const insight =
          growthPct != null && Math.abs(growthPct) >= 1
            ? growthPct > 0
              ? t('financialsDividendRaised', { count: raises, year: first.ex_dividend_date.slice(0, 4), pct: Math.round(growthPct) })
              : t('financialsDividendDown', { pct: Math.round(Math.abs(growthPct)), year: first.ex_dividend_date.slice(0, 4) })
            : t('financialsDividendSteady', { year: first.ex_dividend_date.slice(0, 4) });
        chart = (
          <div>
            <FinancialsTrendChart
              points={items.map((d, i) => ({
                // Label only the first payout of each year to keep the axis quiet
                label:
                  i === 0 || d.ex_dividend_date.slice(0, 4) !== items[i - 1].ex_dividend_date.slice(0, 4)
                    ? d.ex_dividend_date.slice(0, 4)
                    : '',
                primary: d.amount,
              }))}
              primaryLabel={t('financialsChartDividendPerShare')}
              question={t('financialsQuestionDividend')}
              format={fmtDividend}
            />
            <p className="-mt-3 mb-5 text-xs text-muted-foreground">{insight}</p>
          </div>
        );
      }
    } else if (activeTab === 'splits') {
      chart = <SplitsTimeline data={data.data as SplitItem[]} />;
    }
  }

  return (
    <Card className="mb-8">
      <CardHeader className="pb-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base font-semibold">{t('financialsCardTitle')}</CardTitle>

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
                  {p === 'quarterly' ? t('sankeyQuarterly') : t('sankeyAnnual')}
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
          <div className="space-y-4">
            <Skeleton className="h-[180px] w-full rounded-lg" />
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
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
          </div>
        )}

        {!isLoading && data?.success && data.data && (
          <>
            {pendingReportNote && (
              <p className="-mt-1 mb-4 text-xs text-muted-foreground">
                {t('financialsNewerReportPending', {
                  quarter: pendingReportNote.quarter,
                  year: pendingReportNote.year,
                  date: fmtShortDate(pendingReportNote.date),
                })}
              </p>
            )}
            {chart}

            {/* ── Simple mode: Key Takeaways + optional full breakdown ──── */}
            {isSimplified && !showFullBreakdown && (activeTab === 'income' || activeTab === 'balance' || activeTab === 'cashflow') && (
              <>
                {activeTab === 'income' && (() => {
                  const rows = data.data as IncomeStatementPeriod[];
                  const latest = rows[0];
                  const prior = rows[1];
                  if (!latest) return <div className="py-8 text-center text-sm text-muted-foreground">{t('financialsNoDataAvailable')}</div>;
                  const revGrowth = latest.revenue && prior?.revenue ? ((latest.revenue - prior.revenue) / Math.abs(prior.revenue)) : null;
                  return (
                    <KeyTakeawaysCard
                      description={t('financialsTakeawaysIncomeDescription')}
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
                  if (!latest) return <div className="py-8 text-center text-sm text-muted-foreground">{t('financialsNoDataAvailable')}</div>;
                  return (
                    <KeyTakeawaysCard
                      description={t('financialsTakeawaysBalanceDescription')}
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
                  if (!latest) return <div className="py-8 text-center text-sm text-muted-foreground">{t('financialsNoDataAvailable')}</div>;
                  return (
                    <KeyTakeawaysCard
                      description={t('financialsTakeawaysCashFlowDescription')}
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
                    {t('financialsShowKeyTakeaways')}
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
            <p className="text-sm text-muted-foreground">{t('financialsPlanRestricted')}</p>
            <p className="text-xs text-muted-foreground/80">{t('financialsPlanRestrictedDividendsHint')}</p>
          </div>
        )}

        {!isLoading && !data?.success && data?.error !== 'plan_restricted' && (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            {t('financialsNoFinancialData')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
