import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, withAuth, addSecurityHeaders } from '@/lib/security/api-security';
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
import { getCached, setCached } from '@/lib/cache/market-data-cache';
import { computeHealthScore } from '@/lib/finance/health-score';
import { recordHealthScoreSnapshot } from '@/lib/finance/health-score-history';
import { createServerClient } from '@/lib/supabase/client';

const STATS_TTL = 60 * 60;        // 1 hour — matches /statistics route
const FINANCIALS_TTL = 24 * 60 * 60; // 24 hours — matches /financials route

async function handler(
  _request: NextRequest,
  context: { params: Promise<{ ticker: string }> },
  _session: { userId: string }
): Promise<NextResponse> {
  const { ticker } = await context.params;
  const symbol = ticker.toUpperCase();

  try {
    // ── Statistics (50 credits if cold) — read cache seeded by snapshot route ──
    let stats = await getCached<CompanyStatistics>(`stats:${symbol}`);
    if (!stats) {
      stats = await getStatistics(symbol);
      await setCached(`stats:${symbol}`, symbol, 'statistics', stats, STATS_TTL).catch(() => {});
    }

    // ── Financial statements — fetched in parallel to avoid sequential rate-limiting.
    //    Cache keys are shared with /financials so a prior visit by either route warms
    //    the other. withRateLimitRetry guards against a 429 (rare on the current 610/min
    //    Venture plan, but possible under real concurrent load) and retries once rather
    //    than silently treating the failure as "no data".
    let incomeDegraded = false;
    let balanceDegraded = false;
    let cashflowDegraded = false;

    const [income, balance, cashflow] = await Promise.all([
      getCached<IncomeStatementPeriod[]>(`financials:${symbol}:income:quarterly`).then(
        (cached) => cached ?? withRateLimitRetry(() => getIncomeStatement(symbol, 'quarterly')).catch((err) => {
          console.warn(`[health-score] income fetch failed for ${symbol}:`, err instanceof Error ? err.message : err);
          incomeDegraded = true;
          return [] as IncomeStatementPeriod[];
        })
      ),
      getCached<BalanceSheetPeriod[]>(`financials:${symbol}:balance:quarterly`).then(
        (cached) => cached ?? withRateLimitRetry(() => getBalanceSheet(symbol, 'quarterly')).catch((err) => {
          console.warn(`[health-score] balance sheet fetch failed for ${symbol}:`, err instanceof Error ? err.message : err);
          balanceDegraded = true;
          return [] as BalanceSheetPeriod[];
        })
      ),
      getCached<CashFlowPeriod[]>(`financials:${symbol}:cashflow:quarterly`).then(
        (cached) => cached ?? withRateLimitRetry(() => getCashFlow(symbol, 'quarterly')).catch((err) => {
          console.warn(`[health-score] cash flow fetch failed for ${symbol}:`, err instanceof Error ? err.message : err);
          cashflowDegraded = true;
          return [] as CashFlowPeriod[];
        })
      ),
    ]);

    // Persist any freshly-fetched data to the shared cache (fire-and-forget).
    if (income.length)   void setCached(`financials:${symbol}:income:quarterly`,   symbol, 'financials', income,   FINANCIALS_TTL).catch(() => {});
    if (balance.length)  void setCached(`financials:${symbol}:balance:quarterly`,  symbol, 'financials', balance,  FINANCIALS_TTL).catch(() => {});
    if (cashflow.length) void setCached(`financials:${symbol}:cashflow:quarterly`, symbol, 'financials', cashflow, FINANCIALS_TTL).catch(() => {});

    const healthScore = computeHealthScore(stats, income, balance, cashflow);

    // Keep screener_stats in sync — fire-and-forget so it never delays the response.
    // Skipped when any statement fetch degraded (rate-limited/errored even after retry):
    // a score computed from an incomplete fetch would otherwise permanently overwrite a
    // previously-correct persisted score with a falsely low one.
    const financialsDegraded = incomeDegraded || balanceDegraded || cashflowDegraded;
    if (!financialsDegraded) {
      void createServerClient()
        .from('screener_stats')
        .update({ health_score: healthScore.score, health_score_grade: healthScore.grade })
        .eq('ticker', symbol)
        .then(({ error }) => {
          if (error) console.warn('[health-score] screener_stats sync failed:', error.message);
        });

      // Safety net for tickers outside the screener's tracked universe (e.g. a
      // long-tail holding) — the daily cron (Task 3) covers the tracked universe;
      // this covers any ticker a user actually views. Same UNIQUE(ticker,
      // fiscal_date) no-op behavior means this can't double-record what the cron
      // already caught.
      void recordHealthScoreSnapshot(symbol, healthScore, income[0]?.fiscal_date);
    }

    // A degraded computation (one or more statement fetches failed even after retry)
    // must not be cached — caching it would pin an incomplete/N-A score in the client's
    // HTTP cache for an hour even after the underlying data becomes available on a
    // later request (e.g. once /financials repopulates the shared cache on refresh).
    return addSecurityHeaders(
      NextResponse.json(
        { success: true, data: healthScore },
        { headers: { 'Cache-Control': financialsDegraded ? 'private, no-store' : 'private, max-age=3600' } }
      )
    );
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'Rate limit exceeded' }, { status: 429 })
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (/enterprise plan|higher plan|not available.*plan/i.test(msg)) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'plan_restricted' }, { status: 403 })
      );
    }
    console.error(`[health-score] Error for ${symbol}:`, err);
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to compute health score' }, { status: 500 })
    );
  }
}

export const GET = withRateLimit(withAuth(handler), { windowMs: 60 * 1000, maxRequests: 30 });
