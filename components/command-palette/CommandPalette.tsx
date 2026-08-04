'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAIPanel } from '@/components/ai/AIPanelProvider';
import { useQuery } from '@tanstack/react-query';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { ProfileAvatar } from '@/components/user/ProfileAvatar';
import { useDebounce } from '@/hooks/use-debounce';
import { fetchWithTimeout } from '@/lib/utils';
import { Sparkles, Briefcase, Filter, TrendingUp, Scale, Users, Loader2, CornerDownLeft, Microscope, Bell } from 'lucide-react';
import { slugToAssetPath, inferAssetType } from '@/lib/assets/asset-type';
import type { PublicUser } from '@/app/api/users/search/route';

interface SearchResult {
  ticker: string;
  name: string;
  exchange?: string;
  country?: string;
  currency?: string;
  instrument_type?: string;
  cik: string;
  has_data: boolean;
  logo_url?: string | null;
}

interface SearchResponse {
  success: boolean;
  results?: SearchResult[];
  error?: string;
}


const QUICK_ACTIONS = [
  { id: 'ai', label: 'Ask BullPen AI', href: '/tools/ai-chat', icon: Sparkles, opensAIPanel: true },
  { id: 'holdings', label: 'My Holdings', href: '/holdings', icon: Briefcase },
  { id: 'screener', label: 'Stock Screener', href: '/tools/screener', icon: Filter },
  { id: 'discover', label: 'Discover', href: '/', icon: TrendingUp },
  { id: 'members', label: 'Browse Members', href: '/users', icon: Users },
];

/** Small keycap used in the footer hint bar. */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-border/70 bg-muted/60 px-1 font-sans text-[10px] font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}

