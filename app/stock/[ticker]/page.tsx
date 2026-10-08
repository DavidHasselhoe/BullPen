/**
 * Stock page shell.
 *
 * The page itself is a client component (StockPageClient) — it has to be, since
 * nearly everything on it is interactive. What this server component adds is the
 * snapshot: price, statistics and earnings, fetched here and handed to the client
 * already resolved.
 *
 * Before this, the browser downloaded the page, hydrated (~950ms in production),
 * and only then asked for the snapshot, which took another 1.3-1.8s. Prices
 * appeared somewhere north of two seconds after the page did. Now they are in
 * the first render, and the client's useStockSnapshot finds them already in the
 * query cache instead of fetching.
 *
 * loading.tsx keeps this from costing anything visible: the shell streams
 * immediately while this waits on the snapshot.
 */

import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { buildSnapshot } from '@/lib/stock/snapshot';
import { slugToSymbol } from '@/lib/assets/asset-type';
import { getSectorPeers } from '@/lib/market-data/stock-directory';
import { SectorPeers } from '@/components/stock/SectorPeers';
import StockPageClient from './StockPageClient';

export default async function StockPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker: rawTicker } = await params;
  // Must match the key useStockSnapshot builds on the client, which upper-cases
  // the route param before using it — a mismatch would silently prefetch into a
  // key nothing reads.
  const ticker = rawTicker.toUpperCase();

  const queryClient = new QueryClient();
  // Started now, awaited after the snapshot: neither waits on the other, and
  // a failure only costs the row, never the page.
  const peersPromise = getSectorPeers(ticker).catch(() => null);
  try {
    await queryClient.prefetchQuery({
      queryKey: ['stock-snapshot', ticker],
      queryFn: () => buildSnapshot(slugToSymbol(ticker)),
    });
  } catch {
    // A failed prefetch is not a failed page: the client hook will ask for it
    // itself, exactly as it did before this existed.
  }

  const peers = await peersPromise;

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <StockPageClient />
      {peers && (
        // Lines up with the main column: lg:px-8 plus the 160px nav and 32px gap at xl.
        <div className="mx-auto max-w-[1520px] px-4 pb-12 sm:px-6 lg:px-8 xl:pl-[224px]">
          <SectorPeers sector={peers.sector} peers={peers.peers} />
        </div>
      )}
    </HydrationBoundary>
  );
}
