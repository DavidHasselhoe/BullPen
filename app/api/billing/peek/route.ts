/**
 * POST /api/billing/peek: spends a free account's monthly look at the
 * Discover cross-reference panels (lib/billing/free-peek.ts). Pro accounts
 * never need it and get { state: 'pro' }.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { getTier, isPro } from '@/lib/billing/tier';
import { redeemPeek } from '@/lib/billing/free-peek';

async function post(_request: NextRequest, _context: unknown, session: { userId: string }): Promise<NextResponse> {
  if (isPro(await getTier(session.userId))) {
    return addSecurityHeaders(NextResponse.json({ success: true, state: 'pro' }));
  }
  try {
    const peek = await redeemPeek(session.userId);
    return addSecurityHeaders(NextResponse.json({ success: peek.state === 'open', ...peek }));
  } catch (err) {
    console.error('[billing/peek] redeem failed:', err instanceof Error ? err.message : err);
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'Failed to unlock' }, { status: 500 }));
  }
}

export const POST = withAuth(post, { rateLimit: { windowMs: 60 * 1000, maxRequests: 5 } });
