/**
 * The index strip's quotes (SPY, QQQ, DIA, IWM as index proxies), shared by
 * the Discover feed and the dashboard's server render. One Redis entry serves
 * both, so Home costs no extra credits: 4 per minute, across all users.
 */

import { getStockQuotes, withRateLimitRetry } from '@/lib/twelvedata/twelvedata-client';
import { rget, rset } from '@/lib/cache/redis-cache';
import { MARKET_INDICES, type IndexQuote } from '@/lib/discover/discover-config';

// Version suffix: bump whenever the index list itself changes, so a deploy
// doesn't serve the previous set for another minute.
const INDEX_CACHE_KEY = 'discover:indices:v2';
const INDEX_TTL_SECONDS = 60;

export async function getMarketIndices(): Promise<IndexQuote[]> {
  const cached = await rget<IndexQuote[]>(INDEX_CACHE_KEY);
  if (cached) return cached;

  let quotes = new Map<string, { c: number; dp: number }>();
  try {
    quotes = await withRateLimitRetry(() => getStockQuotes(MARKET_INDICES.map((i) => i.symbol)));
  } catch (err) {
    console.error('[indices] index quotes failed:', err);
  }

  const indices: IndexQuote[] = MARKET_INDICES.map((entry) => {
    const q = quotes.get(entry.symbol);
    return {
      symbol: entry.symbol,
      label: entry.label,
      hint: entry.hint,
      price: q && Number.isFinite(q.c) && q.c > 0 ? q.c : null,
      changePct: q && Number.isFinite(q.dp) ? q.dp : null,
    };
  });

  // Only cache a payload that actually resolved, so a transient failure isn't
  // pinned into the cache for a full minute.
  if (indices.some((i) => i.price != null)) void rset(INDEX_CACHE_KEY, indices, INDEX_TTL_SECONDS);
  return indices;
}
