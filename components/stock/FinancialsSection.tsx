'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type {
  IncomeStatementPeriod,
  BalanceSheetPeriod,
  CashFlowPeriod,
  DividendItem,
} from '@/lib/twelvedata/twelvedata-client';

type Tab = 'income' | 'balance' | 'cashflow' | 'dividends';
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

// ---- Sub-components ----

interface TableProps<T> {
  rows: { label: string; key: keyof T; fmt: (v: T[keyof T]) => string; highlight?: boolean }[];
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
            {cols.map((col, i) => (
              <th key={i} className="py-2.5 text-right font-medium text-muted-foreground tabular-nums px-3 min-w-[90px]">
                {String(col[dateKey]).slice(0, 7)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ label, key, fmt: fmtFn, highlight }) => (
            <tr
              key={String(key)}
              className={`border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors ${
                highlight ? 'bg-muted/20' : ''
              }`}
            >
              <td className={`py-2.5 pr-4 ${highlight ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                {label}
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
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IncomeTable({ data }: { data: IncomeStatementPeriod[] }) {
  const rows: TableProps<IncomeStatementPeriod>['rows'] = [
    { label: 'Revenue', key: 'revenue', fmt: (v) => fmtNum(v as number), highlight: true },
    { label: 'Gross Profit', key: 'gross_profit', fmt: (v) => fmtNum(v as number), highlight: true },
    { label: 'Operating Income', key: 'operating_income', fmt: (v) => fmtNum(v as number) },
    { label: 'EBITDA', key: 'ebitda', fmt: (v) => fmtNum(v as number) },
    { label: 'Net Income', key: 'net_income', fmt: (v) => fmtNum(v as number), highlight: true },
    { label: 'EPS (Diluted)', key: 'eps_diluted', fmt: (v) => fmtPct(v as number) },
    { label: 'EPS (Basic)', key: 'eps_basic', fmt: (v) => fmtPct(v as number) },
    { label: 'R&D Expenses', key: 'r_and_d_expenses', fmt: (v) => fmtNum(v as number) },
    { label: 'SG&A Expenses', key: 'selling_general_administrative_expenses', fmt: (v) => fmtNum(v as number) },
    { label: 'Interest Expense', key: 'interest_expense', fmt: (v) => fmtNum(v as number) },
    { label: 'Income Tax', key: 'income_tax_expense', fmt: (v) => fmtNum(v as number) },
  ];
  return <FinancialTable rows={rows} data={data} dateKey="fiscal_date" />;
}

function BalanceTable({ data }: { data: BalanceSheetPeriod[] }) {
  const rows: TableProps<BalanceSheetPeriod>['rows'] = [
    { label: 'Total Assets', key: 'total_assets', fmt: (v) => fmtNum(v as number), highlight: true },
    { label: 'Current Assets', key: 'total_current_assets', fmt: (v) => fmtNum(v as number) },
    { label: 'Cash & Equivalents', key: 'cash_and_equivalents', fmt: (v) => fmtNum(v as number), highlight: true },
    { label: 'Goodwill & Intangibles', key: 'goodwill_and_intangible_assets', fmt: (v) => fmtNum(v as number) },
    { label: 'Total Liabilities', key: 'total_liabilities', fmt: (v) => fmtNum(v as number), highlight: true },
    { label: 'Current Liabilities', key: 'total_current_liabilities', fmt: (v) => fmtNum(v as number) },
    { label: 'Long-Term Debt', key: 'long_term_debt', fmt: (v) => fmtNum(v as number) },
    { label: "Stockholders' Equity", key: 'total_stockholders_equity', fmt: (v) => fmtNum(v as number), highlight: true },
    { label: 'Retained Earnings', key: 'retained_earnings', fmt: (v) => fmtNum(v as number) },
  ];
  return <FinancialTable rows={rows} data={data} dateKey="fiscal_date" />;
}

function CashFlowTable({ data }: { data: CashFlowPeriod[] }) {
  const rows: TableProps<CashFlowPeriod>['rows'] = [
    { label: 'Operating Cash Flow', key: 'operating_cash_flow', fmt: (v) => fmtNum(v as number), highlight: true },
    { label: 'Capital Expenditures', key: 'capital_expenditures', fmt: (v) => fmtNum(v as number) },
    { label: 'Free Cash Flow', key: 'free_cash_flow', fmt: (v) => fmtNum(v as number), highlight: true },
    { label: 'Net Income', key: 'net_income', fmt: (v) => fmtNum(v as number) },
    { label: 'D&A', key: 'depreciation_and_amortization', fmt: (v) => fmtNum(v as number) },
    { label: 'Investing Activities', key: 'investing_activities_cash_flow', fmt: (v) => fmtNum(v as number) },
    { label: 'Financing Activities', key: 'financing_activities_cash_flow', fmt: (v) => fmtNum(v as number) },
    { label: 'Dividends Paid', key: 'dividends_paid', fmt: (v) => fmtNum(v as number) },
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

// ---- Main component ----

const TABS: { key: Tab; label: string }[] = [
  { key: 'income', label: 'Income Statement' },
  { key: 'balance', label: 'Balance Sheet' },
  { key: 'cashflow', label: 'Cash Flow' },
  { key: 'dividends', label: 'Dividends' },
];

export function FinancialsSection({ ticker }: { ticker: string }) {
  const [activeTab, setActiveTab] = useState<Tab>('income');
  const [period, setPeriod] = useState<Period>('quarterly');

  const { data, isLoading } = useQuery<FinancialsResponse>({
    queryKey: ['stock-financials', ticker, activeTab, activeTab === 'dividends' ? null : period],
    queryFn: async () => {
      const params = new URLSearchParams({ type: activeTab });
      if (activeTab !== 'dividends') params.set('period', period);
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

          {activeTab !== 'dividends' && (
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
              onClick={() => setActiveTab(key)}
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
            {activeTab === 'income' && <IncomeTable data={data.data as IncomeStatementPeriod[]} />}
            {activeTab === 'balance' && <BalanceTable data={data.data as BalanceSheetPeriod[]} />}
            {activeTab === 'cashflow' && <CashFlowTable data={data.data as CashFlowPeriod[]} />}
            {activeTab === 'dividends' && <DividendsTable data={data.data as DividendItem[]} />}
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

