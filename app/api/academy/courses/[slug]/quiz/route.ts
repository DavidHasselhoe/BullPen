/**
 * GET /api/academy/courses/[slug]/quiz
 * Returns the course's final quiz (questions include correctIndex/explanation —
 * same trust model as an in-course quiz-type lesson; the submit route re-grades
 * server-side and never trusts a client-reported result).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { getTier, isPro } from '@/lib/billing/tier';
import type { CourseFinalQuiz } from '@/types/academy';

async function handler(
  _req: NextRequest,
  context: { params: Promise<{ slug: string }> },
  session: { userId: string }
): Promise<NextResponse> {
  const { slug } = await context.params;
  const supabase = createServerClient();

  const { data: course } = await supabase
    .from('academy_courses')
    .select('id, requires_pro')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle<{ id: string; requires_pro: boolean }>();

  if (!course) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Course not found' }, { status: 404 })
    );
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

  const tier = await getTier(session.userId);
  const locked = course.requires_pro && !isPro(tier);

  const quiz: CourseFinalQuiz = {
    questions: quizRow.questions,
    passThreshold: quizRow.pass_threshold,
  };

  return addSecurityHeaders(
    NextResponse.json({ success: true, quiz, locked })
  );
}

export const GET = withAuth(handler);
