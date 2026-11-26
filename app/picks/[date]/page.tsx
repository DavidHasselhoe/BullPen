export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { getPickRowByDate, toDetail } from '@/lib/picks/picks-db';
import { resolveThesisAccess } from '@/lib/picks/thesis-access';
import { livePerformanceFor } from '@/lib/picks/performance';
import { getCurrentUserId } from '@/lib/auth/server-session';
import PickDetailClient from './PickDetailClient';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// generateMetadata and the page share one read per request.
const loadRow = cache(getPickRowByDate);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date } = await params;
  const pick = DATE_RE.test(date) ? await loadRow(date).catch(() => null) : null;
  return {
    title: pick ? `${pick.symbol}: Bull's Pick for ${date}` : `Bull's Pick for ${date}`,
    description: pick?.one_liner ?? "Bull's Weekly Pick: the thesis, the entry price, and the tracked result.",
    alternates: { canonical: `/picks/${date}` },
  };
}

/**
 * The pick is loaded here, with the visitor's own thesis access, and handed to
 * the client already in its query cache. Until 2026-11-26 the client fetched
 * /api/picks/[date] itself, and robots.txt disallows /api/, so search engines
 * (Google's renderer included) saw a title over an empty page. Same data and
 * access rules as that route.
 *
 * A date with no pick is a real 404, not a 200 page saying so. A failed load
 * (database down) is not: the client is left to fetch, as before.
 */
export default async function PickDetailPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!DATE_RE.test(date)) notFound();
  const row = await loadRow(date).catch(() => undefined);
  if (row === null) notFound();

  const queryClient = new QueryClient();
  if (row) {
    await queryClient.prefetchQuery({
      queryKey: ['pick-detail', date],
      queryFn: async () => {
        const userId = await getCurrentUserId();
        const [access, perf] = await Promise.all([
          resolveThesisAccess(userId ? { userId } : null, row.pick_date, row.model),
          livePerformanceFor(row),
        ]);
        return { success: true, pick: toDetail(row, perf, access) };
      },
    });
  }
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PickDetailClient date={date} />
    </HydrationBoundary>
  );
}
