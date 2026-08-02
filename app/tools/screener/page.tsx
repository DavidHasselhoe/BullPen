'use client';

import { useState, useCallback, useMemo, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, keepPreviousData } from '@tanstack/react-query';
import { useDebounce } from '@/hooks/use-debounce';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Filter, RefreshCw } from 'lucide-react';
import {
  ScreenerFilters,
  EMPTY_FILTERS,
  type ScreenerFilterValues,
} from '@/components/screener/ScreenerFilters';
import { ScreenerResults } from '@/components/screener/ScreenerResults';
import { ScreenerViewBar, type ActiveView } from '@/components/screener/ScreenerViewBar';
import { ScreenerSearchBar } from '@/components/screener/ScreenerSearchBar';
import { ScreenerViewStockPicker } from '@/components/screener/ScreenerViewStockPicker';
import { ColumnChooser } from '@/components/screener/ColumnChooser';
import { useScreenerColumns } from '@/hooks/use-screener-columns';
import { useHeatmapStream } from '@/hooks/use-heatmap-stream';
import { useWatchlist, useWatchlistItems } from '@/hooks/use-watchlist';
import { useHoldings } from '@/hooks/use-holdings';
import { useScreenerViews, useUpdateScreenerView, type ScreenerView } from '@/hooks/use-screener-views';
import { useAuth } from '@/hooks/use-auth';
import { isAdmin, tierFromUser } from '@/lib/billing/tier';
import type { ScreenerRow } from '@/app/api/screener/route';

export const dynamic = 'force-dynamic';

const FILTER_KEYS = Object.keys(EMPTY_FILTERS) as (keyof ScreenerFilterValues)[];
const BILLION_KEYS = new Set(['marketCapMin', 'marketCapMax']);
// Filters applied client-side only (derived from the live stream) — never sent
// to /api/screener, so they don't pollute the server query or its cache key.
const CLIENT_ONLY_KEYS = new Set<keyof ScreenerFilterValues>(['rvolMin']);

function filtersFromParams(sp: URLSearchParams): ScreenerFilterValues {
  const f = { ...EMPTY_FILTERS };
  for (const key of FILTER_KEYS) {
    const val = sp.get(key);
    if (val) f[key] = val;
  }
  return f;
}

function buildQueryString(filters: ScreenerFilterValues, symbols: string | null, scope?: string): string {
  const params = new URLSearchParams();
  if (symbols) params.set('symbols', symbols);
  if (scope) params.set('scope', scope);
  for (const key of FILTER_KEYS) {
    const val = filters[key];
    if (!val) continue;
    if (CLIENT_ONLY_KEYS.has(key)) continue; // applied client-side, not server-side
    if (BILLION_KEYS.has(key)) {
      const n = parseFloat(val);
      if (isFinite(n)) params.set(key, String(n * 1e9));
    } else {
      params.set(key, val);
    }
  }
  return params.toString();
}

function viewToParam(view: ActiveView): string {
  if (view.type === 'all') return 'all';
  if (view.type === 'sp500') return 'sp500';
  if (view.type === 'holdings') return 'holdings';
  if (view.type === 'watchlist') return view.listId ? `watchlist:${view.listId}` : 'watchlist';
  return view.view.id;
}

function paramToView(param: string | null, customViews: ScreenerView[]): ActiveView {
  if (!param || param === 'sp500') return { type: 'sp500' };
  if (param === 'all') return { type: 'all' };
  if (param === 'holdings') return { type: 'holdings' };
  if (param === 'watchlist') return { type: 'watchlist', listId: null };
  if (param.startsWith('watchlist:')) return { type: 'watchlist', listId: param.slice(10) };
  const found = customViews.find((v) => v.id === param);
  if (found) return { type: 'custom', view: found };
  return { type: 'sp500' };
}

function ScreenerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const userIsAdmin = isAdmin(tierFromUser(user?.account_tier, user?.role));

  const [filters, setFilters] = useState<ScreenerFilterValues>(() => filtersFromParams(searchParams));
  // Debounced copy — drives the query key and URL so typing doesn't re-fetch on every keystroke
  const debouncedFilters = useDebounce(filters, 350);
  const [refreshStatus, setRefreshStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const { data: customViews = [] } = useScreenerViews();
  const [activeView, setActiveView] = useState<ActiveView>({ type: 'sp500' });
  // Ad-hoc "cherry pick" search — when non-empty, overrides the view and shows just these tickers.
  const [pickedTickers, setPickedTickers] = useState<string[]>([]);
  const updateView = useUpdateScreenerView();
  const screenerColumns = useScreenerColumns();

  // Restore active view from URL once custom views are loaded
  useEffect(() => {
    const viewParam = searchParams.get('view');
    if (viewParam) setActiveView(paramToView(viewParam, customViews));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customViews.length]);

  // Sync active view object when views list updates (e.g. after rename)
  useEffect(() => {
    if (activeView.type === 'custom') {
      const updated = customViews.find((v) => v.id === activeView.view.id);
      if (updated && updated.name !== activeView.view.name) {
        setActiveView({ type: 'custom', view: updated });
      }
    }
  }, [customViews, activeView]);

  // Company universe for stock picker search — cached from full screener load
  const universeRef = useRef<ScreenerRow[]>([]);

  // Holdings data (for "My Holdings" view)
  const { data: userHoldings = [] } = useHoldings();

  // Watchlist data
  const { data: allWatchlistItems = [] } = useWatchlist();
  const watchlistListId = activeView.type === 'watchlist' ? activeView.listId : null;
  const { data: listItems = [] } = useWatchlistItems(watchlistListId);

  // Symbol allowlist based on active view.
  // Picked tickers (the search bar) take precedence over the view — the user is
  // cherry-picking an explicit set, so show exactly those.
  const symbolsFilter = useMemo((): string | null => {
    if (pickedTickers.length > 0) return pickedTickers.join(',');
    if (activeView.type === 'sp500') return null;
    if (activeView.type === 'holdings') {
      const symbols = [...new Set(userHoldings.map((h) => h.symbol))];
      return symbols.length > 0 ? symbols.join(',') : '__none__';
    }
    if (activeView.type === 'watchlist') {
      const items = watchlistListId ? listItems : allWatchlistItems;
      return items.length > 0 ? items.map((i) => i.symbol).join(',') : '__none__';
    }
    if (activeView.type === 'custom') {
      return activeView.view.tickers.length > 0
        ? activeView.view.tickers.join(',')
        : '__none__';
    }
    return null;
  }, [pickedTickers, activeView, userHoldings, allWatchlistItems, listItems, watchlistListId]);

  const qs = useMemo(
    () => buildQueryString(
      debouncedFilters,
      symbolsFilter === '__none__' ? null : symbolsFilter,
      // Scope only applies to the unfiltered list views, never when cherry-picking.
      pickedTickers.length > 0
        ? undefined
        : activeView.type === 'all'
          ? 'all'
          : activeView.type === 'sp500'
            ? 'sp500'
            : undefined,
    ),
    [debouncedFilters, symbolsFilter, activeView.type, pickedTickers.length]
  );

  const { data, isLoading, isFetching, refetch } = useQuery<{
    success: boolean;
    results: ScreenerRow[];
    sectors: string[];
    industries: string[];
    total: number;
    universeSize: number;
    financialsLoaded: number;
    stale: boolean;
  }>({
    queryKey: ['screener', qs],
    queryFn: async () => {
      if (symbolsFilter === '__none__') {
        return { success: true, results: [], sectors: [], industries: [], total: 0, universeSize: 0, financialsLoaded: 0, stale: false };
      }
      const url = `/api/screener${qs ? `?${qs}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch screener data');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  // Cache company universe whenever we have a full market set loaded
  useEffect(() => {
    if ((activeView.type === 'sp500' || activeView.type === 'all') && data?.results && data.results.length > 10) {
      universeRef.current = data.results;
    }
  }, [activeView.type, data?.results]);

  // Ensure the company universe is loaded so the search bar can resolve names →
  // tickers. The sp500/all views populate it from their own results; for every
  // other view (holdings, watchlist, custom) fetch it silently once.
  const needsUniverse =
    universeRef.current.length === 0 &&
    activeView.type !== 'sp500' &&
    activeView.type !== 'all';
  const { data: fetchedUniverse } = useQuery({
    queryKey: ['screener-universe'],
    queryFn: async () => {
      const res = await fetch('/api/screener?scope=all');
      if (!res.ok) throw new Error();
      const d = await res.json();
      universeRef.current = d.results ?? [];
      return (d.results ?? []) as ScreenerRow[];
    },
    enabled: needsUniverse,
    staleTime: 10 * 60 * 1000,
  });
  // The search bar reads this so it re-renders when the universe arrives.
  const universe = universeRef.current.length > 0 ? universeRef.current : (fetchedUniverse ?? []);

  const { mutate: triggerRefresh, isPending: isRefreshing } = useMutation({
    mutationFn: async (batch: number): Promise<{
      success: boolean; nextBatch: number | null; totalBatches: number; refreshed: number; batch: number; done: boolean;
    }> => {
      const res = await fetch(`/api/screener/refresh?batch=${batch}`, { method: 'POST' });
      if (!res.ok) throw new Error('Refresh failed');
      return res.json();
    },
    onSuccess: (result) => {
      setRefreshStatus(`Refreshed batch ${result.batch + 1}/${result.totalBatches} (${result.refreshed} companies)`);
      if (result.nextBatch !== null) {
        setTimeout(() => triggerRefresh(result.nextBatch!), 65_000);
      } else {
        setRefreshStatus('Screener data refreshed successfully');
        refetch();
      }
    },
    onError: () => setRefreshStatus('Refresh failed — check console'),
  });

  // Keep a stable ref to activeView so the URL-sync effect doesn't need it as a dep
  const activeViewRef = useRef(activeView);
  activeViewRef.current = activeView;

  // Stable ref to debouncedFilters — used to detect externally-driven URL changes
  const debouncedFiltersRef = useRef(debouncedFilters);
  debouncedFiltersRef.current = debouncedFilters;

  // When the AI (or any external source) navigates to the screener with new URL params,
  // searchParams updates reactively but filters/view state doesn't. Detect the mismatch
  // and sync state so the grid reloads without a manual page refresh.
  useEffect(() => {
    const newFilters = filtersFromParams(searchParams);
    const filtersChanged = FILTER_KEYS.some(k => newFilters[k] !== debouncedFiltersRef.current[k]);
    if (filtersChanged) {
      setFilters(newFilters);
      setPage(1);
    }

    const viewParam = searchParams.get('view');
    const currentViewParam = viewToParam(activeViewRef.current);
    if ((viewParam ?? 'sp500') !== currentViewParam) {
      setActiveView(paramToView(viewParam ?? '', customViews));
      setPage(1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Sync URL after debounce settles — skip the very first render (URL is already correct)
  const isFirstFilterSync = useRef(true);
  useEffect(() => {
    if (isFirstFilterSync.current) { isFirstFilterSync.current = false; return; }
    const params = new URLSearchParams();
    const viewParam = viewToParam(activeViewRef.current);
    if (viewParam !== 'sp500') params.set('view', viewParam);
    for (const key of FILTER_KEYS) {
      if (debouncedFilters[key]) params.set(key, debouncedFilters[key]);
    }
    router.replace(params.toString() ? `?${params.toString()}` : window.location.pathname, { scroll: false });
   
  }, [debouncedFilters, router]);

  const handleFilterChange = useCallback((next: ScreenerFilterValues) => {
    setFilters(next);
    setPage(1);
  }, []);

  const handleReset = useCallback(() => handleFilterChange({ ...EMPTY_FILTERS }), [handleFilterChange]);

  const handleViewChange = useCallback((view: ActiveView) => {
    setActiveView(view);
    setPage(1);
    const params = new URLSearchParams();
    const viewParam = viewToParam(view);
    if (viewParam !== 'sp500') params.set('view', viewParam);
    for (const key of FILTER_KEYS) {
      if (filters[key]) params.set(key, filters[key]);
    }
    router.replace(params.toString() ? `?${params.toString()}` : window.location.pathname, { scroll: false });
  }, [router, filters]);

  // Add a ticker to the active custom view
  const handleAddTicker = useCallback(async (ticker: string) => {
    if (activeView.type !== 'custom') return;
    const current = activeView.view.tickers;
    if (current.includes(ticker)) return;
    const updated = [...current, ticker];
    try {
      const result = await updateView.mutateAsync({ id: activeView.view.id, tickers: updated });
      setActiveView({ type: 'custom', view: result });
    } catch {}
  }, [activeView, updateView]);

  const results = data?.results ?? [];
  const sectors = data?.sectors ?? [];
  const industries = data?.industries ?? [];
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const { prices: livePrices, session: marketSession, connected } = useHeatmapStream();

  const isCustomView = activeView.type === 'custom';
  const customViewEmpty = isCustomView && symbolsFilter === '__none__';

  return (
    <div className="w-full px-4 py-8">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center gap-3 mb-1 flex-wrap">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Filter className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Stock Screener</h1>
          {!isLoading && !customViewEmpty && (
            <Badge variant="secondary" className="text-xs">
              {data?.total ?? 0} result{(data?.total ?? 0) !== 1 ? 's' : ''}
            </Badge>
          )}
          <span className="flex items-center gap-1 text-xs font-medium">
            {!connected ? (
              <>
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <span className="text-amber-500">Connecting…</span>
              </>
            ) : marketSession === 'regular' ? (
              <>
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-emerald-500">Live</span>
              </>
            ) : marketSession === 'pre' ? (
              <>
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                <span className="text-amber-400">Pre-market</span>
              </>
            ) : marketSession === 'post' ? (
              <>
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                <span className="text-amber-400">After-hours</span>
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                <span className="text-muted-foreground/80">Closed</span>
              </>
            )}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {refreshStatus && <span className="text-xs text-muted-foreground">{refreshStatus}</span>}
            <ColumnChooser columns={screenerColumns} />
            {userIsAdmin && (
              <Button
                variant="outline" size="sm"
                onClick={() => { setRefreshStatus('Starting refresh…'); triggerRefresh(0); }}
                disabled={isRefreshing}
                className="gap-1.5 h-8 text-xs"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Refreshing…' : 'Refresh Data'}
              </Button>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {pickedTickers.length > 0
            ? `Comparing ${pickedTickers.length} cherry-picked stock${pickedTickers.length !== 1 ? 's' : ''}. Clear the search to return to your view.`
            : activeView.type === 'all'
              ? `Every stock in BullPen's database — ${data?.total ?? '…'} tickers with live prices and fundamental data.`
              : activeView.type === 'sp500'
                ? 'Screen the full S&P 500 with live prices and fundamental data.'
                : activeView.type === 'holdings'
                  ? `Screening your ${userHoldings.length} held position${userHoldings.length !== 1 ? 's' : ''}.`
                  : activeView.type === 'watchlist'
                    ? 'Screening your watchlist.'
                    : `Screening "${activeView.view.name}"`}
        </p>
      </div>

      {/* Cherry-pick search */}
      <div className="mb-3">
        <ScreenerSearchBar
          universe={universe}
          value={pickedTickers}
          onChange={(next) => { setPickedTickers(next); setPage(1); }}
        />
      </div>

      {/* View bar — dimmed while cherry-picking since picks override the view */}
      <div className={cn('mb-5 transition-opacity', pickedTickers.length > 0 && 'opacity-40 pointer-events-none')}>
        <ScreenerViewBar activeView={activeView} onViewChange={handleViewChange} />
      </div>

      <div className="flex gap-4">
        {/* Sidebar filters — always visible */}
        <Card className="w-56 flex-shrink-0 hidden lg:block self-start sticky top-20">
          <CardContent className="p-4">
            {isLoading && !customViewEmpty ? (
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
                industries={industries}
                onChange={handleFilterChange}
                onReset={handleReset}
                visibleColumnKeys={new Set(screenerColumns.visibleColumns.map((c) => c.key))}
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
                      industries={industries}
                      onChange={handleFilterChange}
                      onReset={handleReset}
                    />
                  </div>
                </details>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Results — pb/pr give clearance for the fixed AI Assistant button */}
        <div className="flex-1 min-w-0 pb-20 sm:pr-40">
          {/* Empty custom view — stock picker inline in the normal results area */}
          {customViewEmpty && isCustomView ? (
            <div className="rounded-md border border-border/40 overflow-hidden">
              {/* Table header row */}
              <div className="px-3 py-2.5 border-b border-border/30 bg-muted/10">
                <span className="text-xs font-medium text-muted-foreground">Company</span>
              </div>
              {/* Empty body with inline picker */}
              <div className="px-3 py-6">
                <ScreenerViewStockPicker
                  view={activeView.view}
                  universe={universeRef.current}
                  onAdd={handleAddTicker}
                  hasStocks={false}
                />
              </div>
            </div>
          ) : isLoading ? (
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
            <div className={isFetching ? 'opacity-60 transition-opacity duration-150' : 'transition-opacity duration-150'}>
              <ScreenerResults
                data={results}
                livePrices={livePrices}
                visibleColumns={screenerColumns.visibleColumns}
                rvolMin={debouncedFilters.rvolMin ? parseFloat(debouncedFilters.rvolMin) : undefined}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(sz) => { setPageSize(sz); setPage(1); }}
              />
              {/* Inline add row — only for custom views with stocks */}
              {isCustomView && (
                <ScreenerViewStockPicker
                  view={activeView.view}
                  universe={universeRef.current}
                  onAdd={handleAddTicker}
                  hasStocks={results.length > 0}
                />
              )}
            </div>
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
        <div className="w-full px-4 py-8">
          <Skeleton className="h-8 w-48 mb-6" />
          <div className="flex gap-4">
            <Skeleton className="w-56 h-[600px] hidden lg:block" />
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
