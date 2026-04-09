import { NextRequest, NextResponse } from 'next/server';
import { getLogoUrl } from '@/lib/twelvedata/twelvedata-client';
import { addSecurityHeaders } from '@/lib/security/api-security';

/**
 * GET /api/logo/[ticker]
 *
 * Returns the logo URL for a ticker by calling TwelveData /logo.
 * Response is cached for 24 hours server-side.
 */
export async function GET(
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
  } catch {
    return addSecurityHeaders(
      NextResponse.json({ success: false, logoUrl: null, error: 'Failed to fetch logo' }, { status: 500 })
    );
  }
}
