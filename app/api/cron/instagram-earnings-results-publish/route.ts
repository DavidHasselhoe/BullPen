/**
 * Instagram Earnings-Results Sunday Publish Cron
 * GET /api/cron/instagram-earnings-results-publish
 *
 * Runs Sunday, a day after app/api/cron/instagram-earnings-results stages
 * the beat/missed recap carousel on Saturday. Looks up that week's row by
 * the same "last completed trading week" period_key and publishes it for
 * real if it's still status 'ready'. Mirror image of
 * app/api/cron/instagram-earnings-publish (the earnings_calendar Monday
 * auto-publish), same reasoning: the Discord "Publish Now" button lets
 * David ship it early or catch something wrong, but there's no longer a
 * hard human gate before it goes live on its own.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logSecurityEvent } from '@/lib/security/security-events';
import { createServerClient } from '@/lib/supabase/client';
import { publishStagedPost } from '@/lib/instagram/publish';
import { isoWeekKey, lastTradingWeek } from '@/lib/instagram/period-key';

export const maxDuration = 60;

const CONTENT_TYPE = 'earnings_results';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/instagram-earnings-results-publish' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any; // instagram_posts isn't in the generated Database type yet

  const referenceET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const { weekStart } = lastTradingWeek(referenceET);
  const periodKey = isoWeekKey(new Date(weekStart + 'T12:00:00Z'));

  const { data: post } = await db
    .from('instagram_posts')
    .select('id, status')
    .eq('content_type', CONTENT_TYPE)
    .eq('period_key', periodKey)
    .maybeSingle();

  if (!post) {
    // Either a genuinely quiet week (the generation cron skips those on
    // purpose, no row at all) or generation/staging failed on Saturday. Not
    // distinguishable from here without also checking Discord, so this is a
    // silent no-op like the quiet-week case upstream, not an error.
    return NextResponse.json({ success: true, skipped: true, periodKey, reason: 'no_post_for_week' });
  }

  if (post.status !== 'ready') {
    // Already published (e.g. someone clicked "Publish Now" in Discord or
    // ran the manual script over the weekend), already failed, or otherwise
    // not publishable — no-op either way.
    return NextResponse.json({ success: true, skipped: true, periodKey, postId: post.id, reason: 'not_ready', status: post.status });
  }

  const result = await publishStagedPost(post.id);

  if (result.outcome === 'published') {
    return NextResponse.json({ success: true, postId: post.id, periodKey, mediaId: result.mediaId, permalink: result.permalink });
  }

  if (result.outcome === 'dry_run') {
    // Meta credentials not configured yet — nothing to publish for real.
    return NextResponse.json({ success: true, postId: post.id, periodKey, dryRun: true });
  }

  return NextResponse.json(
    { success: false, postId: post.id, periodKey, error: result.outcome === 'failed' ? result.error : result.outcome },
    { status: 500 }
  );
}
