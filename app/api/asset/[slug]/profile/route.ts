import { NextRequest, NextResponse } from 'next/server';
import { getCompanyProfile, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { slugToSymbol, inferAssetType, COMMODITIES } from '@/lib/assets/asset-type';

async function handler(
  _req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const symbol = slugToSymbol(slug.toUpperCase());
  // Spot commodities have no company profile: the call cost 10 credits to
  // return an error, and the page then titled gold "XAU/USD".
  const commodity = COMMODITIES.find((c) => c.ticker === symbol);

  try {
    if (commodity) throw new Error('no profile for spot commodities');
    const profile = await getCompanyProfile(symbol);
    const assetType = inferAssetType(symbol, profile.type ?? undefined);

    return addSecurityHeaders(
      NextResponse.json(
        {
          success: true,
          symbol,
          slug,
          name: profile.name,
          assetType,
          logoUrl: profile.logo ?? null,
          exchange: profile.exchange ?? null,
          currency: profile.currency ?? null,
          sector: profile.sector ?? null,
          country: profile.country ?? null,
          description: profile.description ?? null,
          type: profile.type ?? null,
        },
        { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600' } }
      )
    );
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 })
      );
    }
    // For unknown assets, fall back to type inference from symbol alone
    const assetType = inferAssetType(symbol);
    return addSecurityHeaders(
      NextResponse.json({
        success: true,
        symbol,
        slug,
        name: commodity?.name ?? symbol,
        assetType,
        logoUrl: null,
        exchange: null,
        currency: null,
        sector: null,
        country: null,
        description: commodity?.about ?? null,
        type: null,
      })
    );
  }
}

export const GET = withRateLimit(handler, { windowMs: 60_000, maxRequests: 60 });
