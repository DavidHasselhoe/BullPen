import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { getStatistics, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { getCached, setCached } from '@/lib/cache/market-data-cache';

const STATS_TTL_SECONDS = 24 * 60 * 60;

async function handler(
  _request: NextRequest,
  context: { params: Promise<{ ticker: string }> },
  _session: { userId: string }
): Promise<NextResponse> {
  const { ticker } = await context.params;
  const symbol = ticker.toUpperCase();
  const cacheKey = `stats:${symbol}`;

  try {
    const cached = await getCached<Awaited<ReturnType<typeof getStatistics>>>(cacheKey);
    if (cached) {
      return addSecurityHeaders(NextResponse.json({ success: true, stats: cached }));
    }

    const stats = await getStatistics(symbol);
    await setCached(cacheKey, symbol, 'statistics', stats, STATS_TTL_SECONDS);
    return addSecurityHeaders(NextResponse.json({ success: true, stats }));
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'Rate limit exceeded' }, { status: 429 })
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (/enterprise plan|higher plan|not available.*plan/i.test(msg)) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'plan_restricted' }, { status: 403 })
      );
    }
    console.error(`[statistics] Error for ${symbol}:`, err);
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to fetch statistics' }, { status: 500 })
    );
  }
}

export const GET = withRateLimit(withAuth(handler), { windowMs: 60 * 1000, maxRequests: 60 });
