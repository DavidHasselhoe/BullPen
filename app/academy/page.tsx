import type { Metadata } from 'next';
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { listCoursesWithProgress } from '@/lib/academy/course-list';
import { getCurrentUserId } from '@/lib/auth/server-session';
import { AcademyHomeClient } from './AcademyHomeClient';

export const metadata: Metadata = {
  title: 'Academy',
  description: 'Learn to invest with free, bite-sized lessons on reading financial statements, valuation, portfolio risk, and more.',
  alternates: { canonical: '/academy' },
};

/**
 * The course list is loaded here and handed to the client in its query cache.
 * Until 2026-11-26 the client fetched /api/academy/courses itself, and
 * robots.txt disallows /api/, so search engines saw an empty catalog. A failed
 * load leaves the client to fetch, as before.
 */
export default async function AcademyHomePage() {
  const queryClient = new QueryClient();
  await queryClient.prefetchQuery({
    queryKey: ['academy-courses'],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      return listCoursesWithProgress(userId ? { userId } : null);
    },
  });
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AcademyHomeClient />
    </HydrationBoundary>
  );
}
