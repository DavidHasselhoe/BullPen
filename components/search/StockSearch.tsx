'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
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
import { fetchWithTimeout } from '@/lib/utils';

interface SearchResult {
  ticker: string;
  name: string;
  cik: string;
  has_data: boolean;
  logo_url?: string | null;
}

interface SearchResponse {
  success: boolean;
  results?: SearchResult[];
  error?: string;
}

interface LazyIngestionResponse {
  success: boolean;
  companyId?: string;
  ticker?: string;
  filingsIngested?: number;
  error?: string;
}

/**
 * Stock Search Component with Autocomplete
 * Uses shadcn/ui Command for keyboard-first UX
 */
export function StockSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const debouncedQuery = useDebounce(searchQuery, 300);

  // Search query
  const {
    data: searchResults,
    isLoading: isSearching,
    error: searchError,
  } = useQuery({
    queryKey: ['stock-search', debouncedQuery],
    queryFn: async (): Promise<SearchResult[]> => {
      if (!debouncedQuery || debouncedQuery.trim().length < 2) {
        return [];
      }

      const response = await fetchWithTimeout(
        `/api/search?q=${encodeURIComponent(debouncedQuery)}`,
        {},
        8000
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Search failed: ${response.status}`);
      }
      
      const data: SearchResponse = await response.json();

      if (data.success && data.results) {
        return data.results;
      }
      
      // If not successful, return empty array (handled by error state)
      if (!data.success) {
        throw new Error(data.error || 'Search failed');
      }
      
      return [];
    },
    enabled: debouncedQuery.trim().length >= 2,
    staleTime: 30 * 1000, // 30 seconds
    retry: false, // Don't retry failed searches
  });

  // Lazy ingestion mutation (for background async ingestion)
  const ingestionMutation = useMutation({
    mutationFn: async (ticker: string): Promise<LazyIngestionResponse> => {
      const response = await fetch('/api/ingest/lazy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      });

      const data: LazyIngestionResponse = await response.json();

      if (!data.success) {
        // Handle rate limit with better error message
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const resetTime = response.headers.get('X-RateLimit-Reset');
          
          let errorMessage = 'Rate limit exceeded. Please try again later.';
          if (retryAfter) {
            const seconds = parseInt(retryAfter, 10);
            const minutes = Math.ceil(seconds / 60);
            errorMessage = `Rate limit exceeded. Please try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`;
          } else if (resetTime) {
            const resetDate = new Date(resetTime);
            const now = new Date();
            const minutesUntilReset = Math.ceil((resetDate.getTime() - now.getTime()) / 60000);
            if (minutesUntilReset > 0) {
              errorMessage = `Rate limit exceeded. Please try again in ${minutesUntilReset} minute${minutesUntilReset > 1 ? 's' : ''}.`;
            }
          }
          throw new Error(errorMessage);
        }
        
        throw new Error(data.error || 'Ingestion failed');
      }

      return data;
    },
  });

  // Track search click mutation
  const trackSearchMutation = useMutation({
    mutationFn: async (ticker: string) => {
      await fetch('/api/search/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      });
    },
  });

  const handleSelect = useCallback(
    async (result: SearchResult) => {
      setOpen(false);
      setSearchQuery('');

      // Track the search click
      trackSearchMutation.mutate(result.ticker);

      if (result.has_data) {
        // Navigate directly if data exists
        router.push(`/stock/${result.ticker}`);
      } else {
        // Navigate immediately and trigger ingestion in background
        router.push(`/stock/${result.ticker}`);
        
        // Trigger lazy ingestion asynchronously (fire and forget)
        // The stock page will show progressive loading states
        ingestionMutation.mutate(result.ticker, {
          onError: (error) => {
            console.error('Background ingestion error:', error);
            // Error will be handled on the stock detail page
          },
        });
      }
    },
    [router, ingestionMutation, trackSearchMutation]
  );

  // Handle Enter key to select first result
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && searchResults && searchResults.length > 0) {
        e.preventDefault();
        handleSelect(searchResults[0]);
      }
    },
    [searchResults, handleSelect]
  );

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="sr-only">
            <DialogTitle>Search Companies</DialogTitle>
            <DialogDescription>Search by ticker or company name</DialogDescription>
          </DialogHeader>
          <Command shouldFilter={false} className="rounded-lg">
            <CommandInput
              placeholder="Search companies by ticker or name..."
              value={searchQuery}
              onValueChange={setSearchQuery}
              onKeyDown={handleKeyDown}
            />
            <CommandList>
              {debouncedQuery.trim().length < 2 ? (
                // Show nothing when query is too short - cleaner UI
                <div className="py-8" />
              ) : (
                <CommandEmpty>
                  {isSearching ? (
                    <div className="py-6 text-center">
                      <div className="text-sm text-muted-foreground">Searching...</div>
                    </div>
                  ) : searchError ? (
                    <div className="py-6 text-center">
                      <div className="text-sm text-muted-foreground">
                        {searchError instanceof Error ? searchError.message : 'Search failed'}
                      </div>
                    </div>
                  ) : (
                    <div className="py-6 text-center">
                      <div className="text-sm text-muted-foreground">No companies found.</div>
                    </div>
                  )}
                </CommandEmpty>
              )}
              {searchResults && searchResults.length > 0 && (
                <CommandGroup heading="Companies">
                  {searchResults.map((result) => (
                    <CommandItem
                      key={`${result.ticker}-${result.cik}`}
                      value={`${result.ticker} ${result.name}`}
                      onSelect={() => handleSelect(result)}
                      className="flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <CompanyLogo
                          name={result.name}
                          ticker={result.ticker}
                          logoUrl={result.logo_url}
                          size={40}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{result.name}</span>
                            <span className="text-sm text-muted-foreground">({result.ticker})</span>
                          </div>
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>

      {/* Search Trigger Button - icon only on mobile, full on desktop */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 md:px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        aria-label="Search companies"
      >
        <svg
          className="h-4 w-4 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <span className="hidden md:inline">Search companies...</span>
      </button>
    </>
  );
}