/** The ↵ affordance that fades in on the currently-selected row. */
function ReturnHint() {
  return (
    <kbd className="ml-auto hidden h-[18px] items-center gap-0.5 rounded border border-border/70 bg-background/60 px-1 text-[10px] text-muted-foreground group-data-[selected=true]:flex">
      <CornerDownLeft className="h-2.5 w-2.5" />
    </kbd>
  );
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const { open: openAIPanel } = useAIPanel();
  const [searchQuery, setSearchQuery] = useState('');

  // 500 ms reduces intermediate API calls significantly for average typing speeds
  const debouncedQuery = useDebounce(searchQuery, 500);

  // Company search
  const {
    data: searchResults,
    isLoading: isSearching,
    error: searchError,
  } = useQuery({
    queryKey: ['command-palette-search', debouncedQuery],
    queryFn: async (): Promise<SearchResult[]> => {
      if (!debouncedQuery || debouncedQuery.trim().length < 2) return [];
      const response = await fetchWithTimeout(
        `/api/search?q=${encodeURIComponent(debouncedQuery)}`,
        {},
        8000
      );
      if (!response.ok) throw new Error('Search failed');
      const data: SearchResponse = await response.json();
      if (data.success && data.results) return data.results;
      return [];
    },
    enabled: debouncedQuery.trim().length >= 2,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });

  // People search (parallel to company search)
  const { data: peopleResults } = useQuery({
    queryKey: ['command-palette-people', debouncedQuery],
    queryFn: async (): Promise<PublicUser[]> => {
      if (!debouncedQuery || debouncedQuery.trim().length < 2) return [];
      const response = await fetchWithTimeout(
        `/api/users/search?q=${encodeURIComponent(debouncedQuery)}&limit=4`,
        {},
        8000
      );
      if (!response.ok) return [];
      const data: { success: boolean; results: PublicUser[] } = await response.json();
      return data.results ?? [];
    },
    enabled: debouncedQuery.trim().length >= 2,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });

  const handleSelectCompany = useCallback(
    async (result: SearchResult) => {
      onOpenChange(false);
      setSearchQuery('');
      router.push(slugToAssetPath(result.ticker));
    },
    [router, onOpenChange]
  );

  const handleQuickAction = useCallback(
    (action: (typeof QUICK_ACTIONS)[number]) => {
      onOpenChange(false);
      setSearchQuery('');
      if (action.opensAIPanel) {
        openAIPanel();
      } else {
        router.push(action.href);
      }
    },
    [router, onOpenChange, openAIPanel]
  );

  const handleAskAI = useCallback(
    (query?: string) => {
      onOpenChange(false);
      const q = (query || searchQuery).trim();
      openAIPanel({ query: q || undefined });
      setSearchQuery('');
    },
    [onOpenChange, searchQuery, openAIPanel]
  );

  const handleCompare = useCallback(
    (ticker: string) => {
      onOpenChange(false);
      setSearchQuery('');
      router.push(`/tools/compare?tickers=${encodeURIComponent(ticker)}`);
    },
    [router, onOpenChange]
  );

  const handleDeepDive = useCallback(
    (ticker: string) => {
      onOpenChange(false);
      setSearchQuery('');
      router.push(`/tools/deep-dive/${encodeURIComponent(ticker)}`);
    },
    [router, onOpenChange]
  );

  const handlePriceAlert = useCallback(
    (ticker: string, name: string) => {
      onOpenChange(false);
      setSearchQuery('');
      router.push(`/tools/alerts?symbol=${encodeURIComponent(ticker)}&name=${encodeURIComponent(name)}`);
    },
    [router, onOpenChange]
  );

  const hasQuery = searchQuery.trim().length >= 2;

  // Shared item styling — keeps every row visually consistent across groups.
  const itemClass =
    'group gap-3 rounded-lg px-2.5 py-2 text-sm data-[selected=true]:bg-accent';
  const pillClass =
    'shrink-0 rounded bg-muted px-1.5 py-px text-[10px] font-medium leading-tight text-muted-foreground/85';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[14vh] translate-y-0 gap-0 overflow-hidden rounded-2xl border-border/60 p-0 shadow-2xl shadow-black/30 sm:max-w-[640px]"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Command Palette</DialogTitle>
          <DialogDescription>Search companies, ask AI, or navigate</DialogDescription>
        </DialogHeader>
        <Command
          shouldFilter={false}
          className="rounded-2xl bg-popover [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:text-muted-foreground/85 [&_[data-slot=command-input-wrapper]]:h-14 [&_[data-slot=command-input-wrapper]]:gap-3 [&_[data-slot=command-input-wrapper]]:border-border/60 [&_[data-slot=command-input-wrapper]]:px-4 [&_[data-slot=command-input-wrapper]_svg]:size-[18px] [&_[data-slot=command-input-wrapper]_svg]:opacity-100 [&_[data-slot=command-input]]:text-[15px]"
        >
          <div className="relative">
            <CommandInput
              placeholder="Search companies, filings, metrics, or ask BullPen AI"
              value={searchQuery}
              onValueChange={setSearchQuery}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchResults && searchResults.length > 0) {
                  e.preventDefault();
                  handleSelectCompany(searchResults[0]);
                }
              }}
            />
            {/* Inline loading spinner — sits in the input row so the list never reflows */}
            {hasQuery && isSearching && (
              <Loader2 className="absolute right-4 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground/80" />
            )}
          </div>

          <CommandList className="h-[368px] max-h-[368px] px-1.5 pb-2">
            {!hasQuery ? (
              <>
                <CommandGroup heading="Quick actions">
                  {QUICK_ACTIONS.map((action) => {
                    const Icon = action.icon;
                    return (
                      <CommandItem
                        key={action.id}
                        value={action.id}
                        onSelect={() => handleQuickAction(action)}
                        className={itemClass}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground transition-colors group-data-[selected=true]:bg-primary/10 group-data-[selected=true]:text-foreground">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="flex-1 font-medium">{action.label}</span>
                        <ReturnHint />
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
                <p className="px-3 pt-2 text-center text-xs text-muted-foreground/80">
                  Search 10,000+ stocks, ETFs, crypto &amp; commodities — or ask in plain English.
                </p>
              </>
            ) : (
              <>
                {searchResults && searchResults.length > 0 ? (
                  <>
                    {(() => {
                      const CRYPTO_TYPES = new Set(['Digital Currency', 'Cryptocurrency']);
                      const COMMODITY_TYPES = new Set(['Commodity', 'Physical Currency']);
                      const stocks = searchResults.filter((r) => !CRYPTO_TYPES.has(r.instrument_type ?? '') && !COMMODITY_TYPES.has(r.instrument_type ?? ''));
                      const crypto = searchResults.filter((r) => CRYPTO_TYPES.has(r.instrument_type ?? ''));
                      const commodities = searchResults.filter((r) => COMMODITY_TYPES.has(r.instrument_type ?? ''));

                      const renderItem = (result: SearchResult) => (
                        <CommandItem
                          key={`${result.ticker}-${result.exchange ?? ''}`}
                          value={`${result.ticker} ${result.name}`}
                          onSelect={() => handleSelectCompany(result)}
                          className={itemClass}
                        >
                          <CompanyLogo
                            name={result.name}
                            ticker={result.ticker}
                            logoUrl={result.logo_url}
                            size={32}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-sm font-semibold tracking-tight">{result.ticker}</span>
                              {result.exchange && <span className={pillClass}>{result.exchange}</span>}
                              {result.instrument_type && result.instrument_type !== 'Common Stock' && (
                                <span className={pillClass}>{result.instrument_type}</span>
                              )}
                            </div>
                            <span className="block truncate text-xs text-muted-foreground">{result.name}</span>
                          </div>
                          <ReturnHint />
                        </CommandItem>
                      );

                      return (
                        <>
                          {crypto.length > 0 && (
                            <CommandGroup heading="Crypto">
                              {crypto.map(renderItem)}
                            </CommandGroup>
                          )}
                          {commodities.length > 0 && (
                            <CommandGroup heading="Commodities">
                              {commodities.map(renderItem)}
                            </CommandGroup>
                          )}
                          {stocks.length > 0 && (
                            <CommandGroup heading="Stocks & ETFs">
                              {stocks.map(renderItem)}
                            </CommandGroup>
                          )}
                        </>
                      );
                    })()}
                    {(() => {
                      const first = searchResults[0];
                      if (!first) return null;
                      const firstType = inferAssetType(first.ticker, first.instrument_type);
                      const isStock = firstType === 'stock' || firstType === 'etf';
                      return (
                        <CommandGroup heading={`Actions for ${first.ticker}`}>
                          <CommandItem value="deep-dive-first" onSelect={() => handleDeepDive(first.ticker)} className={itemClass}>
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground group-data-[selected=true]:bg-primary/10 group-data-[selected=true]:text-foreground">
                              <Microscope className="h-4 w-4" />
                            </span>
                            <span className="flex-1">Deep dive <span className="font-medium">{first.ticker}</span></span>
                            <ReturnHint />
                          </CommandItem>
                          {isStock && (
                            <CommandItem value="compare-first" onSelect={() => handleCompare(first.ticker)} className={itemClass}>
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground group-data-[selected=true]:bg-primary/10 group-data-[selected=true]:text-foreground">
                                <Scale className="h-4 w-4" />
                              </span>
                              <span className="flex-1">Compare <span className="font-medium">{first.ticker}</span></span>
                              <ReturnHint />
                            </CommandItem>
                          )}
                          <CommandItem value="ask-about-first" onSelect={() => handleAskAI(`Tell me about ${first.ticker}`)} className={itemClass}>
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground group-data-[selected=true]:bg-primary/10 group-data-[selected=true]:text-foreground">
                              <Sparkles className="h-4 w-4" />
                            </span>
                            <span className="flex-1">Ask AI about <span className="font-medium">{first.ticker}</span></span>
                            <ReturnHint />
                          </CommandItem>
                          <CommandItem value="alert-first" onSelect={() => handlePriceAlert(first.ticker, first.name)} className={itemClass}>
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground group-data-[selected=true]:bg-primary/10 group-data-[selected=true]:text-foreground">
                              <Bell className="h-4 w-4" />
                            </span>
                            <span className="flex-1">Set price alert for <span className="font-medium">{first.ticker}</span></span>
                            <ReturnHint />
                          </CommandItem>
                        </CommandGroup>
                      );
                    })()}
                  </>
                ) : null}

                {/* Ask AI — at the bottom so stocks are always first */}
                <CommandGroup heading="Ask AI">
                  <CommandItem
                    value="ask-ai"
                    onSelect={() => handleAskAI()}
                    className={`${itemClass} data-[selected=true]:bg-primary/10`}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors group-data-[selected=true]:bg-primary/20">
                      <Sparkles className="h-4 w-4" />
                    </span>
                    <span className="flex-1 truncate">
                      Ask BullPen AI <span className="text-muted-foreground">about</span>{' '}
                      <span className="font-medium">&ldquo;{searchQuery}&rdquo;</span>
                    </span>
                    <ReturnHint />
                  </CommandItem>
                </CommandGroup>
                {peopleResults && peopleResults.length > 0 && (
                  <CommandGroup heading="People">
                    {peopleResults.map((person) => {
                      const displayName = person.full_name || person.username || 'Anonymous';
                      const profileSlug = person.username ? encodeURIComponent(person.username) : person.id;
                      const href = profileSlug ? `/users/${profileSlug}` : '#';
                      const initials = displayName.slice(0, 2).toUpperCase();
                      return (
                        <CommandItem
                          key={person.id}
                          value={`person-${person.id}`}
                          onSelect={() => {
                            onOpenChange(false);
                            setSearchQuery('');
                            router.push(href);
                          }}
                          className={itemClass}
                        >
                          <ProfileAvatar
                            avatarUrl={person.avatar_url}
                            displayName={displayName}
                            fallback={initials}
                            size="sm"
                            showTooltip={false}
                            className="shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <span className="font-medium">{displayName}</span>
                            {person.username && (
                              <span className="ml-1.5 text-xs text-muted-foreground">@{person.username}</span>
                            )}
                          </div>
                          <ReturnHint />
                        </CommandItem>
                      );
                    })}
                    <CommandItem
                      value="browse-all-people"
                      onSelect={() => {
                        onOpenChange(false);
                        setSearchQuery('');
                        router.push(`/users?q=${encodeURIComponent(debouncedQuery)}`);
                      }}
                      className={itemClass}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground group-data-[selected=true]:bg-primary/10 group-data-[selected=true]:text-foreground">
                        <Users className="h-4 w-4" />
                      </span>
                      <span className="flex-1 truncate">Browse all members matching &ldquo;{debouncedQuery}&rdquo;</span>
                      <ReturnHint />
                    </CommandItem>
                  </CommandGroup>
                )}
                {(!searchResults || searchResults.length === 0) && (
                  <CommandEmpty>
                    {isSearching ? (
                      <div className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground/85">
                        <Loader2 className="size-5 animate-spin text-muted-foreground/80" />
                        Searching…
                      </div>
                    ) : searchError ? (
                      <div className="py-12 text-center text-sm text-muted-foreground">Search failed. Try again.</div>
                    ) : (
                      <div className="px-6 py-12 text-center text-sm text-muted-foreground/85">
                        No companies found. Try <span className="font-medium text-foreground">Ask BullPen AI</span> above for natural-language queries.
                      </div>
                    )}
                  </CommandEmpty>
                )}
              </>
            )}
          </CommandList>

          {/* Persistent hint bar — anchors the bottom of the fixed-height stage */}
          <div className="flex shrink-0 items-center justify-between border-t border-border/60 bg-muted/20 px-4 py-2.5">
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground/85">
              <span className="flex items-center gap-1">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd>
                <span className="ml-0.5">Navigate</span>
              </span>
              <span className="flex items-center gap-1">
                <Kbd>
                  <CornerDownLeft className="h-2.5 w-2.5" />
                </Kbd>
                <span className="ml-0.5">Open</span>
              </span>
            </div>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground/85">
              <Kbd>esc</Kbd>
              <span className="ml-0.5">Close</span>
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
