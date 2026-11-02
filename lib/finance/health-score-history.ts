/**
 * Records a Financial Health Score snapshot for a ticker's fiscal quarter,
 * overwriting any existing row for that exact quarter.
 *
 * The caller always passes `income[0].fiscal_date` — the *latest* known
 * quarter — so in practice this keeps the current quarter's row in sync with
 * the live score on every recompute (roughly hourly, per STATS_TTL). That
 * matters because Growth and Market Risk read TwelveData /statistics (beta,
 * latest growth rates), which can move between statements. Once a new quarter's earnings
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
import type { CategoryScore, HealthScore } from './health-score';

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
        method: healthScore.method,
      },
      { onConflict: 'ticker,fiscal_date' }
    );

  if (error) {
    console.warn(`[health-score-history] snapshot upsert failed for ${ticker}:`, error.message);
  }
}

export interface CurrentQuarterScore {
  fiscalDate: string;
  score: number;
  categories: CategoryScore[];
  method: number;
}

export interface QuarterlyHealthChange {
  symbol: string;
  fiscalDate: string;
  oldScore: number;
  newScore: number;
  /** The category whose points moved most, in the score's direction. */
  driver: string | null;
}

/** Points a new quarter must move the score by to be worth telling holders. */
export const QUARTERLY_ALERT_POINTS = 5;
/** A quarter counts as new for this long after its first snapshot. */
const NEW_QUARTER_DAYS = 14;

/**
 * Stocks whose newly reported quarter moved the health score by
 * QUARTERLY_ALERT_POINTS or more against the quarter before. A move inside
 * one grade (GOOGL 92 -> 85 after Q3, both A) never trips a grade alert, yet
 * it is the news a holder wants after earnings.
 *
 * "New" is the current quarter's history row first written in the last
 * NEW_QUARTER_DAYS (created_at is set once; later upserts keep it), so
 * months-old quarters never alert. A brand-new quarter whose row this run's
 * fire-and-forget snapshot has not written yet is picked up on the next run.
 * Quarters scored by a different method are not compared.
 */
export async function findQuarterlyHealthChanges(current: Map<string, CurrentQuarterScore>): Promise<QuarterlyHealthChange[]> {
  if (current.size === 0) return [];
  const supabase = createServerClient();
  const newSince = Date.now() - NEW_QUARTER_DAYS * 86_400_000;
  const tickers = [...current.keys()];
  const out: QuarterlyHealthChange[] = [];

  // Chunked: a few quarters per ticker stays well under PostgREST's 1000-row cap.
  for (let i = 0; i < tickers.length; i += 200) {
    const { data } = await supabase
      .from('health_score_history')
      .select('ticker, fiscal_date, score, categories, method, created_at')
      .in('ticker', tickers.slice(i, i + 200))
      .gte('fiscal_date', new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10))
      .order('fiscal_date', { ascending: false });
    const rows = (data ?? []) as Array<{ ticker: string; fiscal_date: string; score: number; categories: CategoryScore[]; method: number; created_at: string }>;

    for (const ticker of tickers.slice(i, i + 200)) {
      const now = current.get(ticker)!;
      const mine = rows.filter((r) => r.ticker === ticker);
      const currentRow = mine.find((r) => r.fiscal_date === now.fiscalDate);
      const previous = mine.find((r) => r.fiscal_date < now.fiscalDate);
      if (!currentRow || !previous || Date.parse(currentRow.created_at) < newSince) continue;
      if (previous.method !== now.method) continue;
      const delta = now.score - previous.score;
      if (Math.abs(delta) < QUARTERLY_ALERT_POINTS) continue;
      out.push({ symbol: ticker, fiscalDate: now.fiscalDate, oldScore: previous.score, newScore: now.score, driver: quarterDriver(previous.categories, now.categories, delta) });
    }
  }
  return out;
}

/** The category that moved furthest in the same direction as the total. */
export function quarterDriver(before: CategoryScore[], after: CategoryScore[], delta: number): string | null {
  let best: { name: string; move: number } | null = null;
  for (const a of after) {
    const b = before.find((c) => c.name === a.name);
    if (!b) continue;
    const move = (a.score - b.score) * Math.sign(delta);
    if (move > 0 && (!best || move > best.move)) best = { name: a.name, move };
  }
  return best?.name ?? null;
}
