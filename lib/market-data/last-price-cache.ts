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
import { secondsUntilNextOpenET } from '@/lib/market-data/trading-day';

export interface LastPriceSeed {
  price: number;
  changePercent: number | null;
}

const TTL_SECONDS = 3 * 60;

/**
 * Outside the regular session a plain (non-prepost) quote is the last close
 * and cannot move until the next 9:30 ET open, so it is held until then
 * instead of being re-bought every 3 minutes all night and weekend. The first
 * 15 minutes after the bell stay short while the closing print settles.
 */
export function lastPriceTtlSeconds(now = new Date()): number {
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const mins = et.getHours() * 60 + et.getMinutes();
  const weekday = et.getDay() >= 1 && et.getDay() <= 5;
  if (weekday && mins >= 570 && mins < 975) return TTL_SECONDS;
  return Math.max(TTL_SECONDS, secondsUntilNextOpenET(now));
}

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

/**
 * Fire-and-forget write — call whenever a fresh quote is fetched from TwelveData.
 * Pass `extended` for a prepost quote: its price does move off-session, so it
 * keeps the short TTL.
 */
export function cacheLastPrice(ticker: string, seed: LastPriceSeed, extended = false): void {
  void rset(keyFor(ticker), seed, extended ? TTL_SECONDS : lastPriceTtlSeconds());
}
