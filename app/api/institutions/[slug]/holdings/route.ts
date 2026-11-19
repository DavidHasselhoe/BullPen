/**
 * GET /api/institutions/[slug]/holdings?quarter=YYYY-MM-DD
 * GET /api/institutions/[slug]/holdings?view=free
 *
 * Pro: any quarter, with the quarter-over-quarter diff and share history.
 * Free and signed-out: the latest quarter's full holdings only, no diff, no
 * history (freeLatestView). Asking for an earlier quarter without Pro is
 * pro_required.
 *
 * ?view=free is the signed-out URL: always the free latest view, the same for
 * every reader, so the CDN caches it (Citadel's is several MB and is not
 * server-rendered). It never reads the session, and Pro readers never request
 * it, so a cached copy can't stand in for a Pro response. A signed-out request
 * without it is redirected there. Every other response is private, no-store.
 *
 * The RLS policy on institutional_filings/institutional_holdings (migration
 * 127) stays Pro-only as the backstop for direct PostgREST access; this route
 * reads with the service role and is the gate.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withOptionalAuth, withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { getTier, isPro } from '@/lib/billing/tier';
import { isInstitutionalFundSlug } from '@/lib/institutions/fund-list';
import { freeLatestView, loadFundHoldings } from '@/lib/institutions/load-holdings';

// 13F filings land quarterly. Ingest busts the data cache when a new one
// arrives but can't bust the CDN, so a new filing shows within about an hour.
const PUBLIC_CACHE = 'public, s-maxage=3600, stale-while-revalidate=86400';
const PRIVATE_CACHE = 'private, no-store';

function json(body: unknown, status: number, cache: string): NextResponse {
  return addSecurityHeaders(NextResponse.json(body, { status, headers: { 'Cache-Control': cache } }));
}

async function slugOf(context: unknown): Promise<string> {
  return (await (context as { params: Promise<{ slug: string }> }).params).slug;
}

async function publicHandler(_request: NextRequest, context?: unknown): Promise<NextResponse> {
  const slug = await slugOf(context);
  if (!isInstitutionalFundSlug(slug)) return json({ success: false, error: 'not_found' }, 404, PRIVATE_CACHE);
  try {
    const result = await loadFundHoldings(slug, null);
    if (!result.ok) return json({ success: false, error: result.error }, result.status, PRIVATE_CACHE);
    return json({ success: true, ...freeLatestView(result.data) }, 200, PUBLIC_CACHE);
  } catch (err) {
    console.error(`[institutions/${slug}/holdings] public view failed:`, err);
    return json({ success: false, error: 'Failed to load holdings' }, 500, PRIVATE_CACHE);
  }
}

async function privateHandler(
  request: NextRequest,
  context: unknown,
  session: { userId: string } | null
): Promise<NextResponse> {
  const slug = await slugOf(context);
  if (!isInstitutionalFundSlug(slug)) return json({ success: false, error: 'not_found' }, 404, PRIVATE_CACHE);
  if (!session) {
    const url = new URL(`/api/institutions/${slug}/holdings`, request.nextUrl.origin);
    url.searchParams.set('view', 'free');
    return addSecurityHeaders(NextResponse.redirect(url, 307));
  }

  const pro = isPro(await getTier(session.userId));
  const quarter = request.nextUrl.searchParams.get('quarter');

  try {
    // Free readers always get the latest quarter. A requested quarter is only
    // refused once it is known not to be the latest.
    const result = await loadFundHoldings(slug, pro ? quarter : null);
    if (!result.ok) return json({ success: false, error: result.error }, result.status, PRIVATE_CACHE);
    if (pro) return json({ success: true, ...result.data }, 200, PRIVATE_CACHE);
    if (quarter && quarter !== result.data.filing.periodOfReport) {
      // A quarter the fund never filed is not a Pro upsell.
      return result.data.availableQuarters.includes(quarter)
        ? json({ success: false, error: 'pro_required' }, 403, PRIVATE_CACHE)
        : json({ success: false, error: 'not_found' }, 404, PRIVATE_CACHE);
    }
    return json({ success: true, ...freeLatestView(result.data) }, 200, PRIVATE_CACHE);
  } catch (err) {
    console.error(`[institutions/${slug}/holdings] failed:`, err);
    return json({ success: false, error: 'Failed to load holdings' }, 500, PRIVATE_CACHE);
  }
}

const RATE_LIMIT = { windowMs: 60 * 1000, maxRequests: 30 };
const authedGet = withOptionalAuth(privateHandler, { rateLimit: RATE_LIMIT });
const publicGet = withRateLimit(publicHandler, RATE_LIMIT);

export function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }): Promise<NextResponse> {
  return request.nextUrl.searchParams.get('view') === 'free' ? publicGet(request, context) : authedGet(request, context);
}
