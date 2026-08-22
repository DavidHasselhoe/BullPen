import { NextRequest, NextResponse } from 'next/server';
import { getCompanyEarnings, TwelveDataRateLimitError } from '@/lib/market-data';
import { getCached, getCachedStale, setCached } from '@/lib/cache/market-data-cache';
import { tryReserveOrganicCredits } from '@/lib/twelvedata/credit-budget';

// Matches every other per-symbol endpoint's cache window — earnings history
// (last 8 quarters) doesn't change intraday. Previously this route had no
// caching at all, re-fetching 20 credits on every request for the same
// ticker; StockPricePanel and AdvancedChartModal both request it whenever
// their earnings-markers overlay is on.
const EARNINGS_TTL_SECONDS = 24 * 60 * 60;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ ticker: string }> }
) {
  try {
    const params = await context.params;
    const ticker = params.ticker?.toUpperCase();

    if (!ticker) {
      return NextResponse.json(
        { success: false, error: 'Ticker parameter required' },
        { status: 400 }
      );
    }

    const cacheKey = `earnings-history:${ticker}`;
    const cached = await getCached<Awaited<ReturnType<typeof getCompanyEarnings>>>(cacheKey);
    if (cached) {
      return NextResponse.json({ success: true, earnings: cached });
    }

    // Reserve against the shared per-minute credit budget (see
    // lib/twelvedata/credit-budget.ts) before firing the live 20-credit
    // fetch — a denied reservation falls back to the last known stale
    // value instead of risking the account-wide 610/min cap on a burst of
    // concurrent cold tickers.
    if (!(await tryReserveOrganicCredits(20))) {
      const stale = await getCachedStale<Awaited<ReturnType<typeof getCompanyEarnings>>>(cacheKey);
      if (stale) {
        return NextResponse.json({ success: true, earnings: stale });
      }
      return NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 });
    }

    const earnings = await getCompanyEarnings(ticker, 8);
    if (earnings.length > 0) {
      void setCached(cacheKey, ticker, 'earnings_history', earnings, EARNINGS_TTL_SECONDS);
    }

    return NextResponse.json({
      success: true,
      earnings,
    });
  } catch (error) {
    if (error instanceof TwelveDataRateLimitError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }
    console.error('Error fetching company earnings:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
