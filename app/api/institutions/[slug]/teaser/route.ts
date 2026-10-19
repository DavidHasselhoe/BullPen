/**
 * GET /api/institutions/[slug]/teaser?lang=xx
 *
 * Public: what a free or signed-out visitor sees above the Pro lock on a
 * fund's page. The latest filing's headline sentence and its three largest
 * holdings, nothing else. The diff and the rest of the list stay behind the
 * holdings route's Pro gate. 13F filings are public SEC data; this is a
 * deliberate sample of it, not a leak.
 *
 * The sentence is built here, in the visitor's language, so the diff it is
 * built from never has to leave the server.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { isInstitutionalFundSlug } from '@/lib/institutions/fund-list';
import { buildFundTeaser } from '@/lib/institutions/fund-teaser';
import { isValidLocale } from '@/lib/i18n/language-names';

export type { FundTeaser } from '@/lib/institutions/fund-teaser';

async function handler(request: NextRequest, context?: unknown): Promise<NextResponse> {
  const { slug } = await (context as { params: Promise<{ slug: string }> }).params;
  if (!isInstitutionalFundSlug(slug)) {
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'not_found' }, { status: 404 }));
  }
  const requested = request.nextUrl.searchParams.get('lang') ?? 'en';
  const lang = isValidLocale(requested) ? requested : 'en';

  try {
    const result = await buildFundTeaser(slug, lang);
    if (!result.ok) {
      return addSecurityHeaders(NextResponse.json({ success: false, error: result.error }, { status: result.status }));
    }
    return addSecurityHeaders(
      NextResponse.json(
        { success: true, ...result.teaser },
        { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600' } }
      )
    );
  } catch (err) {
    console.error(`[institutions/${slug}/teaser] failed:`, err);
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'Failed to load' }, { status: 500 }));
  }
}

export const GET = withRateLimit(handler, { windowMs: 60_000, maxRequests: 60 });
