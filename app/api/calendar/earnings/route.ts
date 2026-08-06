import { NextRequest, NextResponse } from 'next/server';
import { getEarningsCalendarRange, TwelveDataRateLimitError, type EarningsCalendarItem } from '@/lib/twelvedata/twelvedata-client';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { getActiveUniverse } from '@/lib/market-data/screener-universe';
import { NASDAQ100_TICKERS } from '@/lib/market-data/nasdaq100';
import { getCached, setCached } from '@/lib/cache/market-data-cache';
import { attachMarketCap } from '@/lib/market-data/calendar-market-cap';

const NASDAQ100_SET = new Set(NASDAQ100_TICKERS);
// Earnings dates are announced weeks in advance and almost never change intraday.
const EARNINGS_CACHE_TTL_SECONDS = 24 * 60 * 60;

type EarningsRow = EarningsCalendarItem & { market_cap: number | null };
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
    const [raw, activeUniverse] = await Promise.all([
      getEarningsCalendarRange(from, to, country),
      getActiveUniverse(),
    ]);
    const activeSet = new Set(activeUniverse);
    const sorted = raw
      // Active screener universe (~1200 tickers, S&P 1500-ish breadth) rather
      // than the old fixed ~530-name SIGNIFICANT_TICKERS set. Confirmed earnings
      // dates only land in TwelveData's calendar 3-6 weeks ahead of the report,
      // so outside peak season almost none of a small fixed megacap list has a
      // date yet — the calendar read as broken/empty for weeks at a time even
      // though TwelveData already had real upcoming dates for companies just
      // outside that list. Widening the filter (a pure client-side change, no
      // extra TwelveData credits — /earnings_calendar is a flat-cost date-range
      // call regardless of how many symbols we keep) surfaces those.
      .filter((item) => activeSet.has(item.symbol))
      // Nasdaq 100 companies first (across the whole week), then everything
      // else in the active universe — within each tier sort by date then
      // alphabetically. This ensures GOOGL/MSFT/META always surface before
      // smaller names.
      .sort((a, b) => {
        const aTier = NASDAQ100_SET.has(a.symbol) ? 0 : 1;
        const bTier = NASDAQ100_SET.has(b.symbol) ? 0 : 1;
        if (aTier !== bTier) return aTier - bTier;
        const dateCmp = a.date.localeCompare(b.date);
        if (dateCmp !== 0) return dateCmp;
        return a.symbol.localeCompare(b.symbol);
      });
    const data = await attachMarketCap(sorted);

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
export const GET = withRateLimit(handler, { windowMs: 60_000, maxRequests: 60 });
