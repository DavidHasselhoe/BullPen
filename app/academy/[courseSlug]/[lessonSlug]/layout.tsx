import type { Metadata } from 'next';
import { createServerClient } from '@/lib/supabase/client';

/** Same reasoning as the course-level layout one segment up. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ courseSlug: string; lessonSlug: string }>;
}): Promise<Metadata> {
  const { courseSlug, lessonSlug } = await params;
  const supabase = createServerClient();

  const { data: course } = await supabase
    .from('academy_courses')
    .select('id, title')
    .eq('slug', courseSlug)
    .eq('is_published', true)
    .maybeSingle<{ id: string; title: string }>();

  if (!course) return {};

  const { data: lesson } = await supabase
    .from('academy_lessons')
    .select('title')
    .eq('course_id', course.id)
    .eq('slug', lessonSlug)
    .maybeSingle<{ title: string }>();

  if (!lesson) return {};

  return {
    // Root layout's title.template ("%s | BullPen") doesn't reliably chain
    // through two levels of nested segment layouts — verified live: the
    // course layout one level up gets the suffix, this one didn't. Spelling
    // it out here instead of depending on that inheritance.
    title: `${lesson.title} | BullPen`,
    description: `Part of the ${course.title} course on BullPen Academy. Learn investing fundamentals for free.`,
  };
}

export default function LessonLayout({ children }: { children: React.ReactNode }) {
  return children;
}
