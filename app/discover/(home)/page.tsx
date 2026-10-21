/**
 * Discover shell.
 *
 * The page itself is a client component (DiscoverPageClient). What this server
 * component adds is the first screen's data: the feed (index strip, sectors,
 * idea collections) and Bull's Weekly Pick, fetched here and handed to the
 * client's query cache already resolved.
 *
 * Before this (Lighthouse mobile, 2026-10-21: 58/100, LCP 5.8s), the browser
 * downloaded and ran the JS, only then asked for the feed, and every section
 * waited behind it. Now the feed and pick are in the first render; the
 * sections that fetch their own data start as soon as they mount.
 *
 * A failed prefetch is not a failed page: dehydrate() only carries successful
 * queries, so the client fetches anything missing itself, exactly as before.
 * loading.tsx streams the skeleton while this waits. It sits in this (home)
 * route group so it covers /discover only: at app/discover it would also
 * stand in for /discover/institutions and the other subpages.
 */

import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { getCurrentUserId } from '@/lib/auth/server-session';
import { buildDiscoverFeed } from '@/lib/discover/feed';
import { getCurrentPick } from '@/lib/picks/current';
import { CURRENT_PICK_KEY, DISCOVER_FEED_KEY } from '@/lib/discover/query-keys';
import DiscoverPageClient from './DiscoverPageClient';

export default async function DiscoverPage() {
  const userId = await getCurrentUserId().catch(() => null);
  const queryClient = new QueryClient();
  // Same shapes the client's queryFns get from /api/discover/feed and
  // /api/picks/current, so the cache entries are interchangeable.
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: DISCOVER_FEED_KEY,
      queryFn: async () => ({ success: true, feed: await buildDiscoverFeed(userId) }),
    }),
    queryClient.prefetchQuery({
      queryKey: CURRENT_PICK_KEY,
      queryFn: () => getCurrentPick(userId ? { userId } : null),
    }),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DiscoverPageClient />
    </HydrationBoundary>
  );
}
