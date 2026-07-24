/**
 * Canonical health-score compute+sync, shared by every surface that displays it
 * (stock page, AI tools, deep-dive reports). `screener_stats.health_score` /
 * `health_score_grade` is the single source of truth for the *number a user
 * sees* — every non-degraded computation writes through to it, and a degraded
 * computation (a statement fetch failed even after retry) falls back to the
 * last persisted value instead of serving a score built from incomplete data.
 * Without this, a transient fetch failure on one surface would show a lower,
 * "wrong" score while every other surface kept showing the correct one.
 */

import {
  getStatistics,
  getIncomeStatement,
  getBalanceSheet,
  getCashFlow,
  withRateLimitRetry,
  type CompanyStatistics,
  type IncomeStatementPeriod,
  type BalanceSheetPeriod,
  type CashFlowPeriod,
} from '@/lib/twelvedata/twelvedata-client';
import { getCached, getCachedStale, setCached } from '@/lib/cache/market-data-cache';
import { computeHealthScore, type HealthScore } from '@/lib/finance/health-score';
import { recordHealthScoreSnapshot } from '@/lib/finance/health-score-history';
import { createServerClient } from '@/lib/supabase/client';

const STATS_TTL = 60 * 60; // 1 hour — matches /statistics route
const FINANCIALS_TTL = 24 * 60 * 60; // 24 hours — matches /financials route

export interface HealthScoreResult {
  healthScore: HealthScore;
  /** True if one or more statement fetches failed even after retry. */
  degraded: boolean;
}

function gradeLabel(grade: HealthScore['grade']): string {
  switch (grade) {
    case 'A': return 'Strong';
    case 'B': return 'Good';
    case 'C': return 'Fair';
    case 'D': return 'Weak';
    default: return 'At Risk';
  }
}

/**
 * Computes the health score from already-fetched inputs, syncs it to
 * screener_stats when the inputs are complete, and falls back to the last
 * persisted score when they aren't. Use this when a caller already has
 * stats/income/balance/cashflow in hand (e.g. deep-dive gathers them for
 * other prompt fields too) to avoid a redundant fetch.
 */
export async function computeAndSyncHealthScore(
  symbol: string,
  stats: CompanyStatistics,
  income: IncomeStatementPeriod[],
  balance: BalanceSheetPeriod[],
  cashflow: CashFlowPeriod[],
  degraded: boolean
): Promise<HealthScoreResult> {
  const sym = symbol.toUpperCase();
  const computed = computeHealthScore(stats, income, balance, cashflow);

  if (!degraded) {
    void createServerClient()
      .from('screener_stats')
      .update({ health_score: computed.score, health_score_grade: computed.grade })
      .eq('ticker', sym)
      .then(({ error }) => {
        if (error) console.warn('[health-score] screener_stats sync failed:', error.message);
      });
    void recordHealthScoreSnapshot(sym, computed, income[0]?.fiscal_date);
    return { healthScore: computed, degraded: false };
  }

  // Degraded — don't serve a score built on incomplete data. Fall back to the
  // last known-good persisted score for this ticker so this surface matches
  // what every other page shows, rather than an artificially low number
  // driven by a transient fetch failure.
  const { data: persisted } = await createServerClient()
    .from('screener_stats')
    .select('health_score, health_score_grade')
    .eq('ticker', sym)
    .maybeSingle();

  if (persisted?.health_score != null && persisted.health_score_grade) {
    const grade = persisted.health_score_grade as HealthScore['grade'];
    return {
      healthScore: {
        ...computed,
        score: persisted.health_score,
        grade,
        label: gradeLabel(grade),
      },
      degraded: true,
    };
  }

  // No persisted fallback available (e.g. a long-tail ticker outside the
  // screener's tracked universe) — the freshly computed value, incomplete as
  // it is, is still the best information available.
  return { healthScore: computed, degraded: true };
}

/**
 * Fetches stats/income/balance/cashflow (cache-first, same shared cache keys
 * as /snapshot and /financials) and computes+syncs the health score. Use this
 * when the caller doesn't already have the underlying data in hand.
 */
export async function getHealthScoreForSymbol(symbol: string): Promise<HealthScoreResult> {
  const sym = symbol.toUpperCase();

  let stats = await getCached<CompanyStatistics>(`stats:${sym}`);
  if (!stats) {
    stats = await getStatistics(sym);
    await setCached(`stats:${sym}`, sym, 'statistics', stats, STATS_TTL).catch(() => {});
  }

  let incomeDegraded = false;
  let balanceDegraded = false;
  let cashflowDegraded = false;
  let incomeFresh = false;
  let balanceFresh = false;
  let cashflowFresh = false;

  const [income, balance, cashflow] = await Promise.all([
    getCached<IncomeStatementPeriod[]>(`financials:${sym}:income:quarterly`).then(async (cached) => {
      if (cached) return cached;
      try {
        const fresh = await withRateLimitRetry(() => getIncomeStatement(sym, 'quarterly'));
        incomeFresh = true;
        return fresh;
      } catch (err) {
        console.warn(`[health-score] income fetch failed for ${sym}:`, err instanceof Error ? err.message : err);
        const stale = await getCachedStale<IncomeStatementPeriod[]>(`financials:${sym}:income:quarterly`);
        if (!stale) incomeDegraded = true;
        return stale ?? [];
      }
    }),
    getCached<BalanceSheetPeriod[]>(`financials:${sym}:balance:quarterly`).then(async (cached) => {
      if (cached) return cached;
      try {
        const fresh = await withRateLimitRetry(() => getBalanceSheet(sym, 'quarterly'));
        balanceFresh = true;
        return fresh;
      } catch (err) {
        console.warn(`[health-score] balance sheet fetch failed for ${sym}:`, err instanceof Error ? err.message : err);
        const stale = await getCachedStale<BalanceSheetPeriod[]>(`financials:${sym}:balance:quarterly`);
        if (!stale) balanceDegraded = true;
        return stale ?? [];
      }
    }),
    getCached<CashFlowPeriod[]>(`financials:${sym}:cashflow:quarterly`).then(async (cached) => {
      if (cached) return cached;
      try {
        const fresh = await withRateLimitRetry(() => getCashFlow(sym, 'quarterly'));
        cashflowFresh = true;
        return fresh;
      } catch (err) {
        console.warn(`[health-score] cash flow fetch failed for ${sym}:`, err instanceof Error ? err.message : err);
        const stale = await getCachedStale<CashFlowPeriod[]>(`financials:${sym}:cashflow:quarterly`);
        if (!stale) cashflowDegraded = true;
        return stale ?? [];
      }
    }),
  ]);

  // Persist only genuinely fresh data — re-caching a stale fallback would reset
  // its TTL and delay the next real retry by another 24h.
  if (incomeFresh)   void setCached(`financials:${sym}:income:quarterly`,   sym, 'financials', income,   FINANCIALS_TTL).catch(() => {});
  if (balanceFresh)  void setCached(`financials:${sym}:balance:quarterly`,  sym, 'financials', balance,  FINANCIALS_TTL).catch(() => {});
  if (cashflowFresh) void setCached(`financials:${sym}:cashflow:quarterly`, sym, 'financials', cashflow, FINANCIALS_TTL).catch(() => {});

  const degraded = incomeDegraded || balanceDegraded || cashflowDegraded;
  return computeAndSyncHealthScore(sym, stats, income, balance, cashflow, degraded);
}
