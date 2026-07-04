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

export const maxDuration = 30;

const MAX_SYMBOLS = 300; // hard safety bound on a single request
const BATCH_CHUNK = 100; // TwelveData /batch-safe size (matches SEED_CHUNK)

async function handler(request: NextRequest) {
  try {
    const body = await request.json();
    const symbols = body?.symbols;

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

    const quotes: Record<string, { price: number; change: number; changePercent: number }> = {};

    const prepost = body?.prepost === true;

    const useTwelveData = !!process.env.TWELVE_DATA_API_KEY;
    if (useTwelveData) {
      // Chunk into /batch-sized groups and fire them in parallel, so a 40-stock
      // portfolio isn't cut to 20.
      const chunks: string[][] = [];
      for (let i = 0; i < capped.length; i += BATCH_CHUNK) {
        chunks.push(capped.slice(i, i + BATCH_CHUNK));
      }
      const maps = await Promise.all(chunks.map((c) => getStockQuotes(c, { prepost })));
      for (const quoteMap of maps) {
        for (const [symbol, q] of quoteMap.entries()) {
          if (q.c > 0) {
            quotes[symbol] = { price: q.c, change: q.d, changePercent: q.dp };
          }
        }
      }
    } else {
      // Finnhub: parallel individual calls
      await Promise.all(
        capped.map(async (symbol) => {
          try {
            const q = await getStockQuote(symbol);
            if (q.c > 0) {
              quotes[symbol] = { price: q.c, change: q.d, changePercent: q.dp };
            }
          } catch (err) {
            logger.warn(`[quotes-batch] Failed for ${symbol}`, { error: err });
          }
        })
      );
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
