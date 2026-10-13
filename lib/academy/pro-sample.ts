import type { createServerClient } from '@/lib/supabase/client';

/**
 * Every Pro course's first lesson is a free sample: a free account can play it
 * and earn its XP before meeting the paywall. Until 2026-10-13 a Pro course was
 * a dead end for free users (the path linked straight to /upgrade), so nobody
 * saw what they would be paying for.
 *
 * "First" is the lowest order_index in the course. The course route serves its
 * content on the same rule (index 0 of the ordered lesson list).
 */
export async function isProSampleLesson(
  supabase: ReturnType<typeof createServerClient>,
  courseId: string,
  lessonId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('academy_lessons')
    .select('id')
    .eq('course_id', courseId)
    .order('order_index')
    .limit(1)
    .maybeSingle<{ id: string }>();
  return data?.id === lessonId;
}
