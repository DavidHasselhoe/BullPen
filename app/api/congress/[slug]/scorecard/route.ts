/**
 * GET /api/congress/[slug]/scorecard  (Pro)
 *
 * "If you had copied this member's buys the day they became public": see
 * getScorecard for the method. Pro-gated because it is analysis built on the
 * disclosures, not the disclosures themselves, which stay free.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { getTier, isPro } from '@/lib/billing/tier';
import { getScorecard } from '@/lib/congress/insights';
import { TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';

async function handler(
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> },
  session: { userId: string }
): Promise<NextResponse> {
  if (!isPro(await getTier(session.userId))) {
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'upgrade_required' }, { status: 403 }));
  }
  const { slug } = await context.params;
  try {
    const scorecard = await getScorecard(slug);
    return addSecurityHeaders(NextResponse.json({ success: true, scorecard }));
  } catch (error) {
    if (error instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(NextResponse.json({ success: false, error: 'plan_restricted' }, { status: 200 }));
    }
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'Failed to load' }, { status: 500 }));
  }
}

export const GET = withAuth(handler, { rateLimit: { windowMs: 60 * 1000, maxRequests: 20 } });
