import type { Metadata } from 'next';
import { createServerClient } from '@/lib/supabase/client';

/**
 * page.tsx is a client component (progress tracking, interactive lesson
 * state), so this sibling server layout carries the metadata. Unlike stock/
 * asset pages, /academy/* is NOT excluded in robots.ts — course content is
 * genuinely indexable, evergreen educational material, so this one is a
 * real SEO surface, not just a tab-title nicety.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ courseSlug: string }>;
}): Promise<Metadata> {
  const { courseSlug } = await params;
  const supabase = createServerClient();

  const { data } = await supabase
    .from('academy_courses')
    .select('title, description')
    .eq('slug', courseSlug)
    .eq('is_published', true)
    .maybeSingle<{ title: string; description: string | null }>();

  if (!data) return {};

  return {
    title: data.title,
    description:
      data.description ||
      `Learn ${data.title} in BullPen Academy, free investing courses for beginner-to-intermediate investors.`,
  };
}

export default function CourseLayout({ children }: { children: React.ReactNode }) {
  return children;
}
