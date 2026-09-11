'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Search } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { useInstantSearch } from '@/hooks/use-symbol-index';
import { humanizeError } from '@/lib/errors/humanize';

interface SearchResult {
  ticker: string;
  name: string;
  cik: string;
  has_data: boolean;
  logo_url?: string | null;
  instrument_type?: string;
}

export function StockSearch() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Matches from the downloaded catalogue render on the keystroke itself; the
  // server route fills in anything it does not carry (crypto, foreign listings,
  // very new symbols) a moment later. See hooks/use-symbol-index.ts.
  const { results: searchResults, isLoading: isSearching } = useInstantSearch(searchQuery, 8);
  const searchError = null;
  const debouncedQuery = searchQuery.trim();

  const prefetchSnapshot = useCallback((ticker: string) => {
    queryClient.prefetchQuery({
      queryKey: ['stock-snapshot', ticker],
      queryFn: () => fetch(`/api/stock/${ticker}/snapshot`).then((r) => r.json()),
      staleTime: 2 * 60 * 1000,
    });
  }, [queryClient]);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      setOpen(false);
      setSearchQuery('');
      const path = slugToAssetPath(result.ticker, result.instrument_type);
      router.push(path);
    },
    [router]
  );

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
                        {humanizeError(searchError)}
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
                      onMouseEnter={() => prefetchSnapshot(result.ticker)}
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
        <Search className="h-4 w-4 shrink-0" aria-hidden />
        <span className="hidden md:inline">Search companies...</span>
      </button>
    </>
  );
}
