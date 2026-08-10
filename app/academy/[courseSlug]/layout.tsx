import type { Metadata } from 'next';
import { createServerClient } from '@/lib/supabase/client';

/**
 * page.tsx is a client component (progress tracking, interactive lesson
 * state), so this sibling server layout carries the metadata.
 *
 * Not excluded in robots.ts like /stock and /asset, but don't assume that
 * makes this a real SEO surface: app/academy/layout.tsx (one level up) is
 * itself a client component gated on useAuth(), and during SSR isLoading
 * is true before that resolves — confirmed live, an anonymous request to
 * an academy page returns a perfect <title> and an empty body, no lesson
 * content, no auth-gate copy either. A crawler sees nothing to index
 * regardless of robots.txt. This metadata is real for the same reason
 * stock/asset pages' is: tab titles and share-link previews for signed-in
 * users, not organic search — see the capacity report and CLAUDE.md
 * discussion around this for the bigger question of whether Academy should
 * ever have a publicly-viewable preview tier.
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
