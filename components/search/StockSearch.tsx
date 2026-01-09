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
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { CheckCircle2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';

interface SearchResult {
  ticker: string;
  name: string;
  cik: string;
  has_data: boolean;
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
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestionProgress, setIngestionProgress] = useState<string>('');
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

      const response = await fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`);
      
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

  // Lazy ingestion mutation
  const ingestionMutation = useMutation({
    mutationFn: async (ticker: string): Promise<LazyIngestionResponse> => {
      const response = await fetch('/api/ingest/lazy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      });

      const data: LazyIngestionResponse = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Ingestion failed');
      }

      return data;
    },
  });

  const handleSelect = useCallback(
    async (result: SearchResult) => {
      setOpen(false);
      setSearchQuery('');

      if (result.has_data) {
        // Navigate directly if data exists
        router.push(`/stock/${result.ticker}`);
      } else {
        // Trigger lazy ingestion
        setIsIngesting(true);
        setIngestionProgress('Analyzing latest SEC filings…');

        try {
          await ingestionMutation.mutateAsync(result.ticker);
          
          setIngestionProgress('Ingestion complete! Redirecting…');
          
          // Small delay before navigation for UX
          setTimeout(() => {
            router.push(`/stock/${result.ticker}`);
            setIsIngesting(false);
            setIngestionProgress('');
          }, 500);
        } catch (error) {
          setIngestionProgress(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
          setTimeout(() => {
            setIsIngesting(false);
            setIngestionProgress('');
          }, 3000);
        }
      }
    },
    [router, ingestionMutation]
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
            />
            <CommandList>
              <CommandEmpty>
                {isSearching ? (
                  'Searching...'
                ) : searchError ? (
                  `Error: ${searchError instanceof Error ? searchError.message : 'Search failed'}`
                ) : debouncedQuery.trim().length < 2 ? (
                  'Type at least 2 characters...'
                ) : (
                  'No companies found.'
                )}
              </CommandEmpty>
              {searchResults && searchResults.length > 0 && (
                <CommandGroup heading="Companies">
                  {searchResults.map((result) => (
                    <CommandItem
                      key={`${result.ticker}-${result.cik}`}
                      value={`${result.ticker} ${result.name}`}
                      onSelect={() => handleSelect(result)}
                      className="flex items-center justify-between gap-2"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{result.name}</span>
                          <span className="text-sm text-muted-foreground">({result.ticker})</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {result.has_data ? (
                          <Badge variant="outline" className="text-xs bg-green-500/10 text-green-700 border-green-500/30 dark:bg-green-500/15 dark:text-green-400 dark:border-green-500/40">
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            Analyzed
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs bg-muted text-muted-foreground">
                            <Clock className="mr-1 h-3 w-3" />
                            Analyze on demand
                          </Badge>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>

      {/* Search Trigger Button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        Search companies...
      </button>

      {/* Ingestion Loading Dialog */}
      <Dialog open={isIngesting}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center justify-center gap-4 py-6">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground text-center">{ingestionProgress}</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
