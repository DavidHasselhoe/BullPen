/**
 * Instagram Weekly Pick scoreboard
 * GET /api/cron/instagram-picks-scoreboard
 *
 * Saturdays at 15:00 UTC (vercel.json), after the week's last close and an
 * hour after instagram-earnings-results. Posts the picks' track record since
 * the first pick against SPY bought on the same days, every week whichever
 * way it went: a scoreboard that only appears when it's ahead isn't one.
 * Skips (200) while the record is under MIN_PICKS_FOR_HEADLINE, the same
 * point below which /picks withholds the headline number.
 *
 * Manual runs: ?dryRun=true stages under a "-dryrun" key with no Discord and
 * no publish (it still makes the one Claude call for the caption).
 */

import { NextRequest, NextResponse } from 'next/server';
import { logSecurityEvent } from '@/lib/security/security-events';
import { createServerClient } from '@/lib/supabase/client';
import { isoWeekKey } from '@/lib/instagram/period-key';
import { generatePicksScoreboardContent } from '@/lib/instagram/content/picks-scoreboard';
import { stageAndPublishPost } from '@/lib/instagram/movers-stage';

export const maxDuration = 300;

const CONTENT_TYPE = 'picks_scoreboard';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/instagram-picks-scoreboard' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get('dryRun') === 'true';
  const periodKey = isoWeekKey(new Date()) + (dryRun ? '-dryrun' : '');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServerClient() as any; // instagram_posts isn't in the generated Database type yet
  const { data: existing } = await db
    .from('instagram_posts')
    .select('id, status')
    .eq('content_type', CONTENT_TYPE)
    .eq('period_key', periodKey)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ success: true, skipped: true, reason: 'already_exists', periodKey, status: existing.status });
  }

  try {
    const content = await generatePicksScoreboardContent();
    const lead = content.totalReturnPct - content.benchmarkReturnPct;
    const staged = await stageAndPublishPost({
      contentType: CONTENT_TYPE,
      periodKey,
      content,
      dryRun,
      discordTitle: `Weekly Pick scoreboard auto-publishing — ${content.asOfLabel}`,
      discordSummary: `All picks ${content.totalReturnPct.toFixed(1)}% vs S&P ${content.benchmarkReturnPct.toFixed(1)}% (${lead >= 0 ? '+' : ''}${lead.toFixed(1)} pts), ${content.beatCount} of ${content.pickCount} ahead.`,
    });
    return NextResponse.json({ success: true, periodKey, postId: staged.postId, previewLinks: staged.previewLinks, publish: staged.publish });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'insufficient_sample') {
      return NextResponse.json({ success: true, skipped: true, reason: 'insufficient_sample', periodKey });
    }
    console.error('[instagram-picks-scoreboard] failed:', err);
    return NextResponse.json({ success: false, periodKey, error: message }, { status: 500 });
  }
}
