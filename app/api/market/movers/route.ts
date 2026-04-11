import { NextRequest, NextResponse } from 'next/server';
import {
  getMarketMovers,
  getTopMoversForSymbols,
  TwelveDataRateLimitError,
} from '@/lib/twelvedata/twelvedata-client';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { logger } from '@/lib/utils/logger';

async function handler(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '5', 10), 20);
    const symbolsParam = searchParams.get('symbols');
    const symbols = symbolsParam
      ? symbolsParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
      : null;

    // Holdings / custom symbol set → compute from batch quotes
    // All-markets (no symbols) → use real /market_movers/stocks endpoint
    const { gainers, losers } = symbols && symbols.length > 0
      ? await getTopMoversForSymbols(symbols, limit)
      : await getMarketMovers('stocks', limit);

    return addSecurityHeaders(
      NextResponse.json(
        { success: true, movers: { gainers, losers } },
        { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' } }
      )
    );
  } catch (error) {
    if (error instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(
        NextResponse.json(
          { success: false, error: error.message },
          { status: 429, headers: { 'Retry-After': '60' } }
        )
      );
    }
    logger.error('Error fetching top movers', error);
    return addSecurityHeaders(
      NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
        { status: 500 }
      )
    );
  }
}

// 30 req/min — /market_movers uses 100 credits but is cached 5 min server-side
export const GET = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 30 });

export const maxDuration = 120;
