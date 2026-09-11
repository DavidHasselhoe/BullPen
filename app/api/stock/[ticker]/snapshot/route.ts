/**
 * GET /api/stock/[ticker]/snapshot
 *
 * Thin wrapper over buildSnapshot() in lib/stock/snapshot.ts, which is also
 * called directly while server-rendering a stock page — that is what lets the
 * price arrive in the HTML instead of one request after hydration.
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildSnapshot } from '@/lib/stock/snapshot';
import { TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';

async function handler(
  _req: NextRequest,
  context: { params: Promise<{ ticker: string }> }
): Promise<NextResponse> {
  const { ticker } = await context.params;
  try {
    const snapshot = await buildSnapshot(ticker);
    return addSecurityHeaders(
      NextResponse.json(snapshot, { headers: { 'Cache-Control': 'private, max-age=60' } })
    );
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'Rate limit exceeded' }, { status: 429 })
      );
    }
    console.error(`[snapshot] Error for ${ticker}:`, err);
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to fetch snapshot' }, { status: 500 })
    );
  }
}

export const GET = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 120 });
