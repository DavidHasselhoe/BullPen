/**
 * GET /api/congress
 *
 * The curated member list for the Discover section. Public, no auth — see
 * migration 149's header on 5 U.S.C. 13107 for why this data is deliberately
 * open where the 13F equivalent is Pro-gated. The read itself is
 * loadCongressMembers (lib/congress/member-data.ts), shared with the
 * server-rendered /discover/politicians page.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { loadCongressMembers } from '@/lib/congress/member-data';

export type { CongressMemberSummary } from '@/lib/congress/member-data';

async function handler(_request: NextRequest) {
  try {
    const res = NextResponse.json({ success: true, members: await loadCongressMembers() });
    // Same list for every visitor: let the CDN answer before the DB cache is even asked.
    res.headers.set('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=86400');
    return addSecurityHeaders(res);
  } catch (err) {
    console.error('[api/congress]', err);
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to load members' }, { status: 500 }),
    );
  }
}

export const GET = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 60 });
