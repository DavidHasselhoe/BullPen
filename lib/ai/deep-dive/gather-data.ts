/**
 * Assemble everything the deep-dive prompt needs from data we already have.
 *
 * Reads the warm market-data cache first (same keys the snapshot, statistics, and
 * health-score routes write), falling back to live TwelveData fetches only on a
 * miss. The S&P 500 + NASDAQ 100 are prefetched daily, so most tickers hit cache —
 * keeping the per-run cost near zero before Claude is even called.
 */

import {
  getStatistics, getIncomeStatement, getBalanceSheet, getCashFlow,
  getCompanyProfile, getCompanyEarnings,
  type CompanyStatistics, type IncomeStatementPeriod, type BalanceSheetPeriod,
  type CashFlowPeriod, type CompanyProfile,
} from '@/lib/twelvedata/twelvedata-client';
import { getCached } from '@/lib/cache/market-data-cache';
import { computeHealthScore, type HealthScore } from '@/lib/finance/health-score';

interface EarningsRow {
  period: string;
  actual: number | null;
  estimate: number | null;
  surprisePct: number | null;
}

export interface DeepDiveData {
  symbol: string;
  profile: CompanyProfile | null;
  stats: CompanyStatistics | null;
  income: IncomeStatementPeriod[];
  balance: BalanceSheetPeriod[];
  cashflow: CashFlowPeriod[];
  earnings: EarningsRow[];
  health: HealthScore | null;
  dataAsOf: string | null;
}

// snapshot-route earnings cache shape
interface SnapEarnings { date: string; time: string; epsEstimate: number | null; epsActual: number | null; quarter: number; year: number }

async function cachedOrFetch<T>(key: string, fetcher: () => Promise<T>, fallback: T): Promise<T> {
  const hit = await getCached<T>(key);
  if (hit != null) return hit;
  try {
    return await fetcher();
  } catch {
    return fallback;
  }
}

export async function gatherDeepDiveData(symbol: string): Promise<DeepDiveData> {
  const sym = symbol.toUpperCase();

  const [stats, income, balance, cashflow, profile, snapEarnings] = await Promise.all([
    cachedOrFetch<CompanyStatistics | null>(`stats:${sym}`, () => getStatistics(sym), null),
    cachedOrFetch<IncomeStatementPeriod[]>(`financials:${sym}:income:quarterly`, () => getIncomeStatement(sym, 'quarterly'), []),
    cachedOrFetch<BalanceSheetPeriod[]>(`financials:${sym}:balance:quarterly`, () => getBalanceSheet(sym, 'quarterly'), []),
    cachedOrFetch<CashFlowPeriod[]>(`financials:${sym}:cashflow:quarterly`, () => getCashFlow(sym, 'quarterly'), []),
    getCompanyProfile(sym).catch(() => null),
    getCached<SnapEarnings[]>(`snap-earnings:${sym}`),
  ]);

  // Earnings: prefer the cached snapshot rows, else fetch the per-company history.
  let earnings: EarningsRow[] = [];
  if (snapEarnings?.length) {
    earnings = snapEarnings
      .filter((e) => e.epsActual != null || e.epsEstimate != null)
      .slice(0, 8)
      .map((e) => ({
        period: `Q${e.quarter} ${e.year}`,
        actual: e.epsActual,
        estimate: e.epsEstimate,
        surprisePct:
          e.epsActual != null && e.epsEstimate != null && e.epsEstimate !== 0
            ? ((e.epsActual - e.epsEstimate) / Math.abs(e.epsEstimate)) * 100
            : null,
      }));
  } else {
    try {
      const ce = await getCompanyEarnings(sym, 8);
      earnings = ce.map((e) => ({
        period: e.period || String(e.year),
        actual: e.actual,
        estimate: e.estimate,
        surprisePct: e.surprisePercent,
      }));
    } catch { /* leave empty */ }
  }

  const health =
    stats && (income.length || balance.length || cashflow.length)
      ? computeHealthScore(stats, income, balance, cashflow)
      : null;

  const dataAsOf = income[0]?.fiscal_date || balance[0]?.fiscal_date || null;

  return { symbol: sym, profile, stats, income, balance, cashflow, earnings, health, dataAsOf };
}

// ─── Formatting for the prompt ────────────────────────────────────────────────

