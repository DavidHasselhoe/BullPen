'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { useLivePrices } from '@/hooks/use-live-prices';
import { humanizeError } from '@/lib/errors/humanize';
import { LivePriceContext } from './LivePriceContext';
import { DiscoverHeader } from './DiscoverHeader';
import { MarketPulse } from './MarketPulse';
import { SectorPerformance } from './SectorPerformance';
import { IdeaCollections } from './IdeaCollections';
import { WeeklyPickHero, CURRENT_PICK_QUERY } from '@/components/picks/WeeklyPickHero';
import type { DiscoverFeed } from '@/lib/discover/discover-config';

const FEED_QUERY_KEY = ['discover-feed'];

/**
 * Discover: read the market in ten seconds, then find one thing worth researching.
 *
 * The page reads top-to-bottom as a funnel of decreasing commitment — one
 * high-conviction pick, then how the market feels, then where money moved, then
 * specific names to dig into. The dashboard already owns the personalised daily
 * check-in, so movers and news deliberately live there and not here.
 */
export function DiscoverClient() {
  // Shares its query key with WeeklyPickHero, so this is the same single
  // request — read here only to fold the pick's symbol into the SSE list below.
  const { data: pickData } = useQuery(CURRENT_PICK_QUERY);

  const { data, isLoading, error } = useQuery<{ success: boolean; feed?: DiscoverFeed }>({
    queryKey: FEED_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch('/api/discover/feed');
      if (!res.ok) throw new Error(`Feed failed: ${res.status}`);
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // One SSE subscription for everything visible on load. Sector constituents
  // aren't included — they mount behind a click and carry their own seeded
  // quote, so subscribing to 132 symbols nobody has opened would be exactly the
  // waste this redesign set out to remove.
  const allSymbols = useMemo(() => {
    const set = new Set<string>();
    const pickSymbol = pickData?.pick?.symbol;
    if (pickSymbol) set.add(pickSymbol);

    const feed = data?.feed;
    if (feed) {
      for (const item of feed.collections.trending.items) set.add(item.symbol);
      for (const item of feed.collections.qualityDiscount) set.add(item.symbol);
      for (const item of feed.collections.near52High) set.add(item.symbol);
      for (const item of feed.collections.near52Low) set.add(item.symbol);
    }
    return [...set];
  }, [data, pickData]);

  const livePrices = useLivePrices(allSymbols);

  if (isLoading) return <DiscoverSkeleton />;

  if (error || !data?.feed) {
    return (
      <>
        <DiscoverHeader />
        <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/5 p-6">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" aria-hidden />
          <div>
            <h2 className="text-sm font-semibold text-foreground">Couldn&apos;t load the market</h2>
            <p className="mt-1 text-sm text-muted-foreground">{humanizeError(error)}</p>
          </div>
        </div>
      </>
    );
  }

  const { feed } = data;

  return (
    <LivePriceContext.Provider value={livePrices}>
      <DiscoverHeader />
      <WeeklyPickHero />
      <MarketPulse indices={feed.indices} />
      <SectorPerformance sectors={feed.sectors} />
      <IdeaCollections collections={feed.collections} />
    </LivePriceContext.Provider>
  );
}

/**
 * Reserves the height of each band so the page doesn't shift as data lands
 * (Core Web Vitals: CLS).
 */
function DiscoverSkeleton() {
  return (
    <div aria-hidden>
      <div className="mb-8">
        <div className="mb-2 h-7 w-40 rounded animate-shimmer" />
        <div className="h-3.5 w-96 max-w-full rounded animate-shimmer" />
      </div>

      {/* Market pulse */}
      <div className="mb-10">
        <div className="mb-3 h-3.5 w-28 rounded animate-shimmer" />
        <div className="grid gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-[92px] rounded-xl border border-border/20 animate-shimmer" />
            ))}
          </div>
          <div className="h-[104px] rounded-xl border border-border/20 animate-shimmer" />
        </div>
      </div>

      {/* Sector chart */}
      <div className="mb-10">
        <div className="mb-3 h-3.5 w-40 rounded animate-shimmer" />
        <div className="h-[452px] rounded-xl border border-border/20 animate-shimmer" />
      </div>

      {/* Collections */}
      <div className="mb-4 h-3.5 w-28 rounded animate-shimmer" />
      <div className="space-y-8">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i}>
            <div className="mb-3 h-3.5 w-44 rounded animate-shimmer" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {Array.from({ length: 6 }, (_, j) => (
                <div key={j} className="h-[100px] rounded-xl border border-border/20 animate-shimmer" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
