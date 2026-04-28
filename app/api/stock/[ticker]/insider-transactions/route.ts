import { NextRequest, NextResponse } from 'next/server';
import { getInsiderTransactions, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { getCached, setCached } from '@/lib/cache/market-data-cache';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';

const INSIDER_TTL_SECONDS = 24 * 60 * 60;

async function handler(
  _request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const symbol = ticker.toUpperCase();
  const cacheKey = `insider:${symbol}`;

  try {
    const cached = await getCached<Awaited<ReturnType<typeof getInsiderTransactions>>>(cacheKey);
    if (cached) {
      return addSecurityHeaders(
        NextResponse.json(
          { success: true, data: cached },
          { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600' } }
        )
      );
    }

    const transactions = await getInsiderTransactions(symbol);
    await setCached(cacheKey, symbol, 'insider_transactions', transactions, INSIDER_TTL_SECONDS);
    return addSecurityHeaders(
      NextResponse.json(
        { success: true, data: transactions },
        { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600' } }
      )
    );
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 })
      );
    }
    const msg = err instanceof Error ? err.message : 'Unknown error';
    // Gracefully return empty data for plan restriction errors
    if (/plan|enterprise|forbidden|403/i.test(msg)) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'plan_restricted' }, { status: 200 })
      );
    }
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: msg }, { status: 500 })
    );
  }
}

export const GET = withRateLimit(handler, { windowMs: 60_000, maxRequests: 30 });
