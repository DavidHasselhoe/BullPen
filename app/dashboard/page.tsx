/**
 * Dashboard shell.
 *
 * The dashboard itself stays a client component — it is almost entirely
 * interactive, per-user and live. What this server component adds is the two
 * slowest things on it that are the same for everybody: top movers (1059ms in
 * production) and Hot Picks (746ms), both fetched here and handed over already
 * resolved.
 *
 * Neither depends on who is signed in, which is what makes them safe to render
 * on the server and to cache. Everything user-specific — holdings, watchlist,
 * the daily brief — still loads on the client where the session lives.
 *
 * loading.tsx streams the shell so this never costs a blank screen.
 */

import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { getEnrichedMovers } from '@/lib/market-data/movers-enriched';
import { getHotPicks } from '@/lib/discover/hot-picks';
import { HOT_PICKS_QUERY_KEY } from '@/lib/discover/hot-picks-query';
import DashboardClient from './DashboardClient';

export default async function DashboardPage() {
  const queryClient = new QueryClient();

  // Prefetched in parallel and individually non-fatal: a failure here just means
  // the client asks for that one itself, exactly as it did before.
  await Promise.allSettled([
    queryClient.prefetchQuery({
      // Must match useTopMoversWithStream(5, null) — ['market','movers','rest',limit,symbolsKey]
      // with an empty symbols key for the all-markets mode the dashboard
      // defaults to. Holdings mode is per-user and stays on the client.
      queryKey: ['market', 'movers', 'rest', 5, ''],
      queryFn: () => getEnrichedMovers(5, null),
    }),
    queryClient.prefetchQuery({
      queryKey: HOT_PICKS_QUERY_KEY,
      queryFn: () => getHotPicks(168, 8),
    }),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DashboardClient />
    </HydrationBoundary>
  );
}
