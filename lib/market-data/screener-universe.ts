import { SP500_TICKERS } from './sp500';
import { createServerClient } from '@/lib/supabase/client';
import { getTickerOverride } from './ticker-overrides';
import { getUsStocksList } from '@/lib/twelvedata/twelvedata-client';

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

/**
 * Removes the given tickers from the universe and the screener when
 * TwelveData's reference list no longer has them as a US listing. When a US
 * company is acquired the bare symbol either stops resolving or goes to a
 * foreign listing (EA to Energy Absolute on SET, MRO to Melrose on LSE). The
 * refresh used to skip them and move on, so they stayed tier 1 forever, every
 * sweep paid for them again, and the screener kept their last US row: MRO
 * showed as Melrose with a $599B market cap counted in pence.
 *
 * Each candidate is checked against /stocks first, so a symbol that merely
 * resolves oddly but is still listed here stays. A failed lookup keeps it too.
 * Known collisions in ticker-overrides (CTRA, K) are left alone.
 */
export async function dropDelistedTickers(candidates: string[]): Promise<string[]> {
  const checks = await Promise.allSettled(
    candidates
      .filter((t) => !getTickerOverride(t))
      .map(async (t) => ((await getUsStocksList({ symbol: t })).length === 0 ? t : null)),
  );
  const drop = checks.flatMap((c) => (c.status === 'fulfilled' && c.value ? [c.value] : []));
  if (drop.length === 0) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServerClient() as any;
  const [universe, stats] = await Promise.all([
    db.from('screener_universe').delete().in('ticker', drop),
    db.from('screener_stats').delete().in('ticker', drop),
  ]);
  if (universe.error || stats.error) {
    console.error('[screener-universe] dropping delisted tickers failed:', universe.error ?? stats.error);
  } else {
    console.warn(`[screener-universe] dropped tickers TwelveData no longer lists in the US: ${drop.join(', ')}`);
  }
  return drop;
}
