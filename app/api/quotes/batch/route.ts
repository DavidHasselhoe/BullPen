/**
 * Batch quotes API — fetches multiple symbols in a single TwelveData /batch POST.
 * One round-trip regardless of how many symbols are requested (up to 20).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStockQuotes, TwelveDataRateLimitError } from '@/lib/market-data';
import { getStockQuote } from '@/lib/market-data';
import { logger } from '@/lib/utils/logger';
import { withRateLimit } from '@/lib/security/api-security';
import { validateTicker } from '@/lib/security/input-validation';

export const maxDuration = 30;

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
    const capped = unique.slice(0, 20);

    const quotes: Record<string, { price: number; change: number; changePercent: number }> = {};

    const useTwelveData = !!process.env.TWELVE_DATA_API_KEY;
    if (useTwelveData) {
      // Single batch POST — no throttling needed
      const quoteMap = await getStockQuotes(capped);
      for (const [symbol, q] of quoteMap.entries()) {
        if (q.c > 0) {
          quotes[symbol] = { price: q.c, change: q.d, changePercent: q.dp };
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
        { success: false, error: error.message },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }
    logger.error('[quotes-batch] Error', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export const POST = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 60 });
