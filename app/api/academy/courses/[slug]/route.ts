/**
 * GET /api/academy/courses/[slug]
 * Returns one course with its lessons and the current user's per-lesson completion flags.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import type { Course, LessonType, LessonWithCompletion } from '@/types/academy';

interface CourseRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  order_index: number;
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
    .select('id, slug, title, description, icon, color, order_index')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle<CourseRow>();

  if (!course) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Course not found' }, { status: 404 })
    );
  }

  const [lessonsRes, lessonProgressRes, courseProgressRes] = await Promise.all([
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
  ]);

  const lessonRows = (lessonsRes.data ?? []) as LessonRow[];
  const completedIds = new Set(
    (lessonProgressRes.data ?? []).map((r: { lesson_id: string }) => r.lesson_id)
  );

  const lessons: LessonWithCompletion[] = lessonRows.map((l) => ({
    id: l.id,
    courseId: l.course_id,
    slug: l.slug,
    title: l.title,
    type: l.type,
    orderIndex: l.order_index,
    xpReward: l.xp_reward,
    content: l.content as LessonWithCompletion['content'],
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
  };

  return addSecurityHeaders(
    NextResponse.json({
      success: true,
      course: courseDto,
      lessons,
      progress: courseProgressRes.data ?? null,
    })
  );
}

export const GET = withAuth(handler);
