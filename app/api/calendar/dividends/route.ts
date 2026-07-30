import { NextRequest, NextResponse } from 'next/server';
import { getDividendsCalendar, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { getCached, setCached } from '@/lib/cache/market-data-cache';
import { SIGNIFICANT_TICKERS } from '@/lib/market-data/significant-tickers';
import { attachMarketCap } from '@/lib/market-data/calendar-market-cap';

// Ex-dividend dates are published weeks ahead and don't change intraday.
const CACHE_TTL_SECONDS = 24 * 60 * 60;

async function handler(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const from = searchParams.get('from') ?? new Date().toISOString().slice(0, 10);
  const to = searchParams.get('to') ?? from;

  const cacheKey = `calendar:dividends:${from}:${to}`;
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
    const raw = await getDividendsCalendar(from, to);
    const data = await attachMarketCap(raw.filter((item) => SIGNIFICANT_TICKERS.has(item.symbol)));
    void setCached(cacheKey, '_market', 'dividends_calendar', data, CACHE_TTL_SECONDS);
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
