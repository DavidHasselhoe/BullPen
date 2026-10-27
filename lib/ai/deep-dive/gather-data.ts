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
import { statementsInUsd } from '@/lib/currency/latest-rates';
import type { StatementFx } from '@/lib/currency/statement-fx';
import type { HealthScore } from '@/lib/finance/health-score';
import { computeAndSyncHealthScore } from '@/lib/finance/get-health-score';
import { getFiscalCalendar, labelEarnings, periodForStatement, fiscalLabelEn, type FiscalCalendar } from '@/lib/finance/fiscal-calendar';

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
  /** Set when the statements were converted to USD from the company's own currency. */
  fx: StatementFx | null;
  /** What the statement amounts are in: USD, or the filer's currency when no rate could be had. */
  statementCurrency: string;
  earnings: EarningsRow[];
  health: HealthScore | null;
  dataAsOf: string | null;
  /** The company's own fiscal quarters (SEC), so the report names periods as the stock page does. */
  fiscal: FiscalCalendar | null;
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

  const [stats, rawIncome, rawBalance, rawCashflow, profile, snapEarnings, fiscal] = await Promise.all([
    cachedOrFetch<CompanyStatistics | null>(`stats:${sym}`, () => getStatistics(sym), null),
    cachedOrFetch<IncomeStatementPeriod[]>(`financials:${sym}:income:quarterly`, () => getIncomeStatement(sym, 'quarterly'), []),
    cachedOrFetch<BalanceSheetPeriod[]>(`financials:${sym}:balance:quarterly`, () => getBalanceSheet(sym, 'quarterly'), []),
    cachedOrFetch<CashFlowPeriod[]>(`financials:${sym}:cashflow:quarterly`, () => getCashFlow(sym, 'quarterly'), []),
    getCompanyProfile(sym).catch(() => null),
    getCached<SnapEarnings[]>(`snap-earnings:${sym}`),
    getFiscalCalendar(sym).catch(() => null),
  ]);

  // The cache keeps statements in the filer's currency (TSM's TWD); the report
  // talks in dollars next to a USD market cap, so convert as the stock page does.
  const [inc, bal, cf] = await Promise.all([
    statementsInUsd(sym, rawIncome),
    statementsInUsd(sym, rawBalance),
    statementsInUsd(sym, rawCashflow),
  ]);
  const [income, balance, cashflow] = [inc.rows, bal.rows, cf.rows];
  const fx = inc.fx ?? bal.fx ?? cf.fx;
  const statementCurrency = [inc, bal, cf].find((r) => r.currency !== 'USD')?.currency ?? 'USD';

  // Earnings: prefer the cached snapshot rows, else fetch the per-company history.
  let earnings: EarningsRow[] = [];
  if (snapEarnings?.length) {
    // The cache's quarter is a calendar guess (it called Micron's Sep 30 2026
    // Q4 FY26 report "Q2 2026"); the release date places it properly.
    earnings = labelEarnings(snapEarnings, fiscal)
      .filter((e) => e.epsActual != null || e.epsEstimate != null)
      .slice(0, 8)
      .map((e) => ({
        period: fiscalLabelEn({ fiscalQuarter: e.quarter, fiscalYear: e.year }, e.offCalendar ?? false),
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

  const computedHealth =
    stats && (income.length || balance.length || cashflow.length)
      ? (await computeAndSyncHealthScore(sym, stats, income, balance, cashflow, false)).healthScore
      : null;
  const health = computedHealth?.insufficientData ? null : computedHealth;

  const dataAsOf = income[0]?.fiscal_date || balance[0]?.fiscal_date || null;

  return { symbol: sym, profile, stats, income, balance, cashflow, fx, statementCurrency, earnings, health, dataAsOf, fiscal };
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

  // "Q3 FY26 (ended 2026-05-28)" rather than TwelveData's rounded "2026-05-31".
  const periodName = (fiscalDate: string) => {
    const p = d.fiscal ? periodForStatement(d.fiscal, fiscalDate, false) : null;
    return p ? `${fiscalLabelEn(p, d.fiscal!.offCalendar)} (ended ${p.periodEnd})` : fiscalDate;
  };

  // Statement amounts are in USD unless no rate could be had for a foreign filer.
  const sm = (n: number | null | undefined) =>
    d.statementCurrency === 'USD' ? money(n) : n == null ? '—' : `${d.statementCurrency} ${big(n)}`;
  if (d.fx) {
    lines.push('');
    lines.push(
      `STATEMENT CURRENCY: ${d.symbol} reports in ${d.fx.from}. The statement amounts and EPS below were converted to US dollars ` +
      `at the latest rate, 1 USD = ${d.fx.rate.toFixed(4)} ${d.fx.from} (${d.fx.date}), for every period. Margins and growth rates are unaffected. ` +
      `EPS is per ordinary share in the home market; a US-listed ADR can represent several of them (TSM: 5), so never set this EPS against the US share price to work out a P/E. ` +
      `Say in the report that the figures were converted from ${d.fx.from}.`
    );
  } else if (d.statementCurrency !== 'USD') {
    lines.push('');
    lines.push(`STATEMENT CURRENCY: the statement amounts and EPS below are in ${d.statementCurrency}, not US dollars. Say so wherever you quote them.`);
  }

  if (d.income.length) {
    lines.push('');
    lines.push('INCOME STATEMENT (most recent quarters, newest first):');
    for (const q of d.income.slice(0, 4)) {
      lines.push(
        `${periodName(q.fiscal_date)}: Rev ${sm(q.revenue)} · GrossProfit ${sm(q.gross_profit)} · OpInc ${sm(q.operating_income)} · NetInc ${sm(q.net_income)} · EBITDA ${sm(q.ebitda)} · EPS(dil) ${num(q.eps_diluted)} · R&D ${sm(q.r_and_d_expenses)}`
      );
    }
  }

  if (d.balance.length) {
    const b = d.balance[0];
    lines.push('');
    lines.push(`BALANCE SHEET (${periodName(b.fiscal_date)}): Assets ${sm(b.total_assets)} · Cash ${sm(b.cash_and_equivalents)} · CurrentAssets ${sm(b.total_current_assets)} · Liabilities ${sm(b.total_liabilities)} · CurrentLiab ${sm(b.total_current_liabilities)} · LT debt ${sm(b.long_term_debt)} · Equity ${sm(b.total_stockholders_equity)}`);
  }

  if (d.cashflow.length) {
    const c = d.cashflow[0];
    lines.push('');
    lines.push(`CASH FLOW (${periodName(c.fiscal_date)}): Operating ${sm(c.operating_cash_flow)} · CapEx ${sm(c.capital_expenditures)} · FreeCashFlow ${sm(c.free_cash_flow)} · Dividends paid ${sm(c.dividends_paid)}`);
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
