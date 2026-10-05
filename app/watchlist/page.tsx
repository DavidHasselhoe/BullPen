'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/use-auth';
import { useWatchlist, useWatchlistLists, useWatchlistItems, useAddToWatchlist, useRemoveFromWatchlist, useCreateWatchlistList } from '@/hooks/use-watchlist';
import { useWatchlistEnhanced } from '@/hooks/use-watchlist-enhanced';
import { WatchlistListTabs } from '@/components/watchlist/WatchlistListTabs';
import { useInstantSearch } from '@/hooks/use-symbol-index';
import { useLivePrices } from '@/hooks/use-live-prices';
import { WatchlistCard } from '@/components/watchlist/WatchlistCard';
import { WatchlistTable } from '@/components/watchlist/WatchlistTable';
import { WatchlistTemplatesDialog } from '@/components/watchlist/WatchlistTemplatesDialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { AuthGate } from '@/components/ui/AuthGate';
import Link from 'next/link';
import { Bookmark, Search, Plus, Radio, TrendingUp, LayoutGrid, List, Sparkles, Check } from 'lucide-react';
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
  [symbol: string]: { price: number; change: number; changePercent: number; stale?: boolean };
}

export default function WatchlistPage() {
  const { t } = useTranslation('watchlist');
  const { isAuthenticated } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'grid';
    const saved = localStorage.getItem('watchlist-view') as ViewMode | null;
    return saved === 'grid' || saved === 'table' ? saved : 'grid';
  });

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
  // Last removal, for the Undo bar. Cleared after a few seconds.
  const [removed, setRemoved] = useState<{ symbol: string; company_name: string; listId: string | null } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);
  const [highlight, setHighlight] = useState(0);

  // Items to display: per-list when a list is active, otherwise all
  const displayItems = activeListId ? (listItems ?? []) : (watchlist ?? []);
  const displayLoading = activeListId ? listItemsLoading : watchlistLoading;

  // Company search for adding stocks — local catalogue first, server behind it.
  const { results: searchResults, isSettled: searchSettled } = useInstantSearch(searchQuery, 6);

  // Live price stream for all watchlist symbols via WsManager SSE
  const allSymbols = (watchlist ?? []).map((w) => w.symbol);
  const livePrices = useLivePrices(allSymbols);
  const { data: enhancedData } = useWatchlistEnhanced(allSymbols);

  // Sparkline charts: today's 5min candles, or the last full session while today is still empty
  const { data: sparklinesResult } = useQuery({
    queryKey: ['watchlist-sparklines', allSymbols.join(',')],
    queryFn: async (): Promise<{ sparklines: Record<string, number[]>; previousSession: string[] }> => {
      const empty = { sparklines: {}, previousSession: [] };
      if (allSymbols.length === 0) return empty;
      const res = await fetch(`/api/watchlist/sparklines?symbols=${encodeURIComponent(allSymbols.join(','))}`);
      if (!res.ok) return empty;
      const data = await res.json();
      return { sparklines: data.sparklines ?? {}, previousSession: data.previousSession ?? [] };
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

    // No alerts are created here. Adding used to set four price alerts per
    // stock, which silently filled a free account's alert slots (5 stocks).
    // Alerts are opt-in through the bell on each card.
    setSearchQuery('');
    setShowDropdown(false);
  };

  const alreadyWatched = new Set((watchlist ?? []).map((w) => w.symbol));

  // One click removes, so the bar below offers it back instead of a
  // confirmation in front of every removal.
  const handleRemove = (symbol: string) => {
    const item = displayItems.find((i) => i.symbol === symbol);
    removeMutation.mutate({ symbol, listId: activeListId });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setRemoved({ symbol, company_name: item?.company_name ?? symbol, listId: activeListId });
    undoTimer.current = setTimeout(() => setRemoved(null), 6000);
  };
  const undoRemove = () => {
    if (!removed) return;
    addMutation.mutate({ symbol: removed.symbol, company_name: removed.company_name, listId: removed.listId ?? undefined });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setRemoved(null);
  };

  const results = searchResults ?? [];
  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || results.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => (h + 1) % results.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => (h - 1 + results.length) % results.length); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[Math.min(highlight, results.length - 1)];
      if (r && !alreadyWatched.has(r.ticker)) handleAdd(r);
    } else if (e.key === 'Escape') setShowDropdown(false);
  };

  if (!isAuthenticated) {
    return (
      <AuthGate
        icon={<Bookmark className="h-7 w-7" />}
        title={t('watchlistSignInTitle')}
        description={t('watchlistSignInDescription')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-10 sm:px-6 lg:px-8 space-y-8">

        {/* Header: stacks on phones, where title + toolbar + a 288px search do not fit one row */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Bookmark className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 mb-0.5">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('watchlistPageTitle')}</h1>
                {isLive && livePrices.size > 0 && (
                  <span className="flex items-center gap-1 text-xs text-emerald-500 font-medium">
                    <Radio className="h-3 w-3 animate-pulse" />
                    {t('watchlistLiveLabel')}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {(displayItems.length) > 0
                  ? t('watchlistCountTracked', { count: displayItems.length })
                  : t('watchlistEmptyHint')}
              </p>
            </div>
          </div>

          {/* Toolbar: templates + view toggle + search */}
          <div className="flex w-full items-center gap-2 sm:w-auto">
            {/* Starter watchlists */}
            <button
              onClick={() => setTemplatesOpen(true)}
              className="flex items-center gap-1.5 h-9 rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title={t('watchlistTemplatesButtonTitle')}
              aria-label={t('watchlistTemplatesButtonTitle')}
            >
              <Sparkles className="h-4 w-4" />
              <span className="sr-only sm:not-sr-only">{t('watchlistTemplatesButtonLabel')}</span>
            </button>
            {/* View toggle */}
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => switchView('grid')}
                className={cn(
                  'p-2 transition-colors',
                  viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                )}
                aria-label={t('watchlistGridViewAriaLabel')}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => switchView('table')}
                className={cn(
                  'p-2 transition-colors',
                  viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                )}
                aria-label={t('watchlistTableViewAriaLabel')}
              >
                <List className="h-4 w-4" />
              </button>
            </div>

          {/* Search / Add */}
          <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setShowDropdown(true); setHighlight(0); }}
                onKeyDown={onSearchKey}
                role="combobox"
                aria-expanded={showDropdown && results.length > 0}
                aria-controls="watchlist-search-results"
                aria-activedescendant={showDropdown && results[highlight] ? `watchlist-result-${results[highlight].ticker}` : undefined}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                placeholder={t('watchlistSearchPlaceholder')}
                className="pl-9 pr-4"
              />
            </div>

            {/* Dropdown results */}
            {showDropdown && searchQuery.trim().length > 0 && (results.length > 0 || searchSettled) && (
              <div id="watchlist-search-results" role="listbox" className="absolute top-full left-0 right-0 mt-1 z-50 rounded-xl border border-border bg-popover shadow-lg overflow-hidden">
                {results.length === 0 ? (
                  <p className="px-3 py-2.5 text-sm text-muted-foreground">{t('watchlistSearchNoMatches', { query: searchQuery.trim() })}</p>
                ) : results.map((r, i) => {
                  const watched = alreadyWatched.has(r.ticker);
                  return (
                    <button
                      key={r.ticker}
                      id={`watchlist-result-${r.ticker}`}
                      role="option"
                      aria-selected={i === highlight}
                      onMouseDown={() => !watched && handleAdd(r)}
                      onMouseEnter={() => setHighlight(i)}
                      className={cn(
                        'flex items-center gap-3 w-full px-3 py-2.5 text-left text-sm transition-colors',
                        i === highlight && 'bg-accent',
                        watched && 'cursor-default'
                      )}
                      disabled={watched}
                    >
                      <span className="font-semibold text-foreground min-w-[48px]">{r.ticker}</span>
                      {/* clamp-ok: company name in a one-line result row */}
                      <span className="text-muted-foreground truncate flex-1">{r.name}</span>
                      {watched ? (
                        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                          <Check className="h-3.5 w-3.5" aria-hidden /> {t('watchlistSearchAdded')}
                        </span>
                      ) : (
                        <Plus className="h-3.5 w-3.5 text-primary shrink-0" aria-hidden />
                      )}
                    </button>
                  );
                })}
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
              src="/illustrations/bull-shrug.webp"
              alt=""
              aria-hidden
              className="h-auto w-36 select-none opacity-90 dark:opacity-80 dark:invert"
            />
            <div>
              <p className="text-base font-medium text-foreground">{t('watchlistEmptyTitle')}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {t('watchlistEmptySubtitle')}
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
                {t('watchlistStartFromTemplate')}
              </button>
              <Link
                href="/discover"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <TrendingUp className="h-3.5 w-3.5" />
                {t('watchlistBrowseHotPicks')}
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
            onRemove={handleRemove}
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
                  logo_url={item.logo_url}
                  quote={quote}
                  alerts_enabled={item.alerts_enabled}
                  onRemove={handleRemove}
                  isRemoving={removeMutation.isPending && removeMutation.variables?.symbol === item.symbol}
                  healthScore={enhanced?.healthScore}
                  nextEarningsDate={enhanced?.nextEarningsDate}
                  daysToEarnings={enhanced?.daysToEarnings}
                  thesisSentiment={enhanced?.thesisSentiment}
                  sparkline={sparklinesResult?.sparklines[item.symbol]}
                  sparklineIsPreviousSession={sparklinesResult?.previousSession.includes(item.symbol)}
                />
              );
            })}
          </div>
        )}

        {removed && (
          <div role="status" className="fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-popover px-4 py-2 text-sm shadow-lg md:bottom-8">
            <span className="text-foreground">{t('watchlistRemovedToast', { symbol: removed.symbol })}</span>
            <button type="button" onClick={undoRemove} className="font-semibold text-primary underline-offset-4 hover:underline">
              {t('watchlistUndo')}
            </button>
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
