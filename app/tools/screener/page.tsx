'use client';

import { useState, useCallback, useMemo, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Filter, RefreshCw, Radio } from 'lucide-react';
import {
  ScreenerFilters,
  EMPTY_FILTERS,
  type ScreenerFilterValues,
} from '@/components/screener/ScreenerFilters';
import { ScreenerResults } from '@/components/screener/ScreenerResults';
import { useLivePrices } from '@/hooks/use-live-prices';
import type { ScreenerRow } from '@/app/api/screener/route';
import { SCREENER_UNIVERSE } from '@/lib/market-data/screener-universe';

export const dynamic = 'force-dynamic';

const FILTER_KEYS = Object.keys(EMPTY_FILTERS) as (keyof ScreenerFilterValues)[];

/** Market cap filters: client sends billions, API expects raw */
const BILLION_KEYS = new Set(['marketCapMin', 'marketCapMax']);

function filtersFromParams(sp: URLSearchParams): ScreenerFilterValues {
  const f = { ...EMPTY_FILTERS };
  for (const key of FILTER_KEYS) {
    const val = sp.get(key);
    if (val) f[key] = val;
  }
  return f;
}

function buildQueryString(filters: ScreenerFilterValues): string {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const val = filters[key];
    if (!val) continue;
    if (BILLION_KEYS.has(key)) {
      const n = parseFloat(val);
      if (isFinite(n)) params.set(key, String(n * 1e9));
    } else {
      params.set(key, val);
    }
  }
  return params.toString();
}

function isStale(rows: ScreenerRow[]): boolean {
  if (rows.length === 0) return true;
  const oldest = rows.reduce(
    (min, r) => (r.updated_at < min ? r.updated_at : min),
    rows[0].updated_at,
  );
  const ageMs = Date.now() - new Date(oldest).getTime();
  return ageMs > 24 * 60 * 60 * 1000; // stale after 24h
}

function ScreenerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<ScreenerFilterValues>(() =>
    filtersFromParams(searchParams),
  );
  const [refreshBatch, setRefreshBatch] = useState<number | null>(null);
  const [refreshStatus, setRefreshStatus] = useState<string>('');

  const qs = useMemo(() => buildQueryString(filters), [filters]);

  const { data, isLoading, refetch } = useQuery<{
    success: boolean;
    results: ScreenerRow[];
    sectors: string[];
    total: number;
    stale: boolean;
  }>({
    queryKey: ['screener', qs],
    queryFn: async () => {
      const url = `/api/screener${qs ? `?${qs}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch screener data');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  // Auto-refresh if cache is empty or stale on first load
  const needsRefresh = !isLoading && (data?.stale || (data?.results?.length === 0));

  const { mutate: triggerRefresh, isPending: isRefreshing } = useMutation({
    mutationFn: async (batch: number) => {
      const res = await fetch(`/api/screener/refresh?batch=${batch}`, { method: 'POST' });
      if (!res.ok) throw new Error('Refresh failed');
      return res.json() as Promise<{
        success: boolean;
        nextBatch: number | null;
        totalBatches: number;
        refreshed: number;
        batch: number;
        done: boolean;
      }>;
    },
    onSuccess: (result) => {
      setRefreshStatus(
        `Refreshed batch ${result.batch + 1}/${result.totalBatches} (${result.refreshed} companies)`
      );
      if (result.nextBatch !== null) {
        // Throttle: wait 65s between batches to stay under the 610 credit/min limit
        setTimeout(() => setRefreshBatch(result.nextBatch), 65_000);
      } else {
        setRefreshBatch(null);
        setRefreshStatus('Screener data refreshed successfully');
        refetch();
      }
    },
    onError: () => {
      setRefreshBatch(null);
      setRefreshStatus('Refresh failed — check console');
    },
  });

  useEffect(() => {
    if (needsRefresh && refreshBatch === null && !isRefreshing) {
      setRefreshBatch(0);
    }
  }, [needsRefresh, refreshBatch, isRefreshing]);

  useEffect(() => {
    if (refreshBatch !== null && !isRefreshing) {
      triggerRefresh(refreshBatch);
    }
  }, [refreshBatch, isRefreshing, triggerRefresh]);

  // Kick off manual refresh from the beginning
  const startManualRefresh = () => {
    setRefreshBatch(0);
    setRefreshStatus('Starting refresh…');
  };

  const handleChange = useCallback(
    (next: ScreenerFilterValues) => {
      setFilters(next);
      const params = new URLSearchParams();
      for (const key of FILTER_KEYS) {
        if (next[key]) params.set(key, next[key]);
      }
      const newUrl = params.toString()
        ? `?${params.toString()}`
        : window.location.pathname;
      router.replace(newUrl, { scroll: false });
    },
    [router],
  );

  const handleReset = useCallback(() => handleChange({ ...EMPTY_FILTERS }), [handleChange]);

  const results = data?.results ?? [];
  const sectors = data?.sectors ?? [];
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  // Live prices for ALL screener universe symbols (they're already subscribed via WsManager)
  const livePrices = useLivePrices(SCREENER_UNIVERSE);
  const liveCount = livePrices.size;

  return (
    <div className="container mx-auto px-4 py-8 max-w-[1400px]">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1 flex-wrap">
          <Filter className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">Stock Screener</h1>
          {!isLoading && (
            <Badge variant="secondary" className="text-xs">
              {data?.total ?? 0} result{(data?.total ?? 0) !== 1 ? 's' : ''}
            </Badge>
          )}
          {liveCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-emerald-500 font-medium">
              <Radio className="h-3 w-3 animate-pulse" />
              {liveCount} live
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {refreshStatus && (
              <span className="text-xs text-muted-foreground">{refreshStatus}</span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={startManualRefresh}
              disabled={isRefreshing}
              className="gap-1.5 h-8 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing…' : 'Refresh Data'}
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Filter companies by live market statistics. Prices stream in real time via TwelveData.
        </p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar filters */}
        <Card className="w-64 flex-shrink-0 hidden lg:block self-start sticky top-20">
          <CardContent className="p-4">
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <Skeleton className="h-3 w-20" />
                    <div className="flex gap-2">
                      <Skeleton className="h-8 flex-1" />
                      <Skeleton className="h-8 flex-1" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <ScreenerFilters
                filters={filters}
                sectors={sectors}
                onChange={handleChange}
                onReset={handleReset}
              />
            )}
          </CardContent>
        </Card>

        {/* Mobile filters */}
        <div className="lg:hidden mb-4 w-full">
          <Card>
            <CardContent className="p-4">
              {isLoading ? (
                <Skeleton className="h-8 w-full" />
              ) : (
                <details className="group">
                  <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                    <Filter className="h-4 w-4" />
                    Filters
                    {activeFilterCount > 0 && (
                      <Badge variant="secondary" className="text-xs">{activeFilterCount}</Badge>
                    )}
                  </summary>
                  <div className="mt-4">
                    <ScreenerFilters
                      filters={filters}
                      sectors={sectors}
                      onChange={handleChange}
                      onReset={handleReset}
                    />
                  </div>
                </details>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Results */}
        <div className="flex-1 min-w-0">
          {isLoading || (isRefreshing && results.length === 0) ? (
            <Card>
              <CardContent className="p-4">
                <div className="space-y-3">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <ScreenerResults data={results} livePrices={livePrices} />
          )}
        </div>
      </div>
    </div>
  );
}

export default function ScreenerPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto px-4 py-8 max-w-[1400px]">
          <Skeleton className="h-8 w-48 mb-6" />
          <div className="flex gap-6">
            <Skeleton className="w-64 h-[600px] hidden lg:block" />
            <div className="flex-1 space-y-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </div>
        </div>
      }
    >
      <ScreenerContent />
    </Suspense>
  );
}
