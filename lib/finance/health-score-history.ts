/**
 * Records a Financial Health Score snapshot for a ticker's fiscal quarter,
 * overwriting any existing row for that exact quarter.
 *
 * The caller always passes `income[0].fiscal_date` — the *latest* known
 * quarter — so in practice this keeps the current quarter's row in sync with
 * the live score on every recompute (roughly hourly, per STATS_TTL). That
 * matters because Valuation and Market Risk (30 of 100 pts) are priced off
 * live market data, not fixed quarterly fundamentals, so the "right" score
 * for the current quarter keeps moving with the stock price even though
 * income/balance/cashflow haven't changed. Once a new quarter's earnings
 * post, `fiscal_date` advances and this row stops being touched — freezing
 * it as history, which is correct once a quarter is actually closed.
 *
 * Relies on the `UNIQUE (ticker, fiscal_date)` constraint on
 * health_score_history to make this an upsert; the two call sites (the daily
 * screener cron and the per-ticker health-score route) can both call this for
 * the same ticker/quarter without coordinating — last write wins, which is
 * fine since they compute the same score from the same live inputs.
 */

import { createServerClient } from '@/lib/supabase/client';
import type { HealthScore } from './health-score';

export async function recordHealthScoreSnapshot(
  ticker: string,
  healthScore: HealthScore,
  fiscalDate: string | null | undefined
): Promise<void> {
  if (!fiscalDate) return;

  const supabase = createServerClient();
  const { error } = await supabase
    .from('health_score_history')
    .upsert(
      {
        ticker,
        fiscal_date: fiscalDate,
        snapshot_date: new Date().toISOString().slice(0, 10),
        score: healthScore.score,
        grade: healthScore.grade,
        categories: healthScore.categories,
      },
      { onConflict: 'ticker,fiscal_date' }
    );

  if (error) {
    console.warn(`[health-score-history] snapshot upsert failed for ${ticker}:`, error.message);
  }
}
