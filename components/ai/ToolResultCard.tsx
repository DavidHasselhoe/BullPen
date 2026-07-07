'use client';

import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Renders a compact visual card for a recognized AI tool result — health
 * score, live quote, key statistics, financial statements, earnings, or
 * company profile — instead of leaving the numbers buried in prose. Falls
 * back to `null` for tool outputs it doesn't recognize (e.g. errors, chart
 * actions, navigation results), letting the assistant's text stand alone.
 *
 * Shared by BullpenChat and the in-chart AI assistant so tool results look
 * the same regardless of which surface the user is on.
 */

interface HealthScoreOutput {
  ticker: string;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  categories: Array<{ name: string; score: number; max: number; label: string }>;
}

interface LiveQuoteOutput {
  ticker: string;
  price: string;
  change: string;
  changePercent: string;
  open?: string;
  high?: string;
  low?: string;
}

interface KeyStatisticsOutput {
  ticker: string;
  marketCap: string;
  peRatioTTM: string;
  pbRatio: string;
  evToEbitda: string;
  beta: string;
  dividendYield: string;
  profitMargin: string;
}

interface CompanyProfileOutput {
  ticker: string;
  name: string;
  sector: string | null;
  industry: string | null;
  description: string | null;
  /** Only present from getLiveCompanyProfile (TwelveData) — absent from the Supabase-backed getCompanyProfile. */
  ceo?: string | null;
  employees?: number | null;
  headquarters?: string | null;
}

type FinancialRow = Record<string, string> & { period: string };
type EarningsRow = { period: string; epsActual: string; epsEstimate: string; result: string; surprise: string };

function gradeBadgeClass(grade: string): string {
  if (grade === 'A' || grade === 'B') return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
  if (grade === 'C') return 'bg-amber-400/10 text-amber-400 border-amber-400/20';
  return 'bg-red-500/10 text-red-500 border-red-500/20';
}

function barColor(ratio: number): string {
  if (ratio >= 0.7) return 'bg-emerald-500';
  if (ratio >= 0.45) return 'bg-amber-400';
  return 'bg-red-500';
}

function isNegative(formatted: string | undefined): boolean {
  return typeof formatted === 'string' && formatted.trim().startsWith('-');
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 rounded-xl border border-border/60 bg-background/60 p-3 text-xs last:mb-0">
      {children}
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">{label}</div>
      <div className="tabular-nums font-medium text-foreground">{value}</div>
    </div>
  );
}

