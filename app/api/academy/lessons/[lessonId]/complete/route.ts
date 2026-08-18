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
import { getTier, isPro } from '@/lib/billing/tier';
import { applyActivityAndXp, fetchStatsRow } from '@/lib/academy/streak';

const BodySchema = z.object({
  score: z.number().min(0).max(1).optional(),
});

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

  // ── Load everything the rest of this handler needs, in one round trip ────
  // Lesson info, idempotency check, and current stats are all independent
  // reads (none needs another's result), so fire them together instead of
  // awaiting one at a time — this is the single biggest lever on this
  // route's latency, since serverless → Supabase round trips dominate it.
  const [{ data: lesson }, { data: existing }, statsRow] = await Promise.all([
    supabase
      .from('academy_lessons')
      .select('id, course_id, xp_reward, academy_courses!inner(requires_pro)')
      .eq('id', lessonId)
      .maybeSingle<{
        id: string;
        course_id: string;
        xp_reward: number;
        academy_courses: { requires_pro: boolean } | { requires_pro: boolean }[];
      }>(),
    supabase
      .from('academy_user_lesson_progress')
      .select('id, xp_earned')
      .eq('user_id', session.userId)
      .eq('lesson_id', lessonId)
      .maybeSingle<{ id: string; xp_earned: number }>(),
    fetchStatsRow({ supabase: db, userId: session.userId }),
  ]);

  if (!lesson) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Lesson not found' }, { status: 404 })
    );
  }

  // Supabase returns the joined row as an object for a to-one FK, but the
  // client's TS types don't always narrow that — handle both shapes defensively.
  const courseGate = Array.isArray(lesson.academy_courses)
    ? lesson.academy_courses[0]
    : lesson.academy_courses;

  // ── Security backstop: server-side Pro gate, independent of the UI ───────
  // Protects XP/leaderboard integrity — a free user must never be able to
  // award themselves Pro-course XP by calling this route directly.
  if (courseGate?.requires_pro) {
    const tier = await getTier(session.userId);
    if (!isPro(tier)) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'Pro subscription required' }, { status: 403 })
      );
    }
  }

  const isFirstCompletion = existing === null;
  const xpAwarded = isFirstCompletion ? lesson.xp_reward : 0;

  // ── Record the lesson completion and fetch the course's lesson list in
  // parallel — the insert doesn't depend on knowing the other lessons, and
  // the lesson list only needs course_id, which we already have. ──────────
  const [, { data: allLessonIds }, quizGateRes] = await Promise.all([
    isFirstCompletion
      ? db.from('academy_user_lesson_progress').insert({
          user_id: session.userId,
          lesson_id: lessonId,
          score: body.score ?? null,
          xp_earned: lesson.xp_reward,
        })
      : Promise.resolve(),
    supabase.from('academy_lessons').select('id').eq('course_id', lesson.course_id),
    supabase.from('academy_course_quizzes').select('id').eq('course_id', lesson.course_id).maybeSingle<{ id: string }>(),
  ]);

  const courseIsQuizGated = quizGateRes.data !== null;

  // ── Course progress: all-lessons-done is tracked regardless of gating, but
  // completed_at (the field progression-lock actually reads) is only set here
  // for courses with no final quiz. A quiz-gated course's completed_at is set
  // exclusively by /api/academy/courses/[slug]/quiz/submit, never here. ───────
  const { data: completedRows } = await supabase
    .from('academy_user_lesson_progress')
    .select('lesson_id')
    .eq('user_id', session.userId)
    .in('lesson_id', (allLessonIds ?? []).map((l: { id: string }) => l.id));

  const completedCount = completedRows?.length ?? 0;
  const totalCount = allLessonIds?.length ?? 0;
  const allLessonsDone = totalCount > 0 && completedCount >= totalCount;
  const courseNowComplete = allLessonsDone && !courseIsQuizGated;

  // ── Course progress upsert + stats upsert are independent writes ─────────
  const [, stats] = await Promise.all([
    db.from('academy_user_course_progress').upsert(
      {
        user_id: session.userId,
        course_id: lesson.course_id,
        last_lesson_id: lessonId,
        ...(courseNowComplete ? { completed_at: new Date().toISOString() } : {}),
      },
      { onConflict: 'user_id,course_id' }
    ),
    applyActivityAndXp({ supabase: db, userId: session.userId, xpToAdd: xpAwarded, statsRow }),
  ]);

  return addSecurityHeaders(
    NextResponse.json({
      success: true,
      xpAwarded,
      isFirstCompletion,
      courseCompleted: courseNowComplete,
      allLessonsDone,
      stats,
    })
  );
}

export const POST = withAuth(handler);
