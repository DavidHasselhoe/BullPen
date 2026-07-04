'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { useWatchlist, useWatchlistLists, useWatchlistItems, useAddToWatchlist, useRemoveFromWatchlist, useCreateWatchlistList } from '@/hooks/use-watchlist';
import { useAlerts } from '@/hooks/use-alerts';
import { useWatchlistEnhanced } from '@/hooks/use-watchlist-enhanced';
import { WatchlistListTabs } from '@/components/watchlist/WatchlistListTabs';
import { useDebounce } from '@/hooks/use-debounce';
import { useLivePrices } from '@/hooks/use-live-prices';
import { WatchlistCard } from '@/components/watchlist/WatchlistCard';
import { WatchlistTable } from '@/components/watchlist/WatchlistTable';
import { WatchlistTemplatesDialog } from '@/components/watchlist/WatchlistTemplatesDialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { AuthGate } from '@/components/ui/AuthGate';
import Link from 'next/link';
import { Bookmark, Search, Plus, Radio, TrendingUp, LayoutGrid, List, Sparkles } from 'lucide-react';
import { fetchWithTimeout } from '@/lib/utils';
import { cn } from '@/lib/utils';

type ViewMode = 'grid' | 'table';

function isRegularSession(): boolean {
  const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = nowET.getDay();
  if (day === 0 || day === 6) return false;
  const mins = nowET.getHours() * 60 + nowET.getMinutes();
  return mins >= 570 && mins < 960; // 9:30 AM – 4:00 PM ET
}

