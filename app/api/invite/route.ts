import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { SITE_URL } from '@/lib/site';

/**
 * The caller's personal invite link and how it has done. The code lives in a
 * column the browser cannot read (migration 173), so it comes from here.
 */
async function handler(_request: NextRequest, _ctx: unknown, session: { userId: string }): Promise<NextResponse> {
  const supabase = createServerClient();
  const [{ data: user }, { data: referrals }] = await Promise.all([
    supabase.from('users').select('invite_code').eq('id', session.userId).maybeSingle(),
    supabase.from('referrals').select('referrer_rewarded').eq('referrer_id', session.userId),
  ]);

  const code = (user as { invite_code: string } | null)?.invite_code;
  if (!code) {
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'not_found' }, { status: 404 }));
  }

  const rows = (referrals ?? []) as Array<{ referrer_rewarded: boolean }>;
  return addSecurityHeaders(
    NextResponse.json({
      success: true,
      url: `${SITE_URL}/invite/${code}`,
      joined: rows.length,
      monthsEarned: rows.filter((r) => r.referrer_rewarded).length,
    })
  );
}

export const GET = withAuth(handler, { rateLimit: { windowMs: 60 * 1000, maxRequests: 30 } });
