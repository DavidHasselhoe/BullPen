/**
 * The "Worth a look" collections.
 *
 * Each list has to carry its own reason. A grid of logos ordered by market cap
 * tells a user nothing they didn't already know; "12.4x forward earnings against
 * a 19.8x sector median" is a reason to click. Every item therefore ships with a
 * `reason` string built from the same numbers the screen selected on.
 *
 * Both screens run off `screener_stats` and the metric rollups, which the daily
 * prefetch cron maintains — no market-data credits for the selection itself.
 * Only the final price hydration costs anything.
 */

import { createServerClient } from '@/lib/supabase/client';
import { seedPrices } from '@/lib/market-data/seed-prices';
import { getStockQuotes, withRateLimitRetry } from '@/lib/twelvedata/twelvedata-client';
import { rget, rset } from '@/lib/cache/redis-cache';
import type { TickerItem } from './discover-config';

/** How many names each collection shows. */
const COLLECTION_SIZE = 6;

/** Minimum market cap for anything we surface — keeps beginners out of microcaps. */
const MIN_MARKET_CAP = 2_000_000_000;

/**
 * Universe for the 52-week screens. Bounded on purpose: these need a live price
 * for every candidate to rank at all, and pricing the full 3,000-row table would
 * be both slow and expensive. The largest 300 names are the ones a
 * beginner-to-intermediate user would actually recognise.
 */
const RANKED_UNIVERSE_SIZE = 300;

/** The computed lists change slowly; 15 min keeps the price fetch rare. */
const CACHE_TTL_SECONDS = 15 * 60;
const CACHE_KEY_52W = 'discover:52w:v1';
const CACHE_KEY_QUALITY = 'discover:quality:v1';

interface ScreenerRow {
  ticker: string;
  name: string | null;
  sector: string | null;
  logo_url: string | null;
  market_cap: number | null;
  forward_pe: number | null;
  health_score: number | null;
  week52_high: number | null;
  week52_low: number | null;
}

const COLUMNS =
  'ticker, name, sector, logo_url, market_cap, forward_pe, health_score, week52_high, week52_low';

function toItem(row: ScreenerRow, reason: string, price?: number, changePct?: number): TickerItem {
  return {
    symbol: row.ticker,
    ticker: row.ticker,
    name: row.name ?? row.ticker,
    logoUrl: row.logo_url,
    sector: row.sector,
    marketCap: row.market_cap,
    previousClose: price ?? null,
    changePercent: changePct ?? null,
    reason,
  };
}

// ─── Quality at a discount ───────────────────────────────────────────────────

/**
 * Financially strong companies trading below what their sector typically
 * commands on forward earnings.
 *
 * "Strong" is measured as a percentile WITHIN the company's own sector, not
 * against an absolute health-score threshold. The score distribution is skewed
 * low (mean ~32, p90 ~51 across the tracked universe), so an absolute cutoff of
 * 70 clears barely thirty names market-wide and would collapse the list to a
 * single sector. Ranking within sector also removes the structural bias that
 * makes, say, a utility's balance sheet score differently from a biotech's.
 */
export async function getQualityAtDiscount(): Promise<TickerItem[]> {
  const cached = await rget<TickerItem[]>(CACHE_KEY_QUALITY);
  if (cached) return cached;

  const supabase = createServerClient();

  // `as never` on the args: the generated Database type doesn't carry this
  // function (migration 094), so its parameters infer as `undefined`.
  const { data, error } = await supabase.rpc('discover_quality_at_discount', {
    min_market_cap: MIN_MARKET_CAP,
    health_percentile: 0.75,
    limit_count: COLLECTION_SIZE,
  } as never);

  type QualityRow = ScreenerRow & { sector_median_fpe: number | null };
  const rows = (Array.isArray(data) ? data : []) as QualityRow[];

  if (error || rows.length === 0) {
    if (error) console.error('[discover/collections] quality screen failed:', error.message);
    return [];
  }

  const priced = await priceItems(rows.map((r) => r.ticker));

  const items = rows.map((row) => {
    const median = row.sector_median_fpe;
    const reason =
      row.forward_pe != null && median != null
        ? `${row.forward_pe.toFixed(1)}× forward earnings vs ${median.toFixed(1)}× typical for ${row.sector ?? 'its sector'}`
        : 'Strong financials for its sector';
    const q = priced.get(row.ticker);
    return toItem(row, reason, q?.price, q?.changePct);
  });

  void rset(CACHE_KEY_QUALITY, items, CACHE_TTL_SECONDS);
  return items;
}

