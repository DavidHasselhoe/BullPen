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
 * Batch read — one round trip for many keys instead of N parallel GETs.
 * Returns a Map of only the keys that hit (missing/expired keys are absent).
 * Falls back to empty (never throws) when Redis isn't configured or errors.
 */
export async function rmget<T>(keys: string[]): Promise<Map<string, T>> {
  const result = new Map<string, T>();
  if (keys.length === 0) return result;
  const c = client();
  if (!c) return result;
  try {
    const values = await c.mget<(T | null)[]>(...keys);
    for (let i = 0; i < keys.length; i++) {
      const v = values[i];
      if (v != null) result.set(keys[i], v);
    }
  } catch {
    // non-fatal — callers treat missing keys as cache misses
  }
  return result;
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

/** Delete a cached value. Never throws. */
export async function rdel(key: string): Promise<void> {
  try {
    await client()?.del(key);
  } catch {
    // non-fatal
  }
}

// ── Market-session-aware TTL for 1D candles ───────────────────────────────────

export type MarketSession = 'regular' | 'extended' | 'closed';

export function getMarketSession(): MarketSession {
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
