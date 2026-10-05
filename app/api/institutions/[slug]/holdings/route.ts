/**
 * GET /api/institutions/[slug]/holdings?quarter=YYYY-MM-DD
 *
 * Pro-gated. Dual gate, deliberately: route-level isPro() check here AND
 * the RLS policy on institutional_filings/institutional_holdings (migration
 * 127) — this repo's security audit found daily_briefs/ai_stock_picks
 * enforcing a Pro gate in the API route only, bypassable via a direct
 * PostgREST call, and fixed it after the fact. Here it's designed in from
 * the start: this route is the primary gate (service-role client, simpler
 * joins), RLS is the backstop for any other access path.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { getTier, isPro } from '@/lib/billing/tier';
import { isInstitutionalFundSlug } from '@/lib/institutions/fund-list';
import { loadFundHoldings } from '@/lib/institutions/load-holdings';

async function handler(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
  session: { userId: string }
): Promise<NextResponse> {
  const { slug } = await context.params;
  if (!isInstitutionalFundSlug(slug)) {
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'not_found' }, { status: 404 }));
  }

  if (!isPro(await getTier(session.userId))) {
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'pro_required' }, { status: 403 }));
  }

  try {
    const result = await loadFundHoldings(slug, request.nextUrl.searchParams.get('quarter'));
    if (!result.ok) {
      return addSecurityHeaders(NextResponse.json({ success: false, error: result.error }, { status: result.status }));
    }
    return addSecurityHeaders(NextResponse.json({ success: true, ...result.data }));
  } catch (err) {
    console.error(`[institutions/${slug}/holdings] failed:`, err);
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to load holdings' }, { status: 500 })
    );
  }
}

export const GET = withAuth(handler, { rateLimit: { windowMs: 60 * 1000, maxRequests: 30 } });
