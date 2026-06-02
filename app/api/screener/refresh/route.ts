/**
 * POST /api/screener/refresh
 *
 * Fetches TwelveData statistics for a batch of symbols and upserts them into
 * the `screener_stats` table. Triggered by the daily refresh cron(s); chains
 * through batches with delays to respect TwelveData's rate limit.
 *
 * Query params:
 *   batch=0  (0-indexed; each batch = 10 symbols = 500 credits)
 *
 * Credits per batch call: 10 × 50 = 500 credits
 * Rate limit: 610/min → max 1 full batch per minute with headroom
 */

import { NextRequest, NextResponse } from 'next/server';
import { TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { SCREENER_UNIVERSE } from '@/lib/market-data/screener-universe';
import { fetchAndUpsertScreenerStats } from '@/lib/market-data/screener-stats';

export const dynamic = 'force-dynamic';

const BATCH_SIZE = 10;

async function handler(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const batchIndex = parseInt(sp.get('batch') ?? '0', 10);

  if (!process.env.TWELVE_DATA_API_KEY) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'TWELVE_DATA_API_KEY not configured' }, { status: 500 })
    );
  }

  const totalBatches = Math.ceil(SCREENER_UNIVERSE.length / BATCH_SIZE);
  const start = batchIndex * BATCH_SIZE;
  const symbols = SCREENER_UNIVERSE.slice(start, start + BATCH_SIZE);

  if (symbols.length === 0) {
    return addSecurityHeaders(
      NextResponse.json({ success: true, done: true, totalBatches })
    );
  }

  try {
    const rows = await fetchAndUpsertScreenerStats(symbols);

    const nextBatch = batchIndex + 1 < totalBatches ? batchIndex + 1 : null;
    return addSecurityHeaders(
      NextResponse.json({
        success: true,
        batch: batchIndex,
        refreshed: rows.length,
        symbols,
        nextBatch,
        totalBatches,
        done: nextBatch === null,
      })
    );
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 })
      );
    }
    return addSecurityHeaders(
      NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
        { status: 500 }
      )
    );
  }
}

// Limit to 5 refresh calls per minute — each costs 500 credits
export const POST = withRateLimit(handler, { windowMs: 60_000, maxRequests: 5 });
