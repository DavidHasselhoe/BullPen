/**
 * GET /api/picks/current
 *
 * The latest published pick, public, no auth required. Built by
 * getCurrentPick() (lib/picks/current.ts), which also states what is free
 * and what is gated.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withOptionalAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { getCurrentPick } from '@/lib/picks/current';

async function handler(
  _request: NextRequest,
  _context: unknown,
  session: { userId: string } | null
): Promise<NextResponse> {
  try {
    return addSecurityHeaders(NextResponse.json(await getCurrentPick(session)));
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(NextResponse.json({ success: false, error: 'plan_restricted' }, { status: 200 }));
    }
    console.error('[picks/current] failed:', err);
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to load the current pick' }, { status: 500 })
    );
  }
}

export const GET = withOptionalAuth(handler, { rateLimit: { windowMs: 60 * 1000, maxRequests: 60 } });
