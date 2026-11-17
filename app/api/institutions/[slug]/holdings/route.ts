/**
 * GET /api/institutions/[slug]/holdings?quarter=YYYY-MM-DD
 *
 * Pro: any quarter, with the quarter-over-quarter diff and share history.
 * Free and signed-out: the latest quarter's full holdings only, no diff, no
 * history (freeLatestView). Asking for an earlier quarter without Pro is
 * pro_required.
 *
 * The RLS policy on institutional_filings/institutional_holdings (migration
 * 127) stays Pro-only as the backstop for direct PostgREST access; this route
 * reads with the service role and is the gate.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withOptionalAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { getTier, isPro } from '@/lib/billing/tier';
import { isInstitutionalFundSlug } from '@/lib/institutions/fund-list';
import { freeLatestView, loadFundHoldings } from '@/lib/institutions/load-holdings';

async function handler(
  request: NextRequest,
  context: unknown,
  session: { userId: string } | null
): Promise<NextResponse> {
  const { slug } = await (context as { params: Promise<{ slug: string }> }).params;
  if (!isInstitutionalFundSlug(slug)) {
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'not_found' }, { status: 404 }));
  }

  const pro = session ? isPro(await getTier(session.userId)) : false;
  const quarter = request.nextUrl.searchParams.get('quarter');

  try {
    // Free readers always get the latest quarter. A requested quarter is only
    // refused once it is known not to be the latest.
    const result = await loadFundHoldings(slug, pro ? quarter : null);
    if (!result.ok) {
      return addSecurityHeaders(NextResponse.json({ success: false, error: result.error }, { status: result.status }));
    }
    if (pro) return addSecurityHeaders(NextResponse.json({ success: true, ...result.data }));
    if (quarter && quarter !== result.data.filing.periodOfReport) {
      // A quarter the fund never filed is not a Pro upsell.
      return addSecurityHeaders(result.data.availableQuarters.includes(quarter)
        ? NextResponse.json({ success: false, error: 'pro_required' }, { status: 403 })
        : NextResponse.json({ success: false, error: 'not_found' }, { status: 404 }));
    }
    return addSecurityHeaders(NextResponse.json({ success: true, ...freeLatestView(result.data) }));
  } catch (err) {
    console.error(`[institutions/${slug}/holdings] failed:`, err);
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to load holdings' }, { status: 500 })
    );
  }
}

export const GET = withOptionalAuth(handler, { rateLimit: { windowMs: 60 * 1000, maxRequests: 30 } });
