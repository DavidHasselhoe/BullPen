import { NextRequest, NextResponse } from 'next/server';
import { getStockQuote, TwelveDataRateLimitError } from '@/lib/market-data';
import { logger } from '@/lib/utils/logger';
import { slugToSymbol } from '@/lib/assets/asset-type';
import { humanizeError } from '@/lib/errors/humanize';
import { withRateLimit } from '@/lib/security/api-security';

async function handler(
  request: NextRequest,
  context: { params: Promise<{ ticker: string }> }
) {
  try {
    const params = await context.params;
    const ticker = slugToSymbol(params.ticker ?? '').toUpperCase();

    if (!ticker) {
      return NextResponse.json(
        { success: false, error: 'Ticker parameter required' },
        { status: 400 }
      );
    }

    const quote = await getStockQuote(ticker);

    return NextResponse.json({
      success: true,
      quote,
    });
  } catch (error) {
    if (error instanceof TwelveDataRateLimitError) {
      return NextResponse.json(
        { success: false, error: humanizeError(error), code: 'rate_limited' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }
    logger.error('Error fetching stock quote', error);
    return NextResponse.json(
      { success: false, error: humanizeError(error) },
      { status: 500 }
    );
  }
}

// No caching in getStockQuote itself — every call is a real TwelveData request.
// Matches candles/route.ts's live-polling limit.
export const GET = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 120 });