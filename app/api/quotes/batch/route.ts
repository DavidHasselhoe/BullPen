/**
 * Batch quotes API - fetches multiple symbols in a single request.
 * When Twelve Data is used: throttles to 8 requests/min (Basic tier) by spacing calls 8s apart.
 * When Finnhub is used: fetches in parallel (higher limit).
 * Rate limited and validated to prevent Twelve Data/Finnhub abuse.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStockQuote, TwelveDataRateLimitError } from '@/lib/market-data';
import { logger } from '@/lib/utils/logger';
import { withRateLimit } from '@/lib/security/api-security';
import { validateTicker } from '@/lib/security/input-validation';

const MIN_INTERVAL_MS = 8000; // 8 seconds between calls = 7.5/min, under Twelve Data Basic 8/min

// Allow up to 2 minutes when throttling (many symbols = long wait)
export const maxDuration = 120;

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

    // Validate and filter symbols (max 20 to limit API usage)
    const unique: string[] = [];
    for (const s of [...new Set(symbols)]) {
      if (typeof s !== 'string' || !s.trim()) continue;
      const { valid, normalized } = validateTicker(s.trim());
      if (valid && normalized) unique.push(normalized);
    }
    const capped = unique.slice(0, 20);

    const useTwelveData = !!process.env.TWELVE_DATA_API_KEY;
    const quotes: Record<string, { price: number; change: number; changePercent: number }> = {};

    if (useTwelveData) {
      // Throttle for Twelve Data Basic (8/min)
      for (let i = 0; i < capped.length; i++) {
        try {
          const q = await getStockQuote(capped[i]);
          if (q.c > 0) {
            quotes[capped[i]] = { price: q.c, change: q.d, changePercent: q.dp };
          }
        } catch (err) {
          if (err instanceof TwelveDataRateLimitError) throw err;
          logger.warn(`[quotes-batch] Failed for ${capped[i]}`, { error: err });
        }
        if (i < capped.length - 1) {
          await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS));
        }
      }
    } else {
      // Finnhub: fetch in parallel (60/min limit)
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

/** Rate limited: 10 requests/min to protect Twelve Data/Finnhub quota */
export const POST = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 10 });
