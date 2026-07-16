/**
 * GET /api/academy/courses
 * Lists published courses with the user's per-course completion percentage
 * and locked state (sequential unlock by order_index).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { getTier, isPro } from '@/lib/billing/tier';
import type { CourseWithProgress } from '@/types/academy';

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
}

async function handler(
  _req: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const supabase = createServerClient();

  const [coursesRes, lessonsRes, lessonProgressRes, courseProgressRes, tier] = await Promise.all([
    supabase
      .from('academy_courses')
      .select('id, slug, title, description, icon, color, order_index, difficulty, requires_pro, is_optional')
      .eq('is_published', true)
      .order('order_index'),
    supabase
      .from('academy_lessons')
      .select('id, course_id'),
    supabase
      .from('academy_user_lesson_progress')
      .select('lesson_id')
      .eq('user_id', session.userId),
    supabase
      .from('academy_user_course_progress')
      .select('course_id, completed_at')
      .eq('user_id', session.userId),
    getTier(session.userId),
  ]);

  const userIsPro = isPro(tier);

  const courses = (coursesRes.data ?? []) as CourseRow[];
  const lessons = (lessonsRes.data ?? []) as Array<{ id: string; course_id: string }>;
  const completedLessonIds = new Set(
    (lessonProgressRes.data ?? []).map((r: { lesson_id: string }) => r.lesson_id)
  );
  const completedCourseIds = new Set(
    (courseProgressRes.data ?? [])
      .filter((r: { completed_at: string | null }) => r.completed_at !== null)
      .map((r: { course_id: string }) => r.course_id)
  );

  // Tally lessons per course
  const lessonsByCourse = new Map<string, string[]>();
  for (const l of lessons) {
    const arr = lessonsByCourse.get(l.course_id) ?? [];
    arr.push(l.id);
    lessonsByCourse.set(l.course_id, arr);
  }

  const result: CourseWithProgress[] = courses.map((c, idx) => {
    const courseLessonIds = lessonsByCourse.get(c.id) ?? [];
    const total = courseLessonIds.length;
    const done = courseLessonIds.filter((id) => completedLessonIds.has(id)).length;
    const percentComplete = total > 0 ? Math.round((done / total) * 100) : 0;

    // Sequential unlock: course at idx 0 always unlocked; course N unlocked once
    // course N-1 is fully completed.
    const prevCourse = idx > 0 ? courses[idx - 1] : null;
    const progressionLocked = prevCourse !== null && !completedCourseIds.has(prevCourse.id);
    const proLocked = c.requires_pro && !userIsPro;
    // 'pro' wins the messaging even if progression would also lock it — upgrading
    // is the action that actually unblocks the user, so that's what we tell them.
    const lockedReason: 'progression' | 'pro' | null = proLocked
      ? 'pro'
      : progressionLocked
        ? 'progression'
        : null;

    return {
      id: c.id,
      slug: c.slug,
      title: c.title,
      description: c.description ?? '',
      icon: c.icon ?? 'BookOpen',
      color: c.color ?? 'emerald',
      orderIndex: c.order_index,
      difficulty: c.difficulty,
      requiresPro: c.requires_pro,
      isOptional: c.is_optional,
      totalLessons: total,
      completedLessons: done,
      percentComplete,
      isLocked: lockedReason !== null,
      lockedReason,
      isCompleted: completedCourseIds.has(c.id),
    };
  });

  return addSecurityHeaders(NextResponse.json({ success: true, courses: result }));
}

export const GET = withAuth(handler);
