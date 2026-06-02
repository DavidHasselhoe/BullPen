import { SP500_TICKERS } from './sp500';
import { createServerClient } from '@/lib/supabase/client';

/**
 * Static fallback universe (S&P 500). Used when the DB-backed
 * `screener_universe` table is empty or unreachable.
 */
export { SP500_TICKERS as SCREENER_UNIVERSE } from './sp500';

/**
 * Market-cap floor above which a tier-0 (on-demand) ticker is promoted to
 * tier 1 (actively refreshed). $2B ≈ the small-cap line, giving the active set
 * roughly S&P 1500 breadth, self-maintaining as companies grow/shrink.
 */
export const MARKET_CAP_PROMOTION_FLOOR = 2_000_000_000;

interface TickerRow { ticker: string }

/**
 * The actively-refreshed universe (tier 1), ordered by market cap so the most
 * significant names are refreshed first if a cron run is cut short. Falls back
 * to the static S&P 500 list when the table is empty or the query fails.
 */
export async function getActiveUniverse(): Promise<string[]> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('screener_universe')
      .select('ticker')
      .eq('tier', 1)
      .order('market_cap', { ascending: false, nullsFirst: false })
      .order('ticker', { ascending: true });
    if (error || !data || data.length === 0) return [...SP500_TICKERS];
    return (data as TickerRow[]).map((r) => r.ticker);
  } catch {
    return [...SP500_TICKERS];
  }
}

/**
 * A batch of tier-0 (on-demand-only) tickers to refresh during a discovery
 * sweep — least-recently-refreshed first so coverage rotates over time. Their
 * stats get cached and any that clear the market-cap floor are promoted.
 */
export async function getDiscoveryBatch(limit: number): Promise<string[]> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('screener_universe')
      .select('ticker')
      .eq('tier', 0)
      .order('last_refreshed_at', { ascending: true, nullsFirst: true })
      .order('ticker', { ascending: true })
      .limit(limit);
    if (error || !data) return [];
    return (data as TickerRow[]).map((r) => r.ticker);
  } catch {
    return [];
  }
}