function big(n: number | null | undefined): string {
  if (n == null) return '—';
  const a = Math.abs(n);
  if (a >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}
function money(n: number | null | undefined): string {
  return n == null ? '—' : `$${big(n)}`;
}
function pct(n: number | null | undefined, alreadyPct = false): string {
  if (n == null) return '—';
  return `${(alreadyPct ? n : n * 100).toFixed(1)}%`;
}
function num(n: number | null | undefined, dp = 2): string {
  return n == null ? '—' : n.toFixed(dp);
}

/** Compact, labeled text block — the factual backbone passed to Claude. */
export function formatDataBlock(d: DeepDiveData): string {
  const lines: string[] = [];
  const p = d.profile;
  const s = d.stats;

  lines.push(`COMPANY: ${p?.name ?? d.symbol} (${d.symbol})`);
  if (p) {
    lines.push(`Sector: ${p.sector ?? '—'} / ${p.industry ?? '—'} · Exchange: ${p.exchange ?? '—'} · Currency: ${p.currency ?? 'USD'}`);
    if (p.employees) lines.push(`Employees: ${p.employees.toLocaleString()}`);
    if (p.description) lines.push(`Profile: ${p.description.slice(0, 480)}`);
  }

  if (s) {
    lines.push('');
    lines.push('VALUATION & MARKET DATA:');
    lines.push(`Market cap: ${money(s.marketCap)} · Enterprise value: ${money(s.enterpriseValue)}`);
    lines.push(`P/E (TTM): ${num(s.peRatioTTM)} · Forward P/E: ${num(s.peRatioForward)} · P/B: ${num(s.pbRatio)} · EV/EBITDA: ${num(s.evToEbitda)}`);
    lines.push(`Profit margin: ${pct(s.profitMargin)} · Rev growth (TTM, QoQ YoY): ${pct(s.revenueGrowthTTM)} · EPS growth: ${pct(s.epsGrowthTTM)}`);
    lines.push(`Beta: ${num(s.beta)} · 52w range: ${num(s.week52Low)}–${num(s.week52High)} · Div yield: ${pct(s.dividendYield)} · Short ratio: ${num(s.shortRatio)}`);
  }

  if (d.health) {
    lines.push('');
    lines.push(`HEALTH SCORE (our model): ${d.health.score}/100 (${d.health.grade}, ${d.health.label}) — ${d.health.summary}`);
    lines.push('Category breakdown: ' + d.health.categories.map((c) => `${c.name} ${c.score}/${c.max}`).join(' · '));
  }

  if (d.income.length) {
    lines.push('');
    lines.push('INCOME STATEMENT (most recent quarters, newest first):');
    for (const q of d.income.slice(0, 4)) {
      lines.push(
        `${q.fiscal_date}: Rev ${money(q.revenue)} · GrossProfit ${money(q.gross_profit)} · OpInc ${money(q.operating_income)} · NetInc ${money(q.net_income)} · EBITDA ${money(q.ebitda)} · EPS(dil) ${num(q.eps_diluted)} · R&D ${money(q.r_and_d_expenses)}`
      );
    }
  }

  if (d.balance.length) {
    const b = d.balance[0];
    lines.push('');
    lines.push(`BALANCE SHEET (${b.fiscal_date}): Assets ${money(b.total_assets)} · Cash ${money(b.cash_and_equivalents)} · CurrentAssets ${money(b.total_current_assets)} · Liabilities ${money(b.total_liabilities)} · CurrentLiab ${money(b.total_current_liabilities)} · LT debt ${money(b.long_term_debt)} · Equity ${money(b.total_stockholders_equity)}`);
  }

  if (d.cashflow.length) {
    const c = d.cashflow[0];
    lines.push('');
    lines.push(`CASH FLOW (${c.fiscal_date}): Operating ${money(c.operating_cash_flow)} · CapEx ${money(c.capital_expenditures)} · FreeCashFlow ${money(c.free_cash_flow)} · Dividends paid ${money(c.dividends_paid)}`);
  }

  if (d.earnings.length) {
    lines.push('');
    lines.push('EARNINGS HISTORY (EPS actual vs estimate):');
    for (const e of d.earnings.slice(0, 6)) {
      const surp = e.surprisePct != null ? ` (${e.surprisePct >= 0 ? '+' : ''}${e.surprisePct.toFixed(1)}% surprise)` : '';
      lines.push(`${e.period}: actual ${num(e.actual)} vs est ${num(e.estimate)}${surp}`);
    }
  }

  return lines.join('\n');
}
