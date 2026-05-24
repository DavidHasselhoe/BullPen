/**
 * POST /api/academy/lessons/[lessonId]/complete
 *
 * Marks a lesson complete for the current user:
 *   1. Records lesson progress (idempotent — re-doing a lesson does NOT double-award XP).
 *   2. Records / updates course progress (sets completed_at if this was the final lesson).
 *   3. Recomputes user stats (XP, streak in America/New_York timezone, level).
 *
 * Returns the updated stats so the client can animate XP from old → new.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { levelForXp } from '@/types/academy';
import type { AcademyStats } from '@/types/academy';

const BodySchema = z.object({
  score: z.number().min(0).max(1).optional(),
});

function todayInET(): string {
  // YYYY-MM-DD in America/New_York
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function isoDateBefore(a: string, b: string): boolean {
  return Date.parse(a) < Date.parse(b);
}

function daysBetween(earlier: string, later: string): number {
  return Math.round((Date.parse(later) - Date.parse(earlier)) / 86_400_000);
}

async function handler(
  req: NextRequest,
  context: { params: Promise<{ lessonId: string }> },
  session: { userId: string }
): Promise<NextResponse> {
  const { lessonId } = await context.params;

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json().catch(() => ({})));
  } catch {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Invalid body' }, { status: 400 })
    );
  }

  const supabase = createServerClient();
  // Academy tables aren't yet in the generated Supabase types — pattern used
  // elsewhere is to cast at the write site only (reads stay typed).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // ── Load the lesson (need its xp_reward and course_id) ───────────────────
  const { data: lesson } = await supabase
    .from('academy_lessons')
    .select('id, course_id, xp_reward')
    .eq('id', lessonId)
    .maybeSingle<{ id: string; course_id: string; xp_reward: number }>();

  if (!lesson) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Lesson not found' }, { status: 404 })
    );
  }

  // ── Idempotency: was this lesson already completed? ──────────────────────
  const { data: existing } = await supabase
    .from('academy_user_lesson_progress')
    .select('id, xp_earned')
    .eq('user_id', session.userId)
    .eq('lesson_id', lessonId)
    .maybeSingle<{ id: string; xp_earned: number }>();

  const isFirstCompletion = existing === null;
  const xpAwarded = isFirstCompletion ? lesson.xp_reward : 0;

  if (isFirstCompletion) {
    await db.from('academy_user_lesson_progress').insert({
      user_id: session.userId,
      lesson_id: lessonId,
      score: body.score ?? null,
      xp_earned: lesson.xp_reward,
    });
  }

  // ── Course progress: upsert + mark complete if all lessons done ──────────
  const { data: allLessonIds } = await supabase
    .from('academy_lessons')
    .select('id')
    .eq('course_id', lesson.course_id);

  const { data: completedRows } = await supabase
    .from('academy_user_lesson_progress')
    .select('lesson_id')
    .eq('user_id', session.userId)
    .in('lesson_id', (allLessonIds ?? []).map((l: { id: string }) => l.id));

  const completedCount = completedRows?.length ?? 0;
  const totalCount = allLessonIds?.length ?? 0;
  const courseNowComplete = totalCount > 0 && completedCount >= totalCount;

  await db
    .from('academy_user_course_progress')
    .upsert(
      {
        user_id: session.userId,
        course_id: lesson.course_id,
        last_lesson_id: lessonId,
        ...(courseNowComplete ? { completed_at: new Date().toISOString() } : {}),
      },
      { onConflict: 'user_id,course_id' }
    );

  // ── Stats: recompute XP + streak + level ─────────────────────────────────
  const { data: statsRow } = await supabase
    .from('academy_user_stats')
    .select('total_xp, current_streak, longest_streak, last_activity_date')
    .eq('user_id', session.userId)
    .maybeSingle<{
      total_xp: number;
      current_streak: number;
      longest_streak: number;
      last_activity_date: string | null;
    }>();

  const today = todayInET();
  const prevXp = statsRow?.total_xp ?? 0;
  const prevStreak = statsRow?.current_streak ?? 0;
  const prevLongest = statsRow?.longest_streak ?? 0;
  const prevLastActive = statsRow?.last_activity_date ?? null;

  // Streak logic — only applies when this completion changes activity for today
  let currentStreak = prevStreak;
  let lastActivityDate = prevLastActive;

  if (prevLastActive !== today) {
    if (prevLastActive === null) {
      currentStreak = 1;
    } else if (daysBetween(prevLastActive, today) === 1) {
      currentStreak = prevStreak + 1; // consecutive day
    } else if (isoDateBefore(prevLastActive, today)) {
      currentStreak = 1; // gap broke the streak
    }
    lastActivityDate = today;
  }

  const totalXp = prevXp + xpAwarded;
  const longestStreak = Math.max(prevLongest, currentStreak);
  const level = levelForXp(totalXp);

  await db
    .from('academy_user_stats')
    .upsert(
      {
        user_id: session.userId,
        total_xp: totalXp,
        current_streak: currentStreak,
        longest_streak: longestStreak,
        last_activity_date: lastActivityDate,
        level,
      },
      { onConflict: 'user_id' }
    );

  const stats: AcademyStats = {
    totalXp,
    currentStreak,
    longestStreak,
    lastActivityDate,
    level,
  };

  return addSecurityHeaders(
    NextResponse.json({
      success: true,
      xpAwarded,
      isFirstCompletion,
      courseCompleted: courseNowComplete,
      stats,
    })
  );
}

export const POST = withAuth(handler);
