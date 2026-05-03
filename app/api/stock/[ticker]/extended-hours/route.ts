import { NextRequest, NextResponse } from 'next/server';
import { getExtendedHoursQuote, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { slugToSymbol, inferAssetType, has24hTrading } from '@/lib/assets/asset-type';

async function handler(
  _request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const symbol = slugToSymbol(ticker).toUpperCase();

  // Crypto trades 24/7 — no "extended hours" concept
  if (has24hTrading(inferAssetType(symbol))) {
    return addSecurityHeaders(
      NextResponse.json(
        { success: true, data: null, reason: 'not_applicable' },
        { headers: { 'Cache-Control': 'public, s-maxage=3600' } }
      )
    );
  }

  try {
    const data = await getExtendedHoursQuote(symbol);
    if (!data) {
      return addSecurityHeaders(
        NextResponse.json(
          { success: true, data: null, reason: 'no_extended_data' },
          { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' } }
        )
      );
    }
    return addSecurityHeaders(
      NextResponse.json(
        { success: true, data },
        { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' } }
      )
    );
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 })
      );
    }
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: msg }, { status: 500 })
    );
  }
}

export const GET = withRateLimit(handler, { windowMs: 60_000, maxRequests: 60 });
