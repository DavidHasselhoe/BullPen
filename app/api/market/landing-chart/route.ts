/**
 * Landing-page hero chart — real NVDA 1D intraday candles, shared by ALL
 * visitors via the same Redis/CDN caching pattern as landing-quotes. Fixed
 * symbol, no user input, so this is safe to cache and serve unauthenticated
 * (the per-user candles route requires a session and would 401 here).
 */

import { NextResponse } from 'next/server';
import { getStockCandles, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { rget, rset, candleTtlSeconds } from '@/lib/cache/redis-cache';
import { logger } from '@/lib/utils/logger';

const SYMBOL = 'NVDA';
// Downsample to a fixed point count so the response stays tiny and the SVG
// path (400x170) never has to draw hundreds of 1-min bars.
const TARGET_POINTS = 48;

type ChartPayload = { points: number[]; asOfSec: number };

function etDateDaysAgo(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function sampleEvenly(values: number[], n: number): number[] {
  if (values.length <= n) return values;
  const step = (values.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => values[Math.round(i * step)]);
}

export async function GET() {
  const todayDateET = etDateDaysAgo(0);
  const cacheKey = `landing:hero-chart:v1:${todayDateET}`;

  try {
    const cached = await rget<ChartPayload>(cacheKey);
    if (cached) {
      return NextResponse.json({ success: true, ...cached }, {
        headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=60' },
      });
    }

    // Walk backward a few calendar days in case today has no candles yet
    // (before pre-market open, or a weekend/holiday) — same fallback the
    // authenticated candles route uses for 1D.
    for (let daysBack = 0; daysBack < 6; daysBack++) {
      const dateET = daysBack === 0 ? todayDateET : etDateDaysAgo(daysBack);
      try {
        const candles = await getStockCandles(
          SYMBOL,
          0,
          0,
          '1',
          { extendedHours: true, startDate: `${dateET} 04:00:00`, endDate: `${dateET} 23:59:00` }
        );
        if (candles.s === 'no_data' || candles.t.length === 0) continue;

        const points = sampleEvenly(candles.c, TARGET_POINTS);
        const payload: ChartPayload = { points, asOfSec: candles.t[candles.t.length - 1] };
        void rset(cacheKey, payload, candleTtlSeconds());

        return NextResponse.json({ success: true, ...payload }, {
          headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=60' },
        });
      } catch (attemptErr) {
        if (attemptErr instanceof TwelveDataRateLimitError) throw attemptErr;
        // Otherwise treat like no_data for this date and try the previous day.
      }
    }

    return NextResponse.json({ success: false, points: [], asOfSec: 0 });
  } catch (error) {
    if (error instanceof TwelveDataRateLimitError) {
      return NextResponse.json({ success: false, points: [], asOfSec: 0 });
    }
    logger.error('[landing-chart] Error', error);
    return NextResponse.json({ success: false, points: [], asOfSec: 0 }, { status: 500 });
  }
}
