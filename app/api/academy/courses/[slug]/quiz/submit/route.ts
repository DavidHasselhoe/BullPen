/**
 * POST /api/academy/courses/[slug]/quiz/submit
 *
 * Grades a final-quiz attempt server-side (never trusts a client-reported
 * score) and, on a pass, marks the course complete — the only write path for
 * completed_at on a quiz-gated course. No progression-lock check here on
 * purpose: this route is exactly how a progression-locked course gets
 * unlocked via "I know this, skip to quiz" (see PathNode.tsx). No bonus XP
 * is awarded on pass, matching the existing optional-course /skip route's
 * "skipping earns nothing" precedent — but every attempt still ticks the
 * daily streak, since answering real questions is genuine engagement.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { getTier, isPro } from '@/lib/billing/tier';
import { applyActivityAndXp, fetchStatsRow } from '@/lib/academy/streak';
import type { CourseFinalQuiz } from '@/types/academy';

const BodySchema = z.object({
  answers: z.array(z.number().int().min(0)),
});

async function handler(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> },
  session: { userId: string }
): Promise<NextResponse> {
  const { slug } = await context.params;

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Invalid body' }, { status: 400 })
    );
  }

  const supabase = createServerClient();
  // academy_course_quizzes / academy_user_quiz_attempts aren't in generated
  // Supabase types yet — cast at the write site only, same pattern as the
  // lesson-complete and skip routes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: course } = await supabase
    .from('academy_courses')
    .select('id, order_index, requires_pro')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle<{ id: string; order_index: number; requires_pro: boolean }>();

  if (!course) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Course not found' }, { status: 404 })
    );
  }

  // Security backstop, independent of the UI: a Pro-gated course's quiz must
  // never be passable by a free user calling this route directly.
  if (course.requires_pro) {
    const tier = await getTier(session.userId);
    if (!isPro(tier)) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'Pro subscription required' }, { status: 403 })
      );
    }
  }

  const { data: quizRow } = await supabase
    .from('academy_course_quizzes')
    .select('questions, pass_threshold')
    .eq('course_id', course.id)
    .maybeSingle<{ questions: CourseFinalQuiz['questions']; pass_threshold: number }>();

  if (!quizRow) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'No final quiz for this course' }, { status: 404 })
    );
  }

  const { questions, pass_threshold: passThreshold } = quizRow;

  if (body.answers.length !== questions.length) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Answer count does not match question count' }, { status: 400 })
    );
  }

  // ── Grade server-side, from the same question data just loaded — never
  // from anything the client asserts. ────────────────────────────────────
  const correctCount = questions.reduce(
    (n, q, i) => (body.answers[i] === q.correctIndex ? n + 1 : n),
    0
  );
  const score = correctCount / questions.length;
  const passed = score >= passThreshold;

  const statsRow = await fetchStatsRow({ supabase: db, userId: session.userId });

  const [, , stats] = await Promise.all([
    db.from('academy_user_quiz_attempts').insert({
      user_id: session.userId,
      course_id: course.id,
      score,
      passed,
    }),
    passed
      ? db.from('academy_user_course_progress').upsert(
          {
            user_id: session.userId,
            course_id: course.id,
            completed_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,course_id' }
        )
      : Promise.resolve(),
    // Every attempt (pass or fail) is genuine engagement — ticks the streak,
    // no bonus XP.
    applyActivityAndXp({ supabase: db, userId: session.userId, xpToAdd: 0, statsRow }),
  ]);

  let nextCourseSlug: string | null = null;
  if (passed) {
    const { data: nextCourse } = await supabase
      .from('academy_courses')
      .select('slug')
      .eq('is_published', true)
      .gt('order_index', course.order_index)
      .order('order_index')
      .limit(1)
      .maybeSingle<{ slug: string }>();
    nextCourseSlug = nextCourse?.slug ?? null;
  }

  return addSecurityHeaders(
    NextResponse.json({ success: true, passed, score, nextCourseSlug, stats })
  );
}

export const POST = withAuth(handler);