function HealthScoreCardResult({ output }: { output: HealthScoreOutput }) {
  return (
    <CardShell>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold text-foreground">{output.ticker} Financial Health</span>
        <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold', gradeBadgeClass(output.grade))}>
          {output.score}/100 · {output.grade}
        </span>
      </div>
      <div className="space-y-1.5">
        {output.categories.map((c) => {
          const unavailable = c.label?.startsWith('N/A');
          const ratio = c.max > 0 ? c.score / c.max : 0;
          return (
            <div key={c.name} className="space-y-0.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">{c.name}</span>
                <span className="tabular-nums text-muted-foreground">{unavailable ? 'N/A' : `${c.score}/${c.max}`}</span>
              </div>
              {!unavailable && (
                <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div className={cn('h-full rounded-full', barColor(ratio))} style={{ width: `${ratio * 100}%` }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </CardShell>
  );
}

function LiveQuoteCardResult({ output }: { output: LiveQuoteOutput }) {
  const negative = isNegative(output.change);
  const flat = output.change === '0.00';
  const color = flat ? 'text-muted-foreground' : negative ? 'text-red-500' : 'text-emerald-500';
  const Icon = flat ? Minus : negative ? ArrowDownRight : ArrowUpRight;
  return (
    <CardShell>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-foreground">{output.ticker}</div>
          <div className="text-lg font-semibold tabular-nums text-foreground">{output.price}</div>
        </div>
        <div className={cn('flex items-center gap-1 text-sm font-medium tabular-nums', color)}>
          <Icon className="h-3.5 w-3.5" />
          {output.changePercent}
        </div>
      </div>
      {(output.open || output.high || output.low) && (
        <div className="mt-2.5 grid grid-cols-3 gap-2 border-t border-border/40 pt-2">
          <StatCell label="Open" value={output.open ?? '—'} />
          <StatCell label="High" value={output.high ?? '—'} />
          <StatCell label="Low" value={output.low ?? '—'} />
        </div>
      )}
    </CardShell>
  );
}

function KeyStatisticsCardResult({ output }: { output: KeyStatisticsOutput }) {
  return (
    <CardShell>
      <div className="mb-2 font-semibold text-foreground">{output.ticker} Valuation</div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-2.5">
        <StatCell label="Market Cap" value={output.marketCap} />
        <StatCell label="P/E (TTM)" value={output.peRatioTTM} />
        <StatCell label="P/B" value={output.pbRatio} />
        <StatCell label="EV/EBITDA" value={output.evToEbitda} />
        <StatCell label="Beta" value={output.beta} />
        <StatCell label="Div Yield" value={output.dividendYield} />
      </div>
    </CardShell>
  );
}

function CompanyProfileCardResult({ output }: { output: CompanyProfileOutput }) {
  return (
    <CardShell>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="font-semibold text-foreground">{output.name}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">{output.ticker}</span>
      </div>
      {(output.sector || output.industry) && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {output.sector && (
            <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">{output.sector}</span>
          )}
          {output.industry && (
            <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">{output.industry}</span>
          )}
        </div>
      )}
      {(output.ceo || output.employees != null || output.headquarters) && (
        <div className="mb-1.5 grid grid-cols-3 gap-x-3 gap-y-1.5">
          {output.ceo && <StatCell label="CEO" value={output.ceo} />}
          {output.employees != null && <StatCell label="Employees" value={output.employees.toLocaleString()} />}
          {output.headquarters && <StatCell label="HQ" value={output.headquarters} />}
        </div>
      )}
      {output.description && (
        <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{output.description}</p>
      )}
    </CardShell>
  );
}

function detectFinancialType(row: FinancialRow): 'income' | 'balance' | 'cashflow' | null {
  if ('revenue' in row) return 'income';
  if ('totalAssets' in row) return 'balance';
  if ('operatingCashFlow' in row) return 'cashflow';
  return null;
}

function CompanyFinancialsCardResult({ output }: { output: FinancialRow[] }) {
  const row = output[0];
  if (!row) return null;
  const type = detectFinancialType(row);
  if (!type) return null;

  const fields: Record<typeof type, Array<{ key: string; label: string }>> = {
    income: [
      { key: 'revenue', label: 'Revenue' },
      { key: 'netIncome', label: 'Net Income' },
      { key: 'epsDiluted', label: 'EPS (diluted)' },
    ],
    balance: [
      { key: 'totalAssets', label: 'Total Assets' },
      { key: 'totalLiabilities', label: 'Total Liabilities' },
      { key: 'equity', label: 'Equity' },
    ],
    cashflow: [
      { key: 'operatingCashFlow', label: 'Operating CF' },
      { key: 'freeCashFlow', label: 'Free Cash Flow' },
      { key: 'capitalExpenditures', label: 'CapEx' },
    ],
  };

  return (
    <CardShell>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold text-foreground capitalize">{type} statement</span>
        <span className="text-[11px] text-muted-foreground">{row.period}</span>
      </div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-2.5">
        {fields[type].map((f) => (
          <StatCell key={f.key} label={f.label} value={row[f.key] ?? '—'} />
        ))}
      </div>
    </CardShell>
  );
}

function EarningsDataCardResult({ output }: { output: EarningsRow[] }) {
  const rows = output.slice(0, 4);
  if (rows.length === 0) return null;
  return (
    <CardShell>
      <div className="mb-2 font-semibold text-foreground">Earnings history</div>
      <div className="space-y-1.5">
        {rows.map((r) => {
          const beat = r.result === 'Beat';
          const missed = r.result === 'Missed';
          return (
            <div key={r.period} className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{r.period}</span>
              <span className="tabular-nums text-foreground">{r.epsActual} vs {r.epsEstimate} est.</span>
              <span
                className={cn(
                  'shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
                  beat && 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500',
                  missed && 'border-red-500/20 bg-red-500/10 text-red-500',
                  !beat && !missed && 'border-border/60 bg-muted/40 text-muted-foreground'
                )}
              >
                {r.result}
              </span>
            </div>
          );
        })}
      </div>
    </CardShell>
  );
}

export function ToolResultCard({ toolName, output }: { toolName: string; output: unknown }) {
  if (!output || typeof output !== 'object') return null;
  if ('error' in (output as Record<string, unknown>)) return null;

  switch (toolName) {
    case 'getHealthScore': {
      const o = output as Partial<HealthScoreOutput>;
      if (!o.categories || typeof o.score !== 'number') return null;
      return <HealthScoreCardResult output={o as HealthScoreOutput} />;
    }
    case 'getLiveQuote': {
      const o = output as Partial<LiveQuoteOutput>;
      if (!o.price || !o.changePercent) return null;
      return <LiveQuoteCardResult output={o as LiveQuoteOutput} />;
    }
    case 'getKeyStatistics': {
      const o = output as Partial<KeyStatisticsOutput>;
      if (!o.marketCap) return null;
      return <KeyStatisticsCardResult output={o as KeyStatisticsOutput} />;
    }
    case 'getCompanyProfile':
    case 'getLiveCompanyProfile': {
      const o = output as Partial<CompanyProfileOutput>;
      if (!o.name) return null;
      return <CompanyProfileCardResult output={o as CompanyProfileOutput} />;
    }
    case 'getCompanyFinancials': {
      if (!Array.isArray(output)) return null;
      return <CompanyFinancialsCardResult output={output as FinancialRow[]} />;
    }
    case 'getEarningsData': {
      if (!Array.isArray(output)) return null;
      return <EarningsDataCardResult output={output as EarningsRow[]} />;
    }
    default:
      return null;
  }
}
