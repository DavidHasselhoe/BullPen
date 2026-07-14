import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { getTier, isPro } from '@/lib/billing/tier';

async function handler(
  _request: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const supabase = createServerClient();

  // Pro-only — same gate as /api/briefs/today.
  if (!isPro(await getTier(session.userId))) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'upgrade_required' }, { status: 403 })
    );
  }

  // The 14 most recently *generated* editions, not "last 14 calendar days" —
  // if a day has no brief (e.g. cron gap), it simply doesn't appear rather
  // than showing as an empty slot.
  const { data: briefs, error } = await supabase
    .from('daily_briefs')
    .select('*')
    .order('published_date', { ascending: false })
    .limit(14);

  if (error) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Database error' }, { status: 500 })
    );
  }

  return addSecurityHeaders(
    NextResponse.json(
      { success: true, briefs: briefs ?? [] },
      { headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=600' } }
    )
  );
}

export const GET = withAuth(handler);
