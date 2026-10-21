'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { useLivePrices } from '@/hooks/use-live-prices';
import { humanizeError } from '@/lib/errors/humanize';
import { LivePriceContext } from './LivePriceContext';
import { DiscoverHeader } from './DiscoverHeader';
import { MarketPulse } from './MarketPulse';
import { MarketMovers } from './MarketMovers';
import { SectorPerformance } from './SectorPerformance';
import { ThemeGrid } from './ThemeGrid';
import { IdeaCollections } from './IdeaCollections';
import { WeeklyPickHero, CURRENT_PICK_QUERY } from '@/components/picks/WeeklyPickHero';
import { InstitutionalHoldingsSection } from '@/components/institutions/InstitutionalHoldingsSection';
import { CongressSection } from '@/components/congress/CongressSection';
import type { DiscoverFeed } from '@/lib/discover/discover-config';
import { DISCOVER_FEED_KEY } from '@/lib/discover/query-keys';

/**
 * Discover: read the market in ten seconds, then find one thing worth researching.
 *
 * The page reads top-to-bottom as a funnel of decreasing commitment — one
 * high-conviction pick, then how the market feels, then which names moved it,
 * then where money moved, then specific names to dig into. Home is only about
 * the user's own holdings and watchlist (2026-09-29), so market-wide movers
 * live here.
 */
export function DiscoverClient() {
  const { t } = useTranslation('discover');
  // Shares its query key with WeeklyPickHero, so this is the same single
  // request — read here only to fold the pick's symbol into the SSE list below.
  const { data: pickData } = useQuery(CURRENT_PICK_QUERY);

  const { data, isLoading, error, refetch } = useQuery<{ success: boolean; feed?: DiscoverFeed }>({
    queryKey: DISCOVER_FEED_KEY,
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

  const feed = data?.feed;
  // Only these three sections are built from the feed. Everything else on the
  // page fetches its own data, so nothing waits on the feed any more: before,
  // the whole page sat on a skeleton until it landed and only then mounted the
  // sections, whose requests started a full round trip late. The server
  // prefetch (app/discover/(home)/page.tsx) normally means the feed is already here.
  const feedError = !isLoading && (error || !feed);

  return (
    <LivePriceContext.Provider value={livePrices}>
      <DiscoverHeader />
      <WeeklyPickHero />
      {feed ? <MarketPulse indices={feed.indices} /> : isLoading && <PulseSkeleton />}
      {feedError && (
        <div className="mb-10 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/5 p-6">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" aria-hidden />
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t('discoverClientLoadError')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{humanizeError(error)}</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-3 inline-flex min-h-[36px] items-center rounded-md border border-border/60 px-3 text-sm text-foreground transition-colors hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('discoverRetry')}
            </button>
          </div>
        </div>
      )}
      <MarketMovers />
      {feed ? <SectorPerformance sectors={feed.sectors} /> : isLoading && <SectorSkeleton />}
      <ThemeGrid />
      {feed ? <IdeaCollections collections={feed.collections} /> : isLoading && <CollectionsSkeleton />}
      <InstitutionalHoldingsSection preview />
      <CongressSection preview />
    </LivePriceContext.Provider>
  );
}

/**
 * Placeholders that reserve each feed band's height so the page doesn't
 * shift as data lands (Core Web Vitals: CLS). DiscoverSkeleton is the whole
 * first screen, for app/discover/loading.tsx.
 */
function PulseSkeleton() {
  return (
    <div aria-hidden className="mb-10">
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
  );
}

function SectorSkeleton() {
  return (
    <div aria-hidden className="mb-10">
      <div className="mb-3 h-3.5 w-40 rounded animate-shimmer" />
      <div className="h-[452px] rounded-xl border border-border/20 animate-shimmer" />
    </div>
  );
}

function CollectionsSkeleton() {
  return (
    <div aria-hidden className="mb-10">
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

export function DiscoverSkeleton() {
  return (
    <div aria-hidden>
      <div className="mb-8">
        <div className="mb-2 h-7 w-40 rounded animate-shimmer" />
        <div className="h-3.5 w-96 max-w-full rounded animate-shimmer" />
      </div>
      <PulseSkeleton />
      <SectorSkeleton />
      <CollectionsSkeleton />
    </div>
  );
}
