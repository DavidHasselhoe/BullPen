import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { getStatistics, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { getCachedWithMeta, setCached } from '@/lib/cache/market-data-cache';
import { coalesce } from '@/lib/cache/request-coalesce';

const STATS_TTL_SECONDS = 24 * 60 * 60;

async function handler(
  _request: NextRequest,
  context: { params: Promise<{ ticker: string }> }
): Promise<NextResponse> {
  const { ticker } = await context.params;
  const symbol = ticker.toUpperCase();
  const cacheKey = `stats:${symbol}`;

  try {
    const cached = await getCachedWithMeta<Awaited<ReturnType<typeof getStatistics>>>(cacheKey);
    if (cached) {
      return addSecurityHeaders(NextResponse.json({ success: true, stats: cached.payload, fetchedAt: cached.fetchedAt }));
    }

    // Snapshot route seeds snap-stats:<sym> — reuse it to avoid a duplicate 50-credit fetch
    // when /snapshot and /statistics fire simultaneously on a cold stock page visit.
    const snapCached = await getCachedWithMeta<Awaited<ReturnType<typeof getStatistics>>>(`snap-stats:${symbol}`);
    if (snapCached) {
      void setCached(cacheKey, symbol, 'statistics', snapCached.payload, STATS_TTL_SECONDS);
      return addSecurityHeaders(NextResponse.json({ success: true, stats: snapCached.payload, fetchedAt: snapCached.fetchedAt }));
    }

    const fetchedAt = new Date().toISOString();
    const stats = await coalesce(cacheKey, () => getStatistics(symbol));
    await setCached(cacheKey, symbol, 'statistics', stats, STATS_TTL_SECONDS);
    return addSecurityHeaders(NextResponse.json({ success: true, stats, fetchedAt }));
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

export const GET = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 60 });
