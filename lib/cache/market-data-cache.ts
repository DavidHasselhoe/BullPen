import { createServerClient } from '@/lib/supabase/client';

const TABLE = 'market_data_cache';

interface MarketDataCacheRow {
  cache_key: string;
  ticker: string;
  data_type: string;
  payload: unknown;
  fetched_at: string;
  expires_at: string;
}

/**
 * Read cache by key. Returns null on cache miss, expiry, or transient DB errors.
 */
export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from(TABLE)
      .select('payload, expires_at')
      .eq('cache_key', key)
      .maybeSingle<Pick<MarketDataCacheRow, 'payload' | 'expires_at'>>();

    if (error || !data) return null;
    if (Date.parse(data.expires_at) <= Date.now()) return null;
    return data.payload as T;
  } catch (error) {
    console.error('[market-data-cache] read failed:', error);
    return null;
  }
}

/**
 * Batched `getCached` — one round trip for many keys instead of one per key.
 *
 * Built for the calendar's per-day cache (lib/market-data/calendar-days.ts),
 * where a month view needs 31 day-entries at once; issuing 31 sequential
 * `getCached` calls would dominate the request's latency budget. Keys absent
 * from the returned Map are misses (never cached, or expired), same contract
 * as `getCached` returning null.
 */
export async function getCachedMany<T>(keys: string[]): Promise<Map<string, T>> {
  const out = new Map<string, T>();
  if (keys.length === 0) return out;
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from(TABLE)
      .select('cache_key, payload, expires_at')
      .in('cache_key', keys)
      .returns<Pick<MarketDataCacheRow, 'cache_key' | 'payload' | 'expires_at'>[]>();

    if (error || !data) return out;
    const now = Date.now();
    for (const row of data) {
      if (Date.parse(row.expires_at) <= now) continue;
      out.set(row.cache_key, row.payload as T);
    }
    return out;
  } catch (error) {
    console.error('[market-data-cache] batched read failed:', error);
    return out;
  }
}

/**
 * Batched `getCachedStale` — ignores expiry. Same last-resort role: when a
 * live refetch fails, reuse the last known-good day rather than render it empty.
 */
export async function getCachedManyStale<T>(keys: string[]): Promise<Map<string, T>> {
  const out = new Map<string, T>();
  if (keys.length === 0) return out;
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from(TABLE)
      .select('cache_key, payload')
      .in('cache_key', keys)
      .returns<Pick<MarketDataCacheRow, 'cache_key' | 'payload'>[]>();

    if (error || !data) return out;
    for (const row of data) out.set(row.cache_key, row.payload as T);
    return out;
  } catch (error) {
    console.error('[market-data-cache] batched stale read failed:', error);
    return out;
  }
}

/**
 * Reads the payload regardless of expiry — a last-resort fallback for when a
 * live refetch fails, so a transient error reuses the last known-good data
 * instead of an empty/zeroed result. Returns null only if the key was never
 * cached at all.
 */
export async function getCachedStale<T>(key: string): Promise<T | null> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from(TABLE)
      .select('payload')
      .eq('cache_key', key)
      .maybeSingle<Pick<MarketDataCacheRow, 'payload'>>();

    if (error || !data) return null;
    return data.payload as T;
  } catch (error) {
    console.error('[market-data-cache] stale read failed:', error);
    return null;
  }
}

/**
 * Like getCached but also returns the fetched_at timestamp.
 * Returns null on miss/expiry; { payload, fetchedAt } on hit.
 */
export async function getCachedWithMeta<T>(key: string): Promise<{ payload: T; fetchedAt: string } | null> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from(TABLE)
      .select('payload, fetched_at, expires_at')
      .eq('cache_key', key)
      .maybeSingle<Pick<MarketDataCacheRow, 'payload' | 'fetched_at' | 'expires_at'>>();

    if (error || !data) return null;
    if (Date.parse(data.expires_at) <= Date.now()) return null;
    return { payload: data.payload as T, fetchedAt: data.fetched_at };
  } catch (error) {
    console.error('[market-data-cache] read failed:', error);
    return null;
  }
}

/**
 * Write/refresh cache key with a TTL.
 */
export async function setCached<T>(
  key: string,
  ticker: string,
  dataType: string,
  data: T,
  ttlSeconds: number
): Promise<void> {
  try {
    const supabase = createServerClient();
    const now = Date.now();
    const expiresAt = new Date(now + ttlSeconds * 1000).toISOString();

    const payload: MarketDataCacheRow = {
      cache_key: key,
      ticker: ticker.toUpperCase(),
      data_type: dataType,
      payload: data,
      fetched_at: new Date(now).toISOString(),
      expires_at: expiresAt,
    };

    const { error } = await supabase.from(TABLE).upsert(payload, { onConflict: 'cache_key' });
    if (error) {
      console.error('[market-data-cache] write failed:', error);
    }
  } catch (error) {
    console.error('[market-data-cache] write exception:', error);
  }
}
