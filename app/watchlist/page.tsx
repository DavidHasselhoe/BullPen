'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { useWatchlist, useAddToWatchlist, useRemoveFromWatchlist, useToggleWatchlistAlert } from '@/hooks/use-watchlist';
import { useDebounce } from '@/hooks/use-debounce';
import { useLivePrices } from '@/hooks/use-live-prices';
import { WatchlistCard } from '@/components/watchlist/WatchlistCard';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Bookmark, Search, Plus, Lock, Radio } from 'lucide-react';
import { fetchWithTimeout } from '@/lib/utils';
import { cn } from '@/lib/utils';

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
  const debouncedQuery = useDebounce(searchQuery, 280);

  const { data: watchlist, isLoading: watchlistLoading } = useWatchlist();
  const addMutation = useAddToWatchlist();
  const removeMutation = useRemoveFromWatchlist();
  const toggleAlertMutation = useToggleWatchlistAlert();

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
  const symbols = (watchlist ?? []).map((w) => w.symbol);
  const livePrices = useLivePrices(symbols);

  // Fallback batch fetch (runs once on load, populates prices before WS ticks arrive)
  const { data: seedQuotes } = useQuery({
    queryKey: ['watchlist-seed-quotes', symbols.join(',')],
    queryFn: async (): Promise<QuoteMap> => {
      if (symbols.length === 0) return {};
      const res = await fetch('/api/quotes/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols }),
      });
      if (!res.ok) return {};
      const data = await res.json();
      return data.quotes ?? {};
    },
    enabled: symbols.length > 0,
    staleTime: 5 * 60_000,
    refetchInterval: false,
  });

  const handleAdd = (result: SearchResult) => {
    addMutation.mutate({ symbol: result.ticker, company_name: result.name });
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
              {(watchlist?.length ?? 0) > 0
                ? `${watchlist!.length} stock${watchlist!.length === 1 ? '' : 's'} tracked`
                : 'Add stocks you want to keep an eye on.'}
            </p>
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

        {/* Grid */}
        {watchlistLoading ? (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : (watchlist?.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center gap-4 py-24 text-center">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
              <Bookmark className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <div>
              <p className="text-base font-medium text-foreground">Nothing here yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Use the search above to add stocks to your watchlist.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {watchlist!.map((item) => {
              // Prefer live tick; fall back to seed batch quote
              const live = livePrices.get(item.symbol);
              const seed = seedQuotes?.[item.symbol];
              const quote = live
                ? {
                    price: live.price,
                    change: live.change ?? seed?.change ?? 0,
                    changePercent: live.changePercent ?? seed?.changePercent ?? 0,
                  }
                : seed ?? null;
              return (
                <WatchlistCard
                  key={item.symbol}
                  symbol={item.symbol}
                  company_name={item.company_name}
                  quote={quote}
                  alerts_enabled={item.alerts_enabled}
                  onRemove={(sym) => removeMutation.mutate(sym)}
                  onToggleAlert={(sym, enabled) => toggleAlertMutation.mutate({ symbol: sym, alerts_enabled: enabled })}
                  isRemoving={removeMutation.isPending && removeMutation.variables === item.symbol}
                  isTogglingAlert={toggleAlertMutation.isPending && toggleAlertMutation.variables?.symbol === item.symbol}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
