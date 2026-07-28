/**
 * Shared last-known-price cache — a single Redis-backed "last close" fallback
 * used by every surface that shows a live price. Originally built for the
 * Screener (`app/api/screener/route.ts`), now also backs `/api/quotes/batch`
 * (holdings + watchlist) so a price/pct value survives a transient TwelveData
 * failure or a market-closed gap instead of rendering blank forever.
 *
 * Deliberately cross-surface: any successful quote fetched anywhere warms the
 * same cache key, so e.g. a Screener page load can supply the last price a
 * Watchlist row falls back to a few minutes later, and vice versa.
 */

import { rmget, rset } from '@/lib/cache/redis-cache';

export interface LastPriceSeed {
  price: number;
  changePercent: number | null;
}

const TTL_SECONDS = 3 * 60;
const keyFor = (ticker: string) => `screener-price:${ticker.toUpperCase()}`;

/** Batch-read the cache for every ticker that has one. Missing tickers are simply absent from the returned map. */
export async function getLastPrices(tickers: string[]): Promise<Map<string, LastPriceSeed>> {
  if (tickers.length === 0) return new Map();
  const upper = [...new Set(tickers.map((t) => t.toUpperCase()))];
  const cached = await rmget<LastPriceSeed>(upper.map(keyFor));

  const out = new Map<string, LastPriceSeed>();
  for (const t of upper) {
    const hit = cached.get(keyFor(t));
    if (hit) out.set(t, hit);
  }
  return out;
}

/** Fire-and-forget write — call whenever a fresh quote is fetched from TwelveData. */
export function cacheLastPrice(ticker: string, seed: LastPriceSeed): void {
  void rset(keyFor(ticker), seed, TTL_SECONDS);
}
