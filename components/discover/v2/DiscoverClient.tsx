'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { useLivePrices } from '@/hooks/use-live-prices';
import { LivePriceContext } from './LivePriceContext';
import { DiscoverHeader } from './DiscoverHeader';
import { ToolShortcutsBar } from './ToolShortcutsBar';
import { ForYouRail } from './ForYouRail';
import { SectorRailsSection } from './SectorRailsSection';
import { AssetExplorerSection } from './AssetExplorerSection';
import type { DiscoverFeed } from '@/lib/discover/discover-config';

const FEED_QUERY_KEY = ['discover-feed'];

export function DiscoverClient() {
  const { data, isLoading, error } = useQuery<{ success: boolean; feed: DiscoverFeed }>({
    queryKey: FEED_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch('/api/discover/feed');
      if (!res.ok) throw new Error(`Feed failed: ${res.status}`);
      return res.json();
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Collect all unique symbols across every visible rail → single SSE subscription
  const allSymbols = useMemo(() => {
    if (!data?.feed) return [] as string[];
    const set = new Set<string>();
    for (const it of data.feed.forYou.items) set.add(it.symbol);
    for (const list of Object.values(data.feed.sectors)) for (const it of list) set.add(it.symbol);
    for (const list of Object.values(data.feed.etfs)) for (const it of list) set.add(it.symbol);
    for (const it of data.feed.commodities) set.add(it.symbol);
    for (const it of data.feed.crypto) set.add(it.symbol);
    // SSE endpoint caps at 600; we expect ~200, but slice defensively
    return [...set].slice(0, 600);
  }, [data]);

  const livePrices = useLivePrices(allSymbols);

  if (isLoading) return <DiscoverSkeleton />;

  if (error || !data?.feed) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-semibold text-foreground">Couldn&apos;t load the feed</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {error instanceof Error ? error.message : 'Please refresh the page.'}
          </p>
        </div>
      </div>
    );
  }

  const { feed } = data;

  return (
    <LivePriceContext.Provider value={livePrices}>
      <DiscoverHeader />
      <ToolShortcutsBar />

      <div className="space-y-12">
        <ForYouRail forYou={feed.forYou} />
        <SectorRailsSection sectors={feed.sectors} />
        <AssetExplorerSection etfs={feed.etfs} commodities={feed.commodities} crypto={feed.crypto} />
      </div>
    </LivePriceContext.Provider>
  );
}

// ── Skeleton: reserves the height every rail will take to prevent CLS ────────
function SkeletonRail() {
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-1.5 h-5 rounded-full bg-muted/40" />
        <div className="h-4 w-32 rounded bg-muted/40 animate-pulse" />
      </div>
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="w-[168px] h-[100px] rounded-xl border border-border/30 bg-card/30 animate-pulse shrink-0"
          />
        ))}
      </div>
    </div>
  );
}

function DiscoverSkeleton() {
  return (
    <>
      <div className="mb-8">
        <div className="h-7 w-40 bg-muted/40 rounded animate-pulse mb-2" />
        <div className="h-3.5 w-96 max-w-full bg-muted/30 rounded animate-pulse" />
      </div>
      <div className="mb-10">
        <div className="h-3.5 w-16 bg-muted/40 rounded mb-3" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-[110px] rounded-xl border border-border/30 bg-card/30 animate-pulse" />
          ))}
        </div>
      </div>
      <div className="space-y-12">
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonRail key={i} />
        ))}
      </div>
    </>
  );
}
