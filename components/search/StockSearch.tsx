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
import { Progress } from '@/components/ui/progress';
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
  const [ingestionProgressPercent, setIngestionProgressPercent] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const eventSourceRef = useRef<EventSource | null>(null);

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
        // Trigger lazy ingestion with SSE progress tracking
        setIsIngesting(true);
        setIngestionProgress('Initializing...');
        setIngestionProgressPercent(0);

        // Close any existing EventSource
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
        }

        // Create EventSource for progress tracking
        const eventSource = new EventSource(`/api/ingest/lazy/progress?ticker=${encodeURIComponent(result.ticker)}`);
        eventSourceRef.current = eventSource;

        const STEP_WEIGHTS: Record<string, number> = {
          'Looking up company information': 5,
          'Company found': 10,
          'Setting up company profile': 15,
          'Fetching annual report': 25,
          'Fetching quarterly reports': 45,
          'Downloading reports': 50,
          'Processing documents': 55,
          'Extracting financial metrics': 70,
          'Analyzing with AI': 80,
          'Generating insights': 85,
          'Detecting trends': 90,
          'Calculating scores': 95,
          'Finalizing': 100,
        };

        const simplifyStepName = (step: string): string => {
          const stepLower = step.toLowerCase();
          if (stepLower.includes('looking up') || stepLower.includes('company information')) return 'Looking up company information';
          if (stepLower.includes('company found')) return 'Company found';
          if (stepLower.includes('creating company') || stepLower.includes('company record')) return 'Setting up company profile';
          if (stepLower.includes('ingesting') && stepLower.includes('10-k')) return 'Fetching annual report';
          if (stepLower.includes('ingesting') && stepLower.includes('10-q')) return 'Fetching quarterly reports';
          if (stepLower.includes('fetching') || stepLower.includes('downloading')) return 'Downloading reports';
          if (stepLower.includes('parsing') || stepLower.includes('extracting')) return 'Processing documents';
          if (stepLower.includes('extract') && stepLower.includes('metric')) return 'Extracting financial metrics';
          if (stepLower.includes('ai analysis') || stepLower.includes('analyzing')) return 'Analyzing with AI';
          if (stepLower.includes('generating signals') || stepLower.includes('signals')) return 'Generating insights';
          if (stepLower.includes('trend') || stepLower.includes('analyzing trends')) return 'Detecting trends';
          if (stepLower.includes('composite score') || stepLower.includes('calculating')) return 'Calculating scores';
          if (stepLower.includes('marking') || stepLower.includes('completed')) return 'Finalizing';
          return step.split(':')[0].trim();
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'progress' && data.step) {
              const simplifiedStep = simplifyStepName(data.step);
              setIngestionProgress(simplifiedStep);
              const stepProgress = STEP_WEIGHTS[simplifiedStep] || 0;
              setIngestionProgressPercent((prev) => Math.max(prev, stepProgress));
            } else if (data.type === 'complete') {
              setIngestionProgress('Analysis complete!');
              setIngestionProgressPercent(100);
              eventSource.close();
              
              // Small delay before navigation for UX
              setTimeout(() => {
                router.push(`/stock/${result.ticker}`);
                setIsIngesting(false);
                setIngestionProgress('');
                setIngestionProgressPercent(0);
              }, 500);
            } else if (data.type === 'error') {
              setIngestionProgress(`Error: ${data.error || 'Unknown error'}`);
              eventSource.close();
              setTimeout(() => {
                setIsIngesting(false);
                setIngestionProgress('');
                setIngestionProgressPercent(0);
              }, 3000);
            }
          } catch (err) {
            console.error('Error parsing SSE message:', err);
          }
        };

        eventSource.onerror = () => {
          console.error('SSE error');
          eventSource.close();
          // Fallback to mutation-based approach
          try {
            ingestionMutation.mutateAsync(result.ticker).then(() => {
              setIngestionProgress('Complete! Redirecting…');
              setIngestionProgressPercent(100);
              setTimeout(() => {
                router.push(`/stock/${result.ticker}`);
                setIsIngesting(false);
                setIngestionProgress('');
                setIngestionProgressPercent(0);
              }, 500);
            }).catch((error) => {
              setIngestionProgress(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
              setTimeout(() => {
                setIsIngesting(false);
                setIngestionProgress('');
                setIngestionProgressPercent(0);
              }, 3000);
            });
          } catch (error) {
            setIngestionProgress(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            setTimeout(() => {
              setIsIngesting(false);
              setIngestionProgress('');
              setIngestionProgressPercent(0);
            }, 3000);
          }
        };
      }
    },
    [router, ingestionMutation]
  );

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

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
          <DialogHeader className="sr-only">
            <DialogTitle>Analyzing Company</DialogTitle>
            <DialogDescription>Processing SEC filings and generating insights</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center gap-4 py-6">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <div className="w-full space-y-2">
              <Progress value={ingestionProgressPercent} className="h-2" />
              <p className="text-sm text-muted-foreground text-center">{ingestionProgress}</p>
              <p className="text-xs text-muted-foreground text-center">{ingestionProgressPercent}%</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
