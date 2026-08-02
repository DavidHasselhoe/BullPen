import { NextRequest, NextResponse } from 'next/server';
import { getLogoUrl, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { addSecurityHeaders } from '@/lib/security/api-security';

/**
 * GET /api/stock/[ticker]/logo
 *
 * Returns the logo URL for a stock ticker via TwelveData /logo.
 * Accepts both GET and POST for backward compat.
 */
async function handler(
  _request: NextRequest,
  context: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await context.params;
  if (!ticker) {
    return NextResponse.json({ success: false, error: 'Missing ticker' }, { status: 400 });
  }

  const sym = ticker.trim().toUpperCase();

  try {
    const logoUrl = await getLogoUrl(sym);

    if (!logoUrl) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, logoUrl: null, error: 'Logo not found' }, { status: 404 })
      );
    }

    return addSecurityHeaders(
      NextResponse.json(
        { success: true, logoUrl },
        { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600' } }
      )
    );
  } catch (error) {
    if (error instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(
        NextResponse.json(
          { success: false, logoUrl: null, error: 'Rate limit exceeded' },
          { status: 429, headers: { 'Retry-After': '60' } }
        )
      );
    }
    return addSecurityHeaders(
      NextResponse.json({ success: false, logoUrl: null, error: 'Failed to fetch logo' }, { status: 500 })
    );
  }
}

export const GET = handler;
export const POST = handler;
