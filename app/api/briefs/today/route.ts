import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';

async function handler(
  _request: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const supabase = createServerClient();

  // ── Pro tier check (account_tier is INTEGER: 1-2 = free, 3 = gold) ───────
  const { data: userRow } = await supabase
    .from('users')
    .select('account_tier')
    .eq('id', session.userId)
    .maybeSingle();

  const tier = userRow?.account_tier ?? 1;
  if (typeof tier !== 'number' || tier < 3) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'upgrade_required' }, { status: 403 })
    );
  }

  // ── Fetch today's brief (ET calendar date) ────────────────────────────────
  const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

  const { data: brief, error } = await supabase
    .from('daily_briefs')
    .select('*')
    .eq('published_date', todayET)
    .maybeSingle();

  if (error) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Database error' }, { status: 500 })
    );
  }

  return addSecurityHeaders(
    NextResponse.json(
      { success: true, brief: brief ?? null },
      { headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=600' } }
    )
  );
}

export const GET = withAuth(handler);
