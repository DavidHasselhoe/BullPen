/**
 * Instagram weekly summary
 * GET /api/cron/instagram-weekly-insights
 *
 * Mondays 07:00 UTC (vercel.json). Posts one Discord message about the
 * Monday-Sunday week that just ended: account views, reach, profile visits,
 * bio link clicks and followers against the week before, then every post of
 * the week split into "posted by hand" and the pipeline's automatic posts.
 * See lib/instagram/weekly-insights.ts. Instagram API only, no AI, no credits.
 *
 * ?dryRun=1 returns the message as JSON and writes and posts nothing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withCronReport } from '@/lib/cron/report';
import { logSecurityEvent } from '@/lib/security/security-events';
import { createServerClient } from '@/lib/supabase/client';
import { postToDiscord } from '@/lib/discord/post-message';
import { isInstagramConfigured } from '@/lib/instagram/client';
import {
  buildWeeklySummary,
  completedWeek,
  fetchAccountTotals,
  fetchFollowers,
  fetchWeekPosts,
} from '@/lib/instagram/weekly-insights';

export const maxDuration = 120;

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/instagram-weekly-insights' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isInstagramConfigured()) {
    return NextResponse.json({ success: true, skipped: true, reason: 'instagram_not_configured' });
  }

  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';
  const webhookUrl = process.env.DISCORD_INSTAGRAM_WEBHOOK_URL;
  if (!dryRun && !webhookUrl) {
    return NextResponse.json({ success: false, error: 'DISCORD_INSTAGRAM_WEBHOOK_URL not set' }, { status: 500 });
  }

  const now = new Date();
  const week = completedWeek(now);
  const weekBefore = completedWeek(now, 1);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createServerClient() as any; // these tables aren't in the generated Database type
    const [account, prevAccount, followers, posts, prevRow] = await Promise.all([
      fetchAccountTotals(week),
      fetchAccountTotals(weekBefore),
      fetchFollowers(),
      fetchWeekPosts(week),
      db.from('instagram_weekly_stats').select('followers').eq('week_key', weekBefore.key).maybeSingle(),
    ]);
    if (prevRow.error) throw new Error(`instagram_weekly_stats read: ${prevRow.error.message}`);

    const ids = posts.map((p) => p.id);
    const pipelineRows = ids.length
      ? await db.from('instagram_posts').select('instagram_media_id, content_type').in('instagram_media_id', ids)
      : { data: [], error: null };
    if (pipelineRows.error) throw new Error(`instagram_posts read: ${pipelineRows.error.message}`);
    const pipeline = new Map<string, string>(
      (pipelineRows.data as { instagram_media_id: string; content_type: string }[]).map((r) => [r.instagram_media_id, r.content_type]),
    );

    const embed = buildWeeklySummary({
      week,
      account,
      prevAccount,
      followers,
      prevFollowers: prevRow.data?.followers ?? null,
      posts,
      pipeline,
    });
    const handPosts = posts.filter((p) => !pipeline.has(p.id)).length;
    if (dryRun) return NextResponse.json({ success: true, dryRun: true, week: week.key, embed });

    const { error: writeError } = await db.from('instagram_weekly_stats').upsert({
      week_key: week.key,
      followers,
      stats: { account, posts: posts.map(({ id, isReel, postedAt, stats }) => ({ id, isReel, postedAt, stats, contentType: pipeline.get(id) ?? null })) },
    });
    if (writeError) throw new Error(`instagram_weekly_stats write: ${writeError.message}`);

    await postToDiscord(webhookUrl!, { embeds: [embed] });
    return NextResponse.json({ success: true, week: week.key, posts: posts.length, handPosts, followers, views: account.views });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[instagram-weekly-insights] failed:', err);
    return NextResponse.json({ success: false, week: week.key, error: message, errors: [message] }, { status: 500 });
  }
}

export const GET = withCronReport('instagram-weekly-insights', handleGET);
