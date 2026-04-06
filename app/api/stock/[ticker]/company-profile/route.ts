import { NextRequest, NextResponse } from 'next/server';
import { getCompanyProfile, getKeyExecutives, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';

export const dynamic = 'force-dynamic';

async function handler(
  _request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await params;
  const sym = ticker.toUpperCase();

  try {
    // Fetch profile and executives in parallel — both are low-credit endpoints
    const [profile, executives] = await Promise.all([
      getCompanyProfile(sym),
      getKeyExecutives(sym).catch(() => []), // executives may 404 for some tickers
    ]);

    return addSecurityHeaders(
      NextResponse.json(
        { success: true, symbol: sym, profile, executives },
        { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600' } },
      ),
    );
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 }),
      );
    }
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: msg }, { status: 500 }),
    );
  }
}

// profile data is static — 10 req/min is plenty
export const GET = withRateLimit(handler, { windowMs: 60_000, maxRequests: 30 });
