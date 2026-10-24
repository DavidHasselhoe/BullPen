/**
 * GET /api/congress/[slug]
 *
 * One member's estimated open positions plus their disclosed trades, for the
 * detail page. Public, no auth (migration 149). The read itself, and why
 * holdings and trades stay apart, is loadCongressMember
 * (lib/congress/member-data.ts), shared with the server-rendered page.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { loadCongressMember } from '@/lib/congress/member-data';

export type { CongressMemberDetail, CongressHoldingRow } from '@/lib/congress/member-data';

async function handler(_request: NextRequest, context?: unknown) {
  const { params } = (context ?? {}) as { params: Promise<{ slug: string }> };
  const { slug } = await params;

  try {
    const detail = await loadCongressMember(slug);
    if (!detail) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'Member not found' }, { status: 404 }),
      );
    }
    // Public, identical for every visitor, and only changes when the weekly
    // refresh runs, so the CDN can serve it; a 30 min lag is invisible here.
    const res = NextResponse.json({ success: true, member: detail });
    res.headers.set('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=86400');
    return addSecurityHeaders(res);
  } catch (err) {
    console.error('[api/congress/[slug]]', err);
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to load member' }, { status: 500 }),
    );
  }
}

export const GET = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 60 });
