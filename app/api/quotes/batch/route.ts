/**
 * Batch quotes API — fetches many symbols via TwelveData /batch POSTs, chunked
 * into groups of BATCH_CHUNK (100) and run in parallel. Large portfolios and
 * watchlists get every quote instead of being silently truncated to 20.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStockQuotes, TwelveDataRateLimitError } from '@/lib/market-data';
import { getStockQuote } from '@/lib/market-data';
import { logger } from '@/lib/utils/logger';
import { withRateLimit } from '@/lib/security/api-security';
import { validateTicker } from '@/lib/security/input-validation';
import { humanizeError } from '@/lib/errors/humanize';
import { getLastPrices, cacheLastPrice } from '@/lib/market-data/last-price-cache';

export const maxDuration = 30;

const MAX_SYMBOLS = 300; // hard safety bound on a single request
const BATCH_CHUNK = 100; // TwelveData /batch-safe size (matches SEED_CHUNK)

interface BatchQuote {
  price: number;
  change: number;
  changePercent: number;
  /** True when this came from the last-known-price cache, not a fresh quote
   *  this request — surface it dimmed as "last close" rather than live. */
  stale?: boolean;
}

/** Derive absolute $ change from a cached price + %change (exact, not an
 *  approximation: previousClose = price / (1 + pct/100)). */
function deriveChange(price: number, changePercent: number | null): number {
  if (changePercent == null) return 0;
  const previousClose = price / (1 + changePercent / 100);
  return price - previousClose;
}

/** ISO 10383 mic_codes are short uppercase-letter codes (e.g. XNGS, XSTU) —
 *  validated defensively since this becomes part of a TwelveData URL query
 *  string, even though it's meant to originate from our own DB, not
 *  arbitrary user input. */
const MIC_CODE_RE = /^[A-Z0-9]{2,10}$/;

async function handler(request: NextRequest) {
  try {
    const body = await request.json();
    const symbols = body?.symbols;
    const rawMicCodes = body?.micCodes;

    if (!Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json(
        { success: true, quotes: {} },
        { headers: { 'Cache-Control': 'private, max-age=60' } }
      );
    }

    // Validate and deduplicate (max 20)
    const unique: string[] = [];
    for (const s of [...new Set(symbols)]) {
      if (typeof s !== 'string' || !s.trim()) continue;
      const { valid, normalized } = validateTicker(s.trim());
      if (valid && normalized) unique.push(normalized);
    }
    const capped = unique.slice(0, MAX_SYMBOLS);

    // Optional per-symbol mic_code — a holding pinned to a specific listing
    // (see UserHolding.mic_code) needs it threaded through to avoid a bare
    // symbol resolving to an unrelated instrument. Keyed and validated
    // against the already-validated `capped` list, never trusted raw.
    const micCodes: Record<string, string> | undefined = (() => {
      if (!rawMicCodes || typeof rawMicCodes !== 'object') return undefined;
      const out: Record<string, string> = {};
      for (const sym of capped) {
        const mic = (rawMicCodes as Record<string, unknown>)[sym];
        if (typeof mic === 'string' && MIC_CODE_RE.test(mic)) out[sym] = mic;
      }
      return Object.keys(out).length > 0 ? out : undefined;
    })();
    const micPinnedSymbols = new Set(Object.keys(micCodes ?? {}));

    const quotes: Record<string, BatchQuote> = {};

    const prepost = body?.prepost === true;

    const useTwelveData = !!process.env.TWELVE_DATA_API_KEY;
    if (useTwelveData) {
      // Chunk into /batch-sized groups and fire them in parallel. Each chunk is
      // isolated in its own try/catch — previously a single chunk throwing (rate
      // limit, transient network error) rejected the whole Promise.all and wiped
      // every symbol from the response, even ones from chunks that had already
      // succeeded. A 40-stock portfolio is one chunk, so that one failure meant
      // the entire holdings/watchlist table went blank for that fetch cycle.
      const chunks: string[][] = [];
      for (let i = 0; i < capped.length; i += BATCH_CHUNK) {
        chunks.push(capped.slice(i, i + BATCH_CHUNK));
      }
      await Promise.all(chunks.map(async (chunk) => {
        try {
          const quoteMap = await getStockQuotes(chunk, { prepost, micCodes });
          for (const [symbol, q] of quoteMap.entries()) {
            if (q.c > 0) {
              quotes[symbol] = { price: q.c, change: q.d, changePercent: q.dp };
              // Never write a mic_code-pinned quote into the shared,
              // bare-symbol-keyed last-price cache — a different feature
              // fetching the same bare symbol without a mic_code could read
              // back a price for the wrong listing (e.g. "KOZ1" without
              // disambiguation is a different instrument than the
              // XSTU-listed Kongsberg Gruppen this holding was pinned to).
              if (!micPinnedSymbols.has(symbol)) {
                cacheLastPrice(symbol, { price: q.c, changePercent: isFinite(q.dp) ? q.dp : null });
              }
            }
          }
        } catch (err) {
          if (!(err instanceof TwelveDataRateLimitError)) {
            logger.warn('[quotes-batch] chunk failed', { error: err });
          }
        }
      }));
    } else {
      // Finnhub: parallel individual calls
      await Promise.all(
        capped.map(async (symbol) => {
          try {
            const q = await getStockQuote(symbol);
            if (q.c > 0) {
              quotes[symbol] = { price: q.c, change: q.d, changePercent: q.dp };
              cacheLastPrice(symbol, { price: q.c, changePercent: isFinite(q.dp) ? q.dp : null });
            }
          } catch (err) {
            logger.warn(`[quotes-batch] Failed for ${symbol}`, { error: err });
          }
        })
      );
    }

    // Last-known-price fallback (shared with the Screener) for any requested
    // symbol a fresh quote didn't cover — a chunk failure above, a rate limit,
    // or a market-closed gap. Marked `stale` so the client can render it as
    // "last close" rather than live, same treatment as the Screener's columns.
    // Skipped for mic_code-pinned symbols: this cache has no mic_code
    // dimension, so a hit could be a stale price for an unrelated listing —
    // showing nothing is safer than showing a wrong company's price.
    const stillMissing = capped.filter((s) => !quotes[s] && !micPinnedSymbols.has(s));
    if (stillMissing.length > 0) {
      const fallback = await getLastPrices(stillMissing);
      for (const symbol of stillMissing) {
        const seed = fallback.get(symbol.toUpperCase());
        if (!seed) continue;
        quotes[symbol] = {
          price: seed.price,
          change: deriveChange(seed.price, seed.changePercent),
          changePercent: seed.changePercent ?? 0,
          stale: true,
        };
      }
    }

    return NextResponse.json(
      { success: true, quotes },
      { headers: { 'Cache-Control': 'private, max-age=60' } }
    );
  } catch (error) {
    if (error instanceof TwelveDataRateLimitError) {
      return NextResponse.json(
        { success: false, error: humanizeError(error), code: 'rate_limited' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }
    logger.error('[quotes-batch] Error', error);
    return NextResponse.json(
      { success: false, error: humanizeError(error) },
      { status: 500 }
    );
  }
}

export const POST = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 60 });
