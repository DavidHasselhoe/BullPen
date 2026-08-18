/**
 * Academy Weekly Course Generation Cron
 * GET /api/cron/generate-academy-course
 *
 * Works through ACADEMY_ROADMAP (lib/academy/academy-roadmap.ts) one course
 * per run: finds the first roadmap entry whose slug doesn't exist yet in
 * academy_courses, drafts every lesson via Claude (generateCourseLessons —
 * the same generation+validation logic scripts/generate-academy-course.ts
 * uses), and inserts it with is_published: false. A human must explicitly
 * approve it at /admin/academy-roadmap before it becomes visible to real
 * users — unlike the Instagram pipeline, there is no second cron that
 * auto-publishes on a timer. Posts a Discord notification either way
 * (staged for review, or generation failed) so a bad run is never silent.
 *
 * Idempotent: re-running finds the same "next" entry until it exists in the
 * database, then moves to the following one. No-ops once all 10 roadmap
 * entries exist (published or still pending review).
 */

import { NextRequest, NextResponse } from 'next/server';
import { logSecurityEvent } from '@/lib/security/security-events';
import { createServerClient } from '@/lib/supabase/client';
import { generateCourseLessons } from '@/lib/academy/generate-course-content';
import { ACADEMY_ROADMAP } from '@/lib/academy/academy-roadmap';
import { postToDiscord } from '@/lib/discord/post-message';

export const maxDuration = 300;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/generate-academy-course' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  // academy_courses/academy_lessons writes aren't fully covered by generated
  // types — cast at the write site only, same pattern as the other academy routes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: existingCourses } = await supabase.from('academy_courses').select('slug');
  const existingSlugs = new Set((existingCourses ?? []).map((c: { slug: string }) => c.slug));

  const nextOutline = ACADEMY_ROADMAP.find((o) => !existingSlugs.has(o.slug));

  if (!nextOutline) {
    return NextResponse.json({ success: true, skipped: true, reason: 'roadmap_exhausted' });
  }

  const webhookUrl = process.env.DISCORD_ACADEMY_WEBHOOK_URL;

  let contents: unknown[];
  try {
    contents = await generateCourseLessons(nextOutline);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[generate-academy-course] generation failed for "${nextOutline.slug}":`, err);
    if (webhookUrl) {
      await postToDiscord(webhookUrl, {
        embeds: [{
          title: `Academy course generation FAILED — ${nextOutline.title}`,
          description: detail.slice(0, 500),
          color: 0xef4444,
          timestamp: new Date().toISOString(),
        }],
      }).catch((e) => console.error('[generate-academy-course] Discord failure notification failed:', e));
    }
    return NextResponse.json({ success: false, error: 'generation_failed', detail }, { status: 500 });
  }

  const { data: courseRow, error: courseError } = await db
    .from('academy_courses')
    .insert({
      slug: nextOutline.slug,
      title: nextOutline.title,
      description: nextOutline.description,
      icon: nextOutline.icon,
      color: nextOutline.color,
      order_index: nextOutline.orderIndex,
      difficulty: nextOutline.difficulty,
      requires_pro: nextOutline.requiresPro ?? false,
      unit_label: nextOutline.unitLabel,
      is_published: false,
    })
    .select('id')
    .single();

  if (courseError || !courseRow) {
    console.error('[generate-academy-course] course insert failed:', courseError);
    return NextResponse.json({ success: false, error: courseError?.message ?? 'course_insert_failed' }, { status: 500 });
  }

  const lessonRows = nextOutline.lessons.map((lesson, i) => ({
    course_id: courseRow.id,
    slug: lesson.slug,
    title: lesson.title,
    type: lesson.type,
    order_index: i,
    xp_reward: lesson.xpReward,
    content: contents[i],
  }));

  const { error: lessonsError } = await db.from('academy_lessons').insert(lessonRows);

  if (lessonsError) {
    console.error('[generate-academy-course] lesson insert failed:', lessonsError);
    // Best-effort cleanup so a half-written course doesn't linger as an
    // un-reviewable, lesson-less draft on the admin page.
    await db.from('academy_courses').delete().eq('id', courseRow.id);
    return NextResponse.json({ success: false, error: lessonsError.message }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bullpen.no';
  if (webhookUrl) {
    await postToDiscord(webhookUrl, {
      embeds: [{
        title: `Academy course staged for review — ${nextOutline.title}`,
        description:
          `${nextOutline.lessons.length} lessons, ${nextOutline.difficulty}${nextOutline.requiresPro ? ' · Pro' : ' · Free'}.\n\n` +
          nextOutline.lessons.map((l, i) => `${i + 1}. ${l.title} (${l.type})`).join('\n') +
          `\n\nReview and approve: ${appUrl}/admin/academy-roadmap`,
        color: 0x34d399,
        timestamp: new Date().toISOString(),
      }],
    }).catch((e) => console.error('[generate-academy-course] Discord notification failed:', e));
  } else {
    console.warn('[generate-academy-course] DISCORD_ACADEMY_WEBHOOK_URL not set, skipping review notification');
  }

  return NextResponse.json({
    success: true,
    courseId: courseRow.id,
    slug: nextOutline.slug,
    title: nextOutline.title,
    lessonCount: nextOutline.lessons.length,
  });
}
