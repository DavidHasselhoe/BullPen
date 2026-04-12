import { NextRequest, NextResponse } from 'next/server';
import { getPressReleases, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { validateLimit } from '@/lib/security/input-validation';

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const symbol = ticker.toUpperCase();
  const limitParam = request.nextUrl.searchParams.get('limit') ?? '10';
  // Twelve Data /press_releases: outputsize max 10
  const outputsize = validateLimit(limitParam, 10, 10);

  try {
    const releases = await getPressReleases(symbol, outputsize);
    return addSecurityHeaders(
      NextResponse.json(
        { success: true, data: releases },
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
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: msg }, { status: 500 })
    );
  }
}

export const GET = withRateLimit(handler, { windowMs: 60_000, maxRequests: 30 });
