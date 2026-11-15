/**
 * Dashboard shell.
 *
 * The dashboard itself stays a client component — it is almost entirely
 * interactive, per-user and live. What this server component adds is what is
 * needed above the fold: the index quotes behind the header's market line (one
 * shared 60 s Redis entry with Discover), the greeting, and the signed-in
 * account's holdings and watchlist, handed to the client's query cache
 * already resolved.
 *
 * Holdings and watchlist decide every card below them (which quotes, which
 * calendar rows, which stock gets "up close"). Fetched in the browser they
 * sat behind the profile, then a queued server action, then the quotes:
 * 3.4-13s before the last skeleton cleared on a production build
 * (2026-11-15). A failed prefetch is not a failed page: dehydrate() only
 * carries successful queries, and the client fetches the rest itself.
 *
 * loading.tsx streams the shell so this never costs a blank screen.
 */

import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { getMarketIndices } from '@/lib/discover/indices';
import { getInitialWelcome } from '@/lib/dashboard/initial-welcome';
import { getServerProfile } from '@/lib/auth/server-session';
import { getHoldings } from '@/lib/holdings/holdings-db';
import { listWatchlistItems } from '@/lib/watchlist/list-items';
import DashboardClient from './DashboardClient';

export default async function DashboardPage() {
  const queryClient = new QueryClient();
  // Started before the profile wait: they don't need it.
  const welcomePromise = getInitialWelcome();
  const indicesPromise = getMarketIndices().catch(() => []);
  const profile = await getServerProfile();

  // Individually non-fatal: no indices just means no market line.
  const [welcome, indices] = await Promise.all([
    welcomePromise,
    indicesPromise,
    // Same keys and shapes as useHoldings / useWatchlist (hooks/use-holdings.ts,
    // hooks/use-watchlist.ts). The profile id is JWT-verified by PostgREST.
    profile &&
      queryClient.prefetchQuery({
        queryKey: ['holdings', profile.id],
        queryFn: async () => {
          const result = await getHoldings(profile.id, { includeClosed: true });
          if (!result.success || !result.holdings) throw new Error(result.error);
          return result.holdings;
        },
      }),
    profile && queryClient.prefetchQuery({ queryKey: ['watchlist'], queryFn: () => listWatchlistItems(profile.id) }),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DashboardClient initialWelcome={welcome} indices={indices} />
    </HydrationBoundary>
  );
}
