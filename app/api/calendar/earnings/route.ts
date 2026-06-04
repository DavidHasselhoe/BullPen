import { NextRequest, NextResponse } from 'next/server';
import { getEarningsCalendarRange, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { SIGNIFICANT_TICKERS } from '@/lib/market-data/significant-tickers';
import { NASDAQ100_TICKERS } from '@/lib/market-data/nasdaq100';
import { getCached, setCached } from '@/lib/cache/market-data-cache';

const NASDAQ100_SET = new Set(NASDAQ100_TICKERS);
// Earnings dates are announced weeks in advance and almost never change intraday.
const EARNINGS_CACHE_TTL_SECONDS = 24 * 60 * 60;

interface EarningsRow { symbol: string; date: string }
interface EarningsResponse { success: true; data: EarningsRow[] }

async function handler(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const from = searchParams.get('from') ?? new Date().toISOString().slice(0, 10);
  const to = searchParams.get('to') ?? from;
  const country = searchParams.get('country') ?? 'United States';

  // Server-side cache — earnings windows don't change intraday. 4h TTL.
  const cacheKey = `earnings-calendar:${country}:${from}:${to}`;
  const cached = await getCached<EarningsResponse>(cacheKey);
  if (cached) {
    return addSecurityHeaders(
      NextResponse.json(cached, {
        headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600' },
      })
    );
  }

  try {
    const raw = await getEarningsCalendarRange(from, to, country);
    const data = raw
      .filter((item) => SIGNIFICANT_TICKERS.has(item.symbol))
      // Nasdaq 100 companies first (across the whole week), then S&P 500 only —
      // within each tier sort by date then alphabetically.
      // This ensures GOOGL/MSFT/META always surface before smaller S&P 500 names.
      .sort((a, b) => {
        const aTier = NASDAQ100_SET.has(a.symbol) ? 0 : 1;
        const bTier = NASDAQ100_SET.has(b.symbol) ? 0 : 1;
        if (aTier !== bTier) return aTier - bTier;
        const dateCmp = a.date.localeCompare(b.date);
        if (dateCmp !== 0) return dateCmp;
        return a.symbol.localeCompare(b.symbol);
      });

    const body: EarningsResponse = { success: true, data };
    void setCached(cacheKey, '_market', 'earnings_calendar', body, EARNINGS_CACHE_TTL_SECONDS);

    return addSecurityHeaders(
      NextResponse.json(body, {
        headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600' },
      })
    );
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 }));
    }
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return addSecurityHeaders(NextResponse.json({ success: false, error: msg }, { status: 500 }));
  }
}

// Auth-gated to keep anonymous scrapers off the 50-credit endpoint. Rate limit
// stays loose (60/min) since cache hits are virtually free.
export const GET = withAuth(handler, { rateLimit: { windowMs: 60_000, maxRequests: 60 } });
