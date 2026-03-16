import { NextRequest, NextResponse } from 'next/server';
import { getTopMovers, getTopMoversForSymbols, TwelveDataRateLimitError } from '@/lib/market-data';
import { getStorageLogoUrl } from '@/lib/logos/logos-storage';
import { withRateLimit } from '@/lib/security/api-security';
import { logger } from '@/lib/utils/logger';

async function handler(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '5', 10);
    const symbolsParam = searchParams.get('symbols');
    const symbols = symbolsParam
      ? symbolsParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
      : null;

    const { gainers, losers } = symbols && symbols.length > 0
      ? await getTopMoversForSymbols(symbols, limit)
      : await getTopMovers(limit);

    const enrichWithLogo = (m: { symbol: string }) => ({
      ...m,
      logoUrl: getStorageLogoUrl(m.symbol),
    });

    return NextResponse.json({
      success: true,
      movers: {
        gainers: gainers.map(enrichWithLogo),
        losers: losers.map(enrichWithLogo),
      },
    });
  } catch (error) {
    if (error instanceof TwelveDataRateLimitError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }
    logger.error('Error fetching top movers', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

// 30 req/min (Finnhub free tier is 60/min; this protects against abuse)
export const GET = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 30 });

// When Twelve Data + holdings mode: getStockQuotes throttles, so response can take ~8s per symbol
export const maxDuration = 120;