function useIsRegularSession(): boolean {
  const [open, setOpen] = useState(isRegularSession);
  useEffect(() => {
    const id = setInterval(() => setOpen(isRegularSession()), 60_000);
    return () => clearInterval(id);
  }, []);
  return open;
}

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
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'grid';
    const saved = localStorage.getItem('watchlist-view') as ViewMode | null;
    return saved === 'grid' || saved === 'table' ? saved : 'grid';
  });
  const debouncedQuery = useDebounce(searchQuery, 280);

  function switchView(mode: ViewMode) {
    setViewMode(mode);
    localStorage.setItem('watchlist-view', mode);
  }

  // selectedListId is the user's explicit choice; activeListId derives the first list
  // as the default once loaded, avoiding a useEffect-driven setState.
  const isLive = useIsRegularSession();
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const { data: watchlist, isLoading: watchlistLoading } = useWatchlist();
  const { data: lists, isLoading: listsLoading } = useWatchlistLists();
  const activeListId = selectedListId ?? (lists?.[0]?.id ?? null);
  const { data: listItems, isLoading: listItemsLoading } = useWatchlistItems(activeListId);
  const addMutation = useAddToWatchlist();
  const removeMutation = useRemoveFromWatchlist();
  const createListMutation = useCreateWatchlistList();
  const { create: createAlert, alerts } = useAlerts();

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

  // Sparkline charts — today's 5min candles for every watched symbol
  const { data: sparklinesData } = useQuery({
    queryKey: ['watchlist-sparklines', allSymbols.join(',')],
    queryFn: async (): Promise<Record<string, number[]>> => {
      if (allSymbols.length === 0) return {};
      const res = await fetch(`/api/watchlist/sparklines?symbols=${encodeURIComponent(allSymbols.join(','))}`);
      if (!res.ok) return {};
      const data = await res.json();
      return data.sparklines ?? {};
    },
    enabled: allSymbols.length > 0,
    staleTime: 2 * 60_000,
    refetchInterval: 5 * 60_000,
  });

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

  const handleAdd = async (result: SearchResult) => {
    let listId = activeListId ?? undefined;

    // No list exists yet — auto-create "Watchlist 1" so list_id NOT NULL is satisfied
    if (!listId) {
      const res = await createListMutation.mutateAsync({ name: 'Watchlist 1', color: null });
      if (res.success && res.list) {
        listId = res.list.id;
        setSelectedListId(listId);
      }
    }

    addMutation.mutate({ symbol: result.ticker, company_name: result.name, listId });

    // Auto-create default price alerts for this stock if none exist yet.
    // Best-effort — limit hits or failures are silently ignored.
    const sym = result.ticker.toUpperCase();
    const hasAlerts = alerts.some((a) => a.symbol === sym);
    if (!hasAlerts) {
      const defaults: Array<{ alertType: Parameters<typeof createAlert>[0]['alertType']; threshold: number }> = [
        { alertType: 'all_time_high',   threshold: 0 },
        { alertType: 'near_52w_high',   threshold: 0 },
        { alertType: 'near_52w_low',    threshold: 0 },
        { alertType: 'pct_change_up',   threshold: 0.03 },
      ];
      for (const { alertType, threshold } of defaults) {
        createAlert({ symbol: sym, companyName: result.name, alertType, threshold });
      }
    }

    setSearchQuery('');
    setShowDropdown(false);
  };

  const alreadyWatched = new Set((watchlist ?? []).map((w) => w.symbol));

  if (!isAuthenticated) {
    return (
      <AuthGate
        icon={<Bookmark className="h-7 w-7" />}
        title="Sign in to use Watchlist"
        description="Track your favourite stocks and get alerts when prices move."
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Bookmark className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 mb-0.5">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">Watchlist</h1>
                {isLive && livePrices.size > 0 && (
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
          </div>

          {/* Toolbar: templates + view toggle + search */}
          <div className="flex items-center gap-2">
            {/* Starter watchlists */}
            <button
              onClick={() => setTemplatesOpen(true)}
              className="flex items-center gap-1.5 h-9 rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Add a starter watchlist"
            >
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">Templates</span>
            </button>
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
            onSelect={setSelectedListId}
            onListCreated={(id) => setSelectedListId(id)}
            onListDeleted={(id) => {
              // If we deleted the active list, fall back to the first remaining list
              if (selectedListId === id) setSelectedListId(null);
            }}
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/illustrations/bull-shrug.png"
              alt=""
              aria-hidden
              className="h-auto w-36 select-none opacity-90 dark:opacity-80 dark:invert"
            />
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
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={() => setTemplatesOpen(true)}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3.5 py-2 text-sm font-medium text-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-primary transition-colors"
              >
                <Sparkles className="h-4 w-4" />
                Start from a template
              </button>
              <Link
                href="/discover"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <TrendingUp className="h-3.5 w-3.5" />
                Browse Hot Picks on Discover
              </Link>
            </div>
          </div>
        ) : viewMode === 'table' ? (
          <WatchlistTable
            items={displayItems}
            quotes={Object.fromEntries(
              displayItems.map((item) => {
                const live = livePrices.get(item.symbol);
                const seed = seedQuotes?.[item.symbol];
                // A live tick before prevClose is seeded carries undefined change/%
                // — fall back to the seed quote so the column never blanks to 0.
                return [item.symbol, live
                  ? {
                      price: live.price,
                      change: live.change ?? seed?.change ?? 0,
                      changePercent: live.changePercent ?? seed?.changePercent ?? 0,
                    }
                  : seed ?? null];
              })
            )}
            enhancedData={enhancedData}
            onRemove={(sym) => removeMutation.mutate({ symbol: sym, listId: activeListId })}
            isRemoving={(sym) => removeMutation.isPending && removeMutation.variables?.symbol === sym}
          />
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {displayItems.map((item) => {
              const live = livePrices.get(item.symbol);
              const seed = seedQuotes?.[item.symbol];
              const quote = live
                ? {
                    price: live.price,
                    change: live.change ?? seed?.change ?? 0,
                    changePercent: live.changePercent ?? seed?.changePercent ?? 0,
                  }
                : seed ?? null;
              const enhanced = enhancedData?.[item.symbol];
              return (
                <WatchlistCard
                  key={item.symbol}
                  symbol={item.symbol}
                  company_name={item.company_name}
                  quote={quote}
                  alerts_enabled={item.alerts_enabled}
                  onRemove={(sym) => removeMutation.mutate({ symbol: sym, listId: activeListId })}
                  isRemoving={removeMutation.isPending && removeMutation.variables?.symbol === item.symbol}
                  healthScore={enhanced?.healthScore}
                  nextEarningsDate={enhanced?.nextEarningsDate}
                  daysToEarnings={enhanced?.daysToEarnings}
                  thesisSentiment={enhanced?.thesisSentiment}
                  sparkline={sparklinesData?.[item.symbol]}
                />
              );
            })}
          </div>
        )}

        <WatchlistTemplatesDialog
          open={templatesOpen}
          onOpenChange={setTemplatesOpen}
          onCreated={(id) => setSelectedListId(id)}
        />
      </div>
    </div>
  );
}
