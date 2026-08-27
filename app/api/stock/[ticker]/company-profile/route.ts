import { NextRequest, NextResponse } from 'next/server';
import { getCompanyProfile, getKeyExecutives, withRateLimitRetry, TwelveDataRateLimitError, TwelveDataInvalidSymbolError } from '@/lib/twelvedata/twelvedata-client';
import { getCached, setCached } from '@/lib/cache/market-data-cache';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { translateText } from '@/lib/i18n/translate';

export const dynamic = 'force-dynamic';
const PROFILE_TTL_SECONDS = 7 * 24 * 60 * 60;

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await params;
  const sym = ticker.toUpperCase();
  const lang = (request.nextUrl.searchParams.get('lang') ?? 'en').toLowerCase();
  const cacheKey = `profile:${sym}`;

  try {
    const cached = await getCached<{
      profile: Awaited<ReturnType<typeof getCompanyProfile>>;
      executives: Awaited<ReturnType<typeof getKeyExecutives>>;
    }>(cacheKey);
    if (cached) {
      const profile = { ...cached.profile };
      if (profile.description) {
        profile.description = await translateText(profile.description, lang);
      }
      return addSecurityHeaders(
        NextResponse.json(
          { success: true, symbol: sym, profile, executives: cached.executives },
          { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600' } },
        ),
      );
    }

    // Fetch profile and executives in parallel. getCompanyProfile is retry-wrapped because
    // a transient network blip here (common intermittently on Vercel's outbound TwelveData
    // calls — see withRateLimitRetry) would otherwise surface as "no profile", which the
    // stock page treats as a signal the ticker doesn't exist for symbols with no Supabase
    // companies row.
    // /key_executives may be Ultra/Enterprise only on some plan configs — always degrade gracefully.
    const [profile, executives] = await Promise.all([
      withRateLimitRetry(() => getCompanyProfile(sym)),
      getKeyExecutives(sym).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (/plan|enterprise|higher tier|not available|access/i.test(msg)) return [];
        return [];
      }),
    ]);

    await setCached(cacheKey, sym, 'company_profile', { profile, executives }, PROFILE_TTL_SECONDS);

    const translatedProfile = { ...profile };
    if (translatedProfile.description) {
      translatedProfile.description = await translateText(translatedProfile.description, lang);
    }

    return addSecurityHeaders(
      NextResponse.json(
        { success: true, symbol: sym, profile: translatedProfile, executives },
        { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600' } },
      ),
    );
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 }),
      );
    }
    // Positively confirmed by TwelveData ("symbol ... invalid"), not merely a
    // failed fetch — the only case the stock page should treat as evidence
    // this ticker doesn't exist. See TwelveDataInvalidSymbolError's doc comment.
    if (err instanceof TwelveDataInvalidSymbolError) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'invalid_symbol', invalidSymbol: true }),
      );
    }
    const msg = err instanceof Error ? err.message : 'Unknown error';
    // Previously silent — a genuine failure here (post-retry network error, plan
    // restriction, unexpected TwelveData response shape) left no trace in Vercel
    // logs, which is exactly what made the 2026-08-27 $SNOW false-positive 404
    // impossible to confirm from logs alone. Logged now so the next one is traceable.
    console.error(`[company-profile] ${sym} failed:`, msg);
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: msg }, { status: 500 }),
    );
  }
}

// profile data is static — 10 req/min is plenty
export const GET = withRateLimit(handler, { windowMs: 60_000, maxRequests: 30 });
