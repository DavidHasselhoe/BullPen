import { NextRequest, NextResponse } from 'next/server';
import { getIPOCalendar, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { getCached, setCached } from '@/lib/cache/market-data-cache';
import { attachMarketCap } from '@/lib/market-data/calendar-market-cap';

// IPO dates are confirmed weeks ahead; same-day changes are rare enough to accept 24h staleness.
const CACHE_TTL_SECONDS = 24 * 60 * 60;

async function handler(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const from = searchParams.get('from') ?? new Date().toISOString().slice(0, 10);
  const to = searchParams.get('to') ?? from;

  const cacheKey = `calendar:ipo:${from}:${to}`;
  const cached = await getCached<unknown>(cacheKey);
  if (cached) {
    return addSecurityHeaders(
      NextResponse.json(
        { success: true, data: cached },
        { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600' } }
      )
    );
  }

  try {
    const raw = await getIPOCalendar(from, to);
    const data = await attachMarketCap(raw);
    void setCached(cacheKey, '_market', 'ipo_calendar', data, CACHE_TTL_SECONDS);
    return addSecurityHeaders(
      NextResponse.json(
        { success: true, data },
        { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600' } }
      )
    );
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 }));
    }
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return addSecurityHeaders(NextResponse.json({ success: false, error: msg }, { status: 500 }));
  }
}

export const GET = withRateLimit(handler, { windowMs: 60_000, maxRequests: 20 });
