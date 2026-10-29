/**
 * GET /api/market/mood
 *
 * Returns the composite Fear & Greed score from lib/market/mood.ts.
 *
 * CDN-cached for 15 minutes — no auth required.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { computeMarketMood } from '@/lib/market/mood';

export type { MoodSignal, MarketMoodData } from '@/lib/market/mood';

async function handler(_request: NextRequest): Promise<NextResponse> {
  const data = await computeMarketMood();
  if (!data) {
    return NextResponse.json({ error: 'Failed to fetch market data' }, { status: 503 });
  }

  return addSecurityHeaders(
    NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=300',
      },
    })
  );
}

export const GET = withRateLimit(handler, { windowMs: 60_000, maxRequests: 20 });
