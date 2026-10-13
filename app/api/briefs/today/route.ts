import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { getTier, isPro } from '@/lib/billing/tier';
import { toTeaser } from '@/lib/briefs/teaser';

async function handler(
  _request: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const supabase = createServerClient();

  // Free accounts get the title and the TL;DR, which is what makes Home a
  // daily check-in for everyone. The brief is generated once for all users,
  // so this costs nothing extra; the full read stays Pro. The rest of the
  // content is cut here on the server, not hidden in the browser.
  const pro = isPro(await getTier(session.userId));

  const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

  // Return the most recent brief within the last 2 days so users always see
  // content — even before today's cron has run (overnight gap) or if generation
  // failed. The client uses `is_today` to show a "yesterday's brief" label.
  const twoDaysAgoET = new Date(Date.now() - 2 * 86_400_000)
    .toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

  const { data: brief, error } = await supabase
    .from('daily_briefs')
    .select('*')
    .gte('published_date', twoDaysAgoET)
    .order('published_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Database error' }, { status: 500 })
    );
  }

  return addSecurityHeaders(
    NextResponse.json(
      {
        success: true,
        brief: brief && !pro ? toTeaser(brief) : (brief ?? null),
        locked: !pro,
        is_today: brief ? brief.published_date === todayET : false,
      },
      { headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=600' } }
    )
  );
}

export const GET = withAuth(handler);
