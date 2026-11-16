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
  TwelveDataRateLimitError,
  type CompanyStatistics,
  type IncomeStatementPeriod,
  type BalanceSheetPeriod,
  type CashFlowPeriod,
} from '@/lib/twelvedata/twelvedata-client';
import { getCached, getCachedStale, setCached } from '@/lib/cache/market-data-cache';
import { coalesce } from '@/lib/cache/request-coalesce';
import { tryReserveOrganicCredits } from '@/lib/twelvedata/credit-budget';
import { computeHealthScore, healthColumns, HEALTH_SCORE_METHOD, type HealthScore } from '@/lib/finance/health-score';
import { recordHealthScoreSnapshot } from '@/lib/finance/health-score-history';
import { createServerClient } from '@/lib/supabase/client';

const STATS_TTL = 60 * 60; // 1 hour — matches /statistics route
const FINANCIALS_TTL = 24 * 60 * 60; // 24 hours — matches /financials route
// Same reservations as the /statistics and /financials routes.
const STATS_CREDITS = 50;
const STATEMENT_CREDITS = 101;

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
  // Sector sets the leverage bar (utilities, real estate) and the persisted
  // score is the degraded fallback, so one read serves both.
  const { data: persisted } = await createServerClient()
    .from('screener_stats')
    .select('sector, health_score, health_score_grade, health_score_version')
    .eq('ticker', sym)
    .maybeSingle();
  const computed = computeHealthScore(stats, income, balance, cashflow, { sector: persisted?.sector ?? null });

  if (!degraded) {
    void createServerClient()
      .from('screener_stats')
      .update(healthColumns(computed))
      .eq('ticker', sym)
      .then(({ error }) => {
        if (error) console.warn('[health-score] screener_stats sync failed:', error.message);
      });
    if (!computed.insufficientData) void recordHealthScoreSnapshot(sym, computed, income[0]?.fiscal_date);
    return { healthScore: computed, degraded: false };
  }

  // Degraded — don't serve a score built on incomplete data. Fall back to the
  // last known-good persisted score for this ticker so this surface matches
  // what every other page shows, rather than an artificially low number
  // driven by a transient fetch failure. Only a score from the current
  // method counts: an old-method number would disagree with the breakdown.
  if (
    persisted?.health_score != null &&
    persisted.health_score_grade &&
    persisted.health_score_version === HEALTH_SCORE_METHOD
  ) {
    const grade = persisted.health_score_grade as HealthScore['grade'];
    return {
      healthScore: {
        ...computed,
        score: persisted.health_score,
        grade,
        label: gradeLabel(grade),
        insufficientData: false,
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
    // /snapshot seeds snap-stats:<sym> from the same /batch call — reuse it
    // before hitting TwelveData again, same pattern as /statistics.
    const fresh =
      (await getCached<CompanyStatistics>(`snap-stats:${sym}`)) ??
      ((await tryReserveOrganicCredits(STATS_CREDITS)) ? await coalesce(`stats:${sym}`, () => getStatistics(sym)) : null);
    if (fresh) {
      stats = fresh;
      await setCached(`stats:${sym}`, sym, 'statistics', stats, STATS_TTL).catch(() => {});
    } else {
      // Budget denied: the last known statistics, or a 429 the route already handles.
      stats = await getCachedStale<CompanyStatistics>(`stats:${sym}`);
      if (!stats) throw new TwelveDataRateLimitError();
    }
  }

  // Each statement is ~101 credits and this runs on every cold stock page, so
  // a crawl through 40 tickers asked for ~12,000 credits in a minute
  // (2026-11-16, 2,188 used against the 610 cap). Reserved like /financials:
  // a denied or failed fetch serves the last cached value; only a statement
  // never cached at all makes the score degraded (persisted score fallback).
  const statement = async <T>(kind: string, fetcher: () => Promise<T[]>): Promise<{ rows: T[]; degraded: boolean }> => {
    const key = `financials:${sym}:${kind}:quarterly`;
    const cached = await getCached<T[]>(key);
    if (cached) return { rows: cached, degraded: false };
    try {
      // Reserved inside the coalesced fetch, as /financials does on the same key:
      // a request joining an in-flight fetch must not count its credits twice.
      const fresh = await coalesce(key, async () =>
        (await tryReserveOrganicCredits(STATEMENT_CREDITS)) ? withRateLimitRetry(fetcher) : null);
      if (fresh) {
        // Only fresh data is cached: re-caching a stale fallback would reset its TTL.
        void setCached(key, sym, 'financials', fresh, FINANCIALS_TTL).catch(() => {});
        return { rows: fresh, degraded: false };
      }
    } catch (err) {
      console.warn(`[health-score] ${kind} fetch failed for ${sym}:`, err instanceof Error ? err.message : err);
    }
    const stale = await getCachedStale<T[]>(key);
    return { rows: stale ?? [], degraded: !stale };
  };

  const [income, balance, cashflow] = await Promise.all([
    statement<IncomeStatementPeriod>('income', () => getIncomeStatement(sym, 'quarterly')),
    statement<BalanceSheetPeriod>('balance', () => getBalanceSheet(sym, 'quarterly')),
    statement<CashFlowPeriod>('cashflow', () => getCashFlow(sym, 'quarterly')),
  ]);

  const degraded = income.degraded || balance.degraded || cashflow.degraded;
  return computeAndSyncHealthScore(sym, stats, income.rows, balance.rows, cashflow.rows, degraded);
}
