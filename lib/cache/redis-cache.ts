/**
 * Thin Redis cache layer backed by Upstash.
 *
 * Fails silently on every error — callers must treat a null return as a cache
 * miss and fall through to the origin. Never throws; never blocks a response.
 *
 * Falls back to no-op (returns null / does nothing) when env vars are absent
 * so local dev without Upstash configured works unchanged.
 */

import { Redis } from '@upstash/redis';

let _client: Redis | null = null;

function client(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  if (!_client) _client = Redis.fromEnv();
  return _client;
}

/** Read a cached value. Returns null on miss, expiry, or any error. */
export async function rget<T>(key: string): Promise<T | null> {
  try {
    return await client()?.get<T>(key) ?? null;
  } catch {
    return null;
  }
}

/**
 * Write a value with a TTL. Fire-and-forget safe — await it or void it,
 * never let its failure propagate to the caller.
 */
export async function rset<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  try {
    await client()?.set(key, value, { ex: ttlSeconds });
  } catch {
    // non-fatal
  }
}

// ── Market-session-aware TTL for 1D candles ───────────────────────────────────

type MarketSession = 'regular' | 'extended' | 'closed';

function getMarketSession(): MarketSession {
  // toLocaleString gives us the ET wall-clock time without a tz library.
  const etStr = new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
  });
  const et = new Date(etStr);
  const day = et.getDay(); // 0 = Sun, 6 = Sat
  if (day === 0 || day === 6) return 'closed';

  const mins = et.getHours() * 60 + et.getMinutes();
  if (mins >= 570 && mins < 960) return 'regular';   // 9:30 AM – 4:00 PM ET
  if (mins >= 240 && mins < 1200) return 'extended'; // 4:00 AM – 8:00 PM ET
  return 'closed';
}

/**
 * Returns the appropriate TTL (seconds) for a 1D candle response:
 *   - Regular hours:  10 s  (price moves every few seconds)
 *   - Extended hours: 30 s  (slower market, still updating)
 *   - Market closed:  300 s (static until next open)
 */
export function candleTtlSeconds(): number {
  const session = getMarketSession();
  if (session === 'regular') return 10;
  if (session === 'extended') return 30;
  return 300;
}
