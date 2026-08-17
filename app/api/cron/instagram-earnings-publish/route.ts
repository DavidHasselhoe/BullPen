/**
 * Instagram Earnings-Calendar Monday Publish Cron
 * GET /api/cron/instagram-earnings-publish
 *
 * Runs Monday morning (see .github/workflows/cron-instagram-earnings-publish.yml),
 * a day after app/api/cron/instagram-earnings-weekly stages the week's
 * carousel on Sunday. Looks up that week's row by the same ISO-week
 * period_key and publishes it for real if it's still status 'ready'.
 *
 * This is the automated counterpart to the manual `npm run instagram-publish
 * -- --id=<postId>` step — publishing no longer waits on a human running
 * that command. The Sunday Discord preview is still posted and is still the
 * place to catch something wrong; there just isn't a human "go" button
 * before it ships anymore, so anything worth stopping needs to happen
 * between Sunday's staging and Monday's publish (e.g. mark the row
 * something other than 'ready', or delete it).
 */

import { NextRequest, NextResponse } from 'next/server';
import { logSecurityEvent } from '@/lib/security/security-events';
import { createServerClient } from '@/lib/supabase/client';
import { publishStagedPost } from '@/lib/instagram/publish';
import { isoWeekKey } from '@/lib/instagram/period-key';

export const maxDuration = 60;

const CONTENT_TYPE = 'earnings_calendar';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/instagram-earnings-publish' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any; // instagram_posts isn't in the generated Database type yet

  // On a Monday-morning run, "today" in ET already IS the target week, unlike
  // the Sunday generation cron which has to jump to *next* week.
  const referenceET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const periodKey = isoWeekKey(referenceET);

  const { data: post } = await db
    .from('instagram_posts')
    .select('id, status')
    .eq('content_type', CONTENT_TYPE)
    .eq('period_key', periodKey)
    .maybeSingle();

  if (!post) {
    // Either a genuinely quiet week (the generation cron skips those on
    // purpose, no row at all) or generation/staging failed on Sunday. Not
    // distinguishable from here without also checking Discord, so this is a
    // silent no-op like the quiet-week case upstream, not an error.
    return NextResponse.json({ success: true, skipped: true, periodKey, reason: 'no_post_for_week' });
  }

  if (post.status !== 'ready') {
    // Already published (e.g. someone ran the manual script over the
    // weekend), already failed, or otherwise not publishable — no-op either way.
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
