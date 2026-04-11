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
import { useDebounce } from '@/hooks/use-debounce';
import { useSearchShortcut } from '@/hooks/use-search-shortcut';
import { fetchWithTimeout } from '@/lib/utils';
import { MessageSquare, Briefcase, Filter, TrendingUp, ExternalLink, Scale, FileText, Users } from 'lucide-react';
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
  { id: 'ai', label: 'Ask BullPen AI', href: '/tools/ai-chat', icon: MessageSquare, opensAIPanel: true },
  { id: 'holdings', label: 'My Holdings', href: '/holdings', icon: Briefcase },
  { id: 'screener', label: 'Stock Screener', href: '/tools/screener', icon: Filter },
  { id: 'discover', label: 'Discover', href: '/', icon: TrendingUp },
  { id: 'members', label: 'Browse Members', href: '/users', icon: Users },
];

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const { open: openAIPanel } = useAIPanel();
  const searchShortcut = useSearchShortcut();
  const [searchQuery, setSearchQuery] = useState('');

  const debouncedQuery = useDebounce(searchQuery, 300);

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
  });

  const handleSelectCompany = useCallback(
    async (result: SearchResult) => {
      onOpenChange(false);
      setSearchQuery('');
      router.push(`/stock/${result.ticker}`);
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

  const handleOpenCompany = useCallback(
    (result: SearchResult) => {
      handleSelectCompany(result);
    },
    [handleSelectCompany]
  );

  const handleCompareWith = useCallback(
    (ticker: string, otherTickers: string[]) => {
      onOpenChange(false);
      setSearchQuery('');
      const all = [ticker, ...otherTickers].slice(0, 5);
      const params = new URLSearchParams({ tickers: all.join(',') });
      router.push(`/tools/compare?${params.toString()}`);
    },
    [router, onOpenChange]
  );

  const handleOpenFilings = useCallback(
    (result: SearchResult) => {
      onOpenChange(false);
      setSearchQuery('');
      router.push(`/stock/${result.ticker}#earnings`);
    },
    [router, onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-xl" showCloseButton={true}>
        <DialogHeader className="sr-only">
          <DialogTitle>Command Palette</DialogTitle>
          <DialogDescription>Search companies, ask AI, or navigate</DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false} className="rounded-lg">
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
          <CommandList className="max-h-[340px]">
            {searchQuery.trim().length < 2 ? (
              <>
                <CommandGroup heading="Quick actions">
                  {QUICK_ACTIONS.map((action) => {
                    const Icon = action.icon;
                    return (
                      <CommandItem
                        key={action.id}
                        value={action.id}
                        onSelect={() => handleQuickAction(action)}
                      >
                        <Icon className="h-4 w-4" />
                        {action.label}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
                <div className="py-4 px-3 text-xs text-muted-foreground">
                  <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono">{searchShortcut}</kbd> to open from anywhere
                </div>
              </>
            ) : (
              <>
                {searchQuery.trim().length >= 2 && (
                  <CommandGroup heading="Ask AI">
                    <CommandItem value="ask-ai" onSelect={() => handleAskAI()}>
                      <MessageSquare className="h-4 w-4" />
                      Ask BullPen AI: &quot;{searchQuery}&quot;
                    </CommandItem>
                  </CommandGroup>
                )}
                {searchResults && searchResults.length > 0 ? (
                  <>
                    <CommandGroup heading="Companies">
                      {searchResults.map((result) => (
                        <CommandItem
                          key={`${result.ticker}-${result.exchange ?? ''}`}
                          value={`${result.ticker} ${result.name}`}
                          onSelect={() => handleSelectCompany(result)}
                        >
                          <CompanyLogo
                            name={result.name}
                            ticker={result.ticker}
                            logoUrl={result.logo_url}
                            size={32}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium">{result.ticker}</span>
                              {result.exchange && (
                                <span className="text-[10px] text-muted-foreground bg-muted rounded px-1 py-0.5 leading-none shrink-0">
                                  {result.exchange}
                                </span>
                              )}
                              {result.instrument_type && result.instrument_type !== 'Common Stock' && (
                                <span className="text-[10px] text-muted-foreground bg-muted rounded px-1 py-0.5 leading-none shrink-0">
                                  {result.instrument_type}
                                </span>
                              )}
                            </div>
                            <span className="text-muted-foreground text-xs truncate block">{result.name}</span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                    <CommandGroup heading="Quick actions">
                      <CommandItem value="open-first" onSelect={() => searchResults && handleSelectCompany(searchResults[0])}>
                        <ExternalLink className="h-4 w-4" />
                        Open {searchResults[0]?.ticker} page
                      </CommandItem>
                      <CommandItem value="filings-first" onSelect={() => searchResults && handleOpenFilings(searchResults[0])}>
                        <FileText className="h-4 w-4" />
                        Open {searchResults[0]?.ticker} filings
                      </CommandItem>
                      <CommandItem value="ask-about-first" onSelect={() => searchResults && handleAskAI(`Tell me about ${searchResults[0]?.ticker}`)}>
                        <MessageSquare className="h-4 w-4" />
                        Ask AI about {searchResults[0]?.ticker}
                      </CommandItem>
                      {searchResults.length >= 2 && (
                        <CommandItem
                          value="compare-first-two"
                          onSelect={() => handleCompareWith(searchResults[0]!.ticker, [searchResults[1]!.ticker])}
                        >
                          <Scale className="h-4 w-4" />
                          Compare {searchResults[0]?.ticker} vs {searchResults[1]?.ticker}
                        </CommandItem>
                      )}
                    </CommandGroup>
                  </>
                ) : null}
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
                        >
                          <div className="flex items-center gap-2.5 w-full">
                            {person.avatar_url ? (
                              <img
                                src={person.avatar_url}
                                alt={displayName}
                                className="h-7 w-7 rounded-full object-cover shrink-0"
                              />
                            ) : (
                              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <span className="text-[10px] font-semibold text-primary">{initials}</span>
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <span className="font-medium text-sm">{displayName}</span>
                              {person.username && (
                                <span className="text-muted-foreground ml-1.5 text-xs">@{person.username}</span>
                              )}
                            </div>
                            <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          </div>
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
                    >
                      <Users className="h-4 w-4" />
                      Browse all members matching &quot;{debouncedQuery}&quot;
                    </CommandItem>
                  </CommandGroup>
                )}
                {(!searchResults || searchResults.length === 0) && (
                  <CommandEmpty>
                    {isSearching ? (
                      <div className="py-8 text-center text-sm text-muted-foreground">Searching...</div>
                    ) : searchError ? (
                      <div className="py-8 text-center text-sm text-muted-foreground">Search failed</div>
                    ) : (
                      <div className="py-6 text-center text-sm text-muted-foreground">
                        No companies found. Try &quot;Ask BullPen AI&quot; above for natural language queries.
                      </div>
                    )}
                  </CommandEmpty>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
