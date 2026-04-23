import { NextRequest, NextResponse } from 'next/server';
import { getEarningsCalendarRange, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { SIGNIFICANT_TICKERS } from '@/lib/market-data/significant-tickers';
import { NASDAQ100_TICKERS } from '@/lib/market-data/nasdaq100';

const NASDAQ100_SET = new Set(NASDAQ100_TICKERS);

async function handler(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const from = searchParams.get('from') ?? new Date().toISOString().slice(0, 10);
  const to = searchParams.get('to') ?? from;
  const country = searchParams.get('country') ?? 'United States';

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
    return addSecurityHeaders(
      NextResponse.json(
        { success: true, data },
        { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600' } }
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
