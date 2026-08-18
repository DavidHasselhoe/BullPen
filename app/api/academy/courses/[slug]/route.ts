/**
 * GET /api/academy/courses/[slug]
 * Returns one course with its lessons and the current user's per-lesson completion flags.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { getTier, isPro } from '@/lib/billing/tier';
import type { Course, LessonType, LessonWithCompletion } from '@/types/academy';

interface CourseRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  order_index: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | null;
  requires_pro: boolean;
  is_optional: boolean;
  unit_label: string | null;
}

interface LessonRow {
  id: string;
  course_id: string;
  slug: string;
  title: string;
  type: LessonType;
  order_index: number;
  xp_reward: number;
  content: unknown;
}

async function handler(
  _req: NextRequest,
  context: { params: Promise<{ slug: string }> },
  session: { userId: string }
): Promise<NextResponse> {
  const { slug } = await context.params;
  const supabase = createServerClient();

  const { data: course } = await supabase
    .from('academy_courses')
    .select('id, slug, title, description, icon, color, order_index, difficulty, requires_pro, is_optional, unit_label')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle<CourseRow>();

  if (!course) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Course not found' }, { status: 404 })
    );
  }

  const tier = await getTier(session.userId);
  const locked = course.requires_pro && !isPro(tier);

  const [lessonsRes, lessonProgressRes, courseProgressRes, quizRes] = await Promise.all([
    supabase
      .from('academy_lessons')
      .select('id, course_id, slug, title, type, order_index, xp_reward, content')
      .eq('course_id', course.id)
      .order('order_index'),
    supabase
      .from('academy_user_lesson_progress')
      .select('lesson_id')
      .eq('user_id', session.userId),
    supabase
      .from('academy_user_course_progress')
      .select('last_lesson_id, completed_at, started_at')
      .eq('user_id', session.userId)
      .eq('course_id', course.id)
      .maybeSingle<{ last_lesson_id: string | null; completed_at: string | null; started_at: string }>(),
    supabase
      .from('academy_course_quizzes')
      .select('id')
      .eq('course_id', course.id)
      .maybeSingle<{ id: string }>(),
  ]);

  const lessonRows = (lessonsRes.data ?? []) as LessonRow[];
  const completedIds = new Set(
    (lessonProgressRes.data ?? []).map((r: { lesson_id: string }) => r.lesson_id)
  );

  // Locked (Pro-gated, non-Pro viewer): titles/types/XP stay visible as a
  // teaser, but the actual content never crosses the wire.
  const lessons: LessonWithCompletion[] = lessonRows.map((l) => ({
    id: l.id,
    courseId: l.course_id,
    slug: l.slug,
    title: l.title,
    type: l.type,
    orderIndex: l.order_index,
    xpReward: l.xp_reward,
    ...(locked ? {} : { content: l.content as LessonWithCompletion['content'] }),
    completed: completedIds.has(l.id),
  }));

  const courseDto: Course = {
    id: course.id,
    slug: course.slug,
    title: course.title,
    description: course.description ?? '',
    icon: course.icon ?? 'BookOpen',
    color: course.color ?? 'emerald',
    orderIndex: course.order_index,
    difficulty: course.difficulty,
    requiresPro: course.requires_pro,
    isOptional: course.is_optional,
    unitLabel: course.unit_label,
  };

  return addSecurityHeaders(
    NextResponse.json({
      success: true,
      course: courseDto,
      lessons,
      locked,
      progress: courseProgressRes.data ?? null,
      hasFinalQuiz: quizRes.data !== null,
    })
  );
}

export const GET = withAuth(handler);
