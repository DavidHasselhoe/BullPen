'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { useWatchlist, useWatchlistLists, useWatchlistItems, useAddToWatchlist, useRemoveFromWatchlist } from '@/hooks/use-watchlist';
import { useWatchlistEnhanced } from '@/hooks/use-watchlist-enhanced';
import { WatchlistListTabs } from '@/components/watchlist/WatchlistListTabs';
import { useDebounce } from '@/hooks/use-debounce';
import { useLivePrices } from '@/hooks/use-live-prices';
import { WatchlistCard } from '@/components/watchlist/WatchlistCard';
import { WatchlistTable } from '@/components/watchlist/WatchlistTable';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';
import { Bookmark, Search, Plus, Lock, Radio, TrendingUp, LayoutGrid, List } from 'lucide-react';
import { fetchWithTimeout } from '@/lib/utils';
import { cn } from '@/lib/utils';

type ViewMode = 'grid' | 'table';

interface SearchResult {
  ticker: string;
  name: string;
  exchange?: string;
  instrument_type?: string;
  logo_url?: string | null;
}

interface QuoteMap {
  [symbol: string]: { price: number; change: number; changePercent: number };
}

export default function WatchlistPage() {
  const { isAuthenticated } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const debouncedQuery = useDebounce(searchQuery, 280);

  useEffect(() => {
    const saved = localStorage.getItem('watchlist-view') as ViewMode | null;
    if (saved === 'grid' || saved === 'table') setViewMode(saved);
  }, []);

  function switchView(mode: ViewMode) {
    setViewMode(mode);
    localStorage.setItem('watchlist-view', mode);
  }

  const [activeListId, setActiveListId] = useState<string | null>(null);

  const { data: watchlist, isLoading: watchlistLoading } = useWatchlist();
  const { data: lists, isLoading: listsLoading } = useWatchlistLists();
  const { data: listItems, isLoading: listItemsLoading } = useWatchlistItems(activeListId);
  const addMutation = useAddToWatchlist();
  const removeMutation = useRemoveFromWatchlist();

  // Auto-select first list once lists load
  useEffect(() => {
    if (!activeListId && lists && lists.length > 0) {
      setActiveListId(lists[0].id);
    }
  }, [lists, activeListId]);

  // Items to display: per-list when a list is active, otherwise all
  const displayItems = activeListId ? (listItems ?? []) : (watchlist ?? []);
  const displayLoading = activeListId ? listItemsLoading : watchlistLoading;

  // Company search for adding stocks
  const { data: searchResults } = useQuery({
    queryKey: ['watchlist-search', debouncedQuery],
    queryFn: async (): Promise<SearchResult[]> => {
      if (debouncedQuery.length < 2) return [];
      const res = await fetchWithTimeout(`/api/search?q=${encodeURIComponent(debouncedQuery)}`, {}, 8000);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.results ?? []).slice(0, 6);
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 30_000,
  });

  // Live price stream for all watchlist symbols via WsManager SSE
  const allSymbols = (watchlist ?? []).map((w) => w.symbol);
  const livePrices = useLivePrices(allSymbols);
  const { data: enhancedData } = useWatchlistEnhanced(allSymbols);

  // Fallback batch fetch for all symbols (runs once on load, populates prices before WS ticks arrive)
  const { data: seedQuotes } = useQuery({
    queryKey: ['watchlist-seed-quotes', allSymbols.join(',')],
    queryFn: async (): Promise<QuoteMap> => {
      if (allSymbols.length === 0) return {};
      const res = await fetch('/api/quotes/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: allSymbols }),
      });
      if (!res.ok) return {};
      const data = await res.json();
      return data.quotes ?? {};
    },
    enabled: allSymbols.length > 0,
    staleTime: 5 * 60_000,
    refetchInterval: false,
  });

  const handleAdd = (result: SearchResult) => {
    addMutation.mutate({ symbol: result.ticker, company_name: result.name, listId: activeListId ?? undefined });
    setSearchQuery('');
    setShowDropdown(false);
  };

  const alreadyWatched = new Set((watchlist ?? []).map((w) => w.symbol));

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-sm w-full mx-4">
          <CardContent className="pt-8 pb-8 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <p className="font-semibold text-foreground">Sign in to use Watchlist</p>
            <p className="text-sm text-muted-foreground">Track your favourite stocks in one place.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Bookmark className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-bold text-foreground">Watchlist</h1>
              {livePrices.size > 0 && (
                <span className="flex items-center gap-1 text-xs text-emerald-500 font-medium">
                  <Radio className="h-3 w-3 animate-pulse" />
                  Live
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {(displayItems.length) > 0
                ? `${displayItems.length} stock${displayItems.length === 1 ? '' : 's'} tracked`
                : 'Add stocks you want to keep an eye on.'}
            </p>
          </div>

          {/* Toolbar: view toggle + search */}
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => switchView('grid')}
                className={cn(
                  'p-2 transition-colors',
                  viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                )}
                aria-label="Grid view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => switchView('table')}
                className={cn(
                  'p-2 transition-colors',
                  viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                )}
                aria-label="Table view"
              >
                <List className="h-4 w-4" />
              </button>
            </div>

          {/* Search / Add */}
          <div className="relative w-72">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setShowDropdown(true); }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                placeholder="Add a stock…"
                className="pl-9 pr-4"
              />
            </div>

            {/* Dropdown results */}
            {showDropdown && (searchResults?.length ?? 0) > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-xl border border-border bg-popover shadow-lg overflow-hidden">
                {searchResults!.map((r) => (
                  <button
                    key={r.ticker}
                    onMouseDown={() => handleAdd(r)}
                    className={cn(
                      'flex items-center gap-3 w-full px-3 py-2.5 text-left text-sm hover:bg-accent transition-colors',
                      alreadyWatched.has(r.ticker) && 'opacity-40 cursor-not-allowed'
                    )}
                    disabled={alreadyWatched.has(r.ticker)}
                  >
                    <span className="font-semibold text-foreground min-w-[48px]">{r.ticker}</span>
                    <span className="text-muted-foreground truncate flex-1">{r.name}</span>
                    {!alreadyWatched.has(r.ticker) && (
                      <Plus className="h-3.5 w-3.5 text-primary shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          </div>
        </div>

        {/* List tabs */}
        {!listsLoading && lists && lists.length > 0 && (
          <WatchlistListTabs
            lists={lists}
            activeListId={activeListId}
            onSelect={setActiveListId}
            onListCreated={(id) => setActiveListId(id)}
          />
        )}

        {/* Content */}
        {displayLoading ? (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : displayItems.length === 0 ? (
          <div className="flex flex-col items-center gap-6 py-20 text-center">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
              <Bookmark className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <div>
              <p className="text-base font-medium text-foreground">Nothing here yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Search above to add any stock, or get started with a few popular ones:
              </p>
            </div>
            {/* Quick-add suggestions */}
            <div className="flex flex-wrap justify-center gap-2">
              {[
                { ticker: 'AAPL', name: 'Apple Inc.' },
                { ticker: 'MSFT', name: 'Microsoft Corp.' },
                { ticker: 'TSLA', name: 'Tesla Inc.' },
                { ticker: 'NVDA', name: 'NVIDIA Corp.' },
              ].map((s) => (
                <button
                  key={s.ticker}
                  onMouseDown={() => !alreadyWatched.has(s.ticker) && handleAdd(s)}
                  disabled={alreadyWatched.has(s.ticker) || addMutation.isPending}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    'border-border bg-muted/50 hover:border-primary/50 hover:bg-primary/5 hover:text-primary',
                    'disabled:opacity-40 disabled:cursor-not-allowed'
                  )}
                >
                  <Plus className="h-3 w-3" />
                  {s.ticker}
                </button>
              ))}
            </div>
            <Link
              href="/"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              <TrendingUp className="h-3.5 w-3.5" />
              Browse Hot Picks on Discover
            </Link>
          </div>
        ) : viewMode === 'table' ? (
          <WatchlistTable
            items={displayItems}
            quotes={Object.fromEntries(
              displayItems.map((item) => {
                const live = livePrices.get(item.symbol);
                const seed = seedQuotes?.[item.symbol];
                return [item.symbol, live
                  ? { price: live.price, change: live.change, changePercent: live.changePercent }
                  : seed ?? null];
              })
            )}
            enhancedData={enhancedData}
            onRemove={(sym) => removeMutation.mutate(sym)}
            isRemoving={(sym) => removeMutation.isPending && removeMutation.variables === sym}
          />
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {displayItems.map((item) => {
              const live = livePrices.get(item.symbol);
              const seed = seedQuotes?.[item.symbol];
              const quote = live
                ? { price: live.price, change: live.change, changePercent: live.changePercent }
                : seed ?? null;
              const enhanced = enhancedData?.[item.symbol];
              return (
                <WatchlistCard
                  key={item.symbol}
                  symbol={item.symbol}
                  company_name={item.company_name}
                  quote={quote}
                  onRemove={(sym) => removeMutation.mutate(sym)}
                  isRemoving={removeMutation.isPending && removeMutation.variables === item.symbol}
                  healthScore={enhanced?.healthScore}
                  nextEarningsDate={enhanced?.nextEarningsDate}
                  daysToEarnings={enhanced?.daysToEarnings}
                  thesisSentiment={enhanced?.thesisSentiment}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