// ─── Near 52-week highs / lows ───────────────────────────────────────────────

export interface Extremes {
  near52High: TickerItem[];
  near52Low: TickerItem[];
}

/**
 * Names pressing against their yearly extremes.
 *
 * `screener_stats` stores the 52-week band but no current price, so ranking by
 * distance from it needs a live quote per candidate. `seedPrices` is the right
 * tool: it reads the shared `seed:` Redis cache first — the same one the heatmap
 * and every price stream fill — so most of the universe is usually free, and
 * whatever it does fetch warms those surfaces in turn.
 */
export async function getFiftyTwoWeekExtremes(): Promise<Extremes> {
  const cached = await rget<Extremes>(CACHE_KEY_52W);
  if (cached) return cached;

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('screener_stats')
    .select(COLUMNS)
    .gte('market_cap', MIN_MARKET_CAP)
    .not('week52_high', 'is', null)
    .not('week52_low', 'is', null)
    .order('market_cap', { ascending: false })
    .limit(RANKED_UNIVERSE_SIZE)
    .returns<ScreenerRow[]>();

  if (error || !data || data.length === 0) {
    if (error) console.error('[discover/collections] 52w universe query failed:', error.message);
    return { near52High: [], near52Low: [] };
  }

  const prices = new Map<string, { price: number; changePct?: number }>();
  await seedPrices(data.map((r) => r.ticker), (symbol, quote) => {
    if (quote.price > 0) prices.set(symbol.toUpperCase(), { price: quote.price, changePct: quote.changePercent });
  });

  interface Scored { row: ScreenerRow; price: number; changePct?: number; pctFromHigh: number; pctFromLow: number }
  const scored: Scored[] = [];

  for (const row of data) {
    const q = prices.get(row.ticker.toUpperCase());
    const high = row.week52_high;
    const low = row.week52_low;
    if (!q || high == null || low == null || high <= 0 || low <= 0) continue;
    // Guard against a stale band the price has already broken through: a price
    // above its recorded high is a new high, which is 0% away, not negative.
    scored.push({
      row: row,
      price: q.price,
      changePct: q.changePct,
      pctFromHigh: Math.max(0, ((high - q.price) / high) * 100),
      pctFromLow: Math.max(0, ((q.price - low) / low) * 100),
    });
  }

  const near52High = [...scored]
    .sort((a, b) => a.pctFromHigh - b.pctFromHigh)
    .slice(0, COLLECTION_SIZE)
    .map((s) =>
      toItem(
        s.row,
        s.pctFromHigh < 0.5
          ? 'At a new 52-week high'
          : `${s.pctFromHigh.toFixed(1)}% below its 52-week high`,
        s.price,
        s.changePct,
      ),
    );

  const near52Low = [...scored]
    .sort((a, b) => a.pctFromLow - b.pctFromLow)
    .slice(0, COLLECTION_SIZE)
    .map((s) =>
      toItem(
        s.row,
        s.pctFromLow < 0.5
          ? 'At a new 52-week low'
          : `${s.pctFromLow.toFixed(1)}% above its 52-week low`,
        s.price,
        s.changePct,
      ),
    );

  const result = { near52High, near52Low };
  void rset(CACHE_KEY_52W, result, CACHE_TTL_SECONDS);
  return result;
}

// ─── Shared price hydration ──────────────────────────────────────────────────

/** One batched quote for a short list of symbols. Never throws. */
async function priceItems(
  symbols: string[],
): Promise<Map<string, { price: number; changePct: number }>> {
  const out = new Map<string, { price: number; changePct: number }>();
  if (symbols.length === 0) return out;
  try {
    const quotes = await withRateLimitRetry(() => getStockQuotes(symbols));
    for (const [sym, q] of quotes.entries()) {
      if (!q || !Number.isFinite(q.c) || q.c <= 0) continue;
      out.set(sym.toUpperCase(), { price: q.c, changePct: Number.isFinite(q.dp) ? q.dp : 0 });
    }
  } catch {
    /* prices are decorative here — the reason line carries the list */
  }
  return out;
}
