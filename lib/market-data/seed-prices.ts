/**
 * Shared cold-start price seeding for real-time SSE price streams.
 *
 * Two-level dedup, cheapest first:
 *   1. Redis per-symbol cache (15s TTL, batched via a single MGET) — shared
 *      across serverless instances AND across routes (the heatmap stream and
 *      per-stock price streams read/write the same keys), so a symbol seeded
 *      by one surface moments ago is free for the next.
 *   2. TwelveData batch fetch — only for the true remainder, chunked to stay
 *      under the /batch request cap. Each chunk resolves independently, so
 *      callers get results as soon as their chunk lands rather than waiting
 *      for the single slowest chunk to hold back everything else.
 *
 * Deliberately does NOT gate on WsManager.hasPrevClose: that map is set once
 * per symbol and never expires, so on a warm process it would report almost
 * every S&P 500 symbol as "already seeded" and skip fetching a price for it —
 * even though hasPrevClose only means the previous close is known, not that
 * this new listener has ever received a *current* price. Redis's 15s TTL is
 * the real dedup boundary; the WsManager map is only used to pre-populate
 * prevClose for tick math, which is idempotent and safe to set redundantly.
 */

import { WsManager } from './ws-manager';
import { getStockQuotes, isExtendedHoursET } from '@/lib/twelvedata/twelvedata-client';
import { rmget, rset } from '@/lib/cache/redis-cache';

export interface SeededQuote {
  price: number;
  change?: number;
  changePercent?: number;
  previousClose: number;
  /** Only populated on a fresh TwelveData fetch (not carried by the Redis seed cache). */
  volume?: number;
}

interface SeedQuote { c: number; d: number; dp: number; pc: number }

const SEED_TTL = 15;
// TwelveData /batch caps at ~120 requests per call. Larger chunks mean fewer
// concurrent outbound requests, which both reduces the odds of any one chunk
// stalling and cuts total credit round-trips.
const SEED_CHUNK = 100;

function seedKey(sym: string) { return `seed:${sym}`; }

// previousClose is constant for the whole ET trading day (it only changes at
// the close), so it's cached separately with a TTL that expires at the next
// ET midnight — lets a cold-start instance pre-seed WsManager's prevClose
// instantly from Redis so the first WS tick computes changePercent correctly.
function pcKey(sym: string) { return `pc:${sym}`; }

function secondsToEtMidnight(): number {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const next = new Date(et);
  next.setHours(24, 0, 0, 0);
  return Math.max(60, Math.round((next.getTime() - et.getTime()) / 1000));
}

/**
 * Resolves initial prices for `symbols`, invoking `onSeed` as soon as each
 * one is available — Redis hits resolve as a single early batch, then each
 * TwelveData chunk fires `onSeed` for its symbols the moment it lands. A slow
 * chunk only delays its own symbols, never the ones that already resolved.
 */
export async function seedPrices(
  symbols: string[],
  onSeed: (symbol: string, quote: SeededQuote) => void
): Promise<void> {
  if (symbols.length === 0) return;

  // Level 1: one batched MGET for every requested symbol's live-price cache.
  const redisCached = await rmget<SeedQuote>(symbols.map(seedKey));

  const stillNeeded: string[] = [];
  for (const sym of symbols) {
    const q = redisCached.get(seedKey(sym));
    if (q && q.c > 0) {
      const prevClose = q.pc > 0 ? q.pc : q.c;
      WsManager.seedPrevClose(sym, prevClose);
      onSeed(sym, {
        price: q.c,
        change: isFinite(q.d) ? q.d : undefined,
        changePercent: isFinite(q.dp) ? q.dp : undefined,
        previousClose: prevClose,
      });
    } else {
      stillNeeded.push(sym);
    }
  }

  if (stillNeeded.length === 0) return;

  // During pre-/post-market, request prepost data so `close` reflects the actual
  // extended-hours price instead of yesterday's regular close.
  const prepost = isExtendedHoursET();

  // Level 1.5: pre-seed prevClose from the day-stable pc: cache (batched too).
  // Doesn't emit a price, but guarantees the next WS tick computes a correct
  // changePercent even before the REST fetch below returns — or if it fails.
  const pcCached = await rmget<number>(stillNeeded.map(pcKey));
  for (const sym of stillNeeded) {
    const pc = pcCached.get(pcKey(sym));
    if (pc && pc > 0) WsManager.seedPrevClose(sym, pc);
  }

  // Level 2: fetch the true remainder from TwelveData in chunks. Each chunk's
  // failure is isolated — one bad chunk won't block or blank the others.
  const chunks: string[][] = [];
  for (let i = 0; i < stillNeeded.length; i += SEED_CHUNK) {
    chunks.push(stillNeeded.slice(i, i + SEED_CHUNK));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const quotes = await getStockQuotes(chunk, { prepost });
        for (const [sym, quote] of quotes.entries()) {
          if (!quote || quote.c <= 0) continue;
          const prevClose = quote.pc > 0 ? quote.pc : quote.c;
          WsManager.seedPrevClose(sym, prevClose);
          onSeed(sym, {
            price: quote.c,
            change: isFinite(quote.d) ? quote.d : undefined,
            changePercent: isFinite(quote.dp) ? quote.dp : undefined,
            previousClose: prevClose,
            volume: quote.volume,
          });
          // Write to Redis so sibling instances/routes skip this fetch for 15s.
          void rset<SeedQuote>(seedKey(sym), { c: quote.c, d: quote.d, dp: quote.dp, pc: prevClose }, SEED_TTL);
          void rset<number>(pcKey(sym), prevClose, secondsToEtMidnight());
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[seed-prices] chunk failed:', err instanceof Error ? err.message : err);
        }
        // Non-fatal — other chunks + WS ticks still deliver prices
      }
    })
  );
}
