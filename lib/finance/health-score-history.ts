/**
 * Records a Financial Health Score snapshot for a ticker's fiscal quarter,
 * if one hasn't already been recorded for that exact quarter.
 *
 * Relies entirely on the `UNIQUE (ticker, fiscal_date)` constraint on
 * health_score_history + `ignoreDuplicates: true` — this makes the insert an
 * upsert-or-noop, so the two call sites (the daily screener cron and the
 * per-ticker health-score route) can both call this for the same
 * ticker/quarter without coordinating: whichever runs first wins, the other
 * silently no-ops. No pre-read/compare step needed.
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
      { onConflict: 'ticker,fiscal_date', ignoreDuplicates: true }
    );

  if (error) {
    console.warn(`[health-score-history] snapshot insert failed for ${ticker}:`, error.message);
  }
}
