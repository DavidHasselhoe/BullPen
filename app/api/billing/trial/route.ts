import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { trialDaysFor } from '@/lib/billing/referral-trial';

/** GET /api/billing/trial: the caller's trial length, the same number checkout will use. */
async function handler(_request: NextRequest, _ctx: unknown, session: { userId: string }): Promise<NextResponse> {
  const days = await trialDaysFor(createServerClient(), session.userId);
  return addSecurityHeaders(NextResponse.json({ days }));
}

export const GET = withAuth(handler, { rateLimit: { windowMs: 60 * 1000, maxRequests: 30 } });
