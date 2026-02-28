'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { useDebounce } from '@/hooks/use-debounce';
import { cn } from '@/lib/utils';

export interface SearchResult {
  ticker: string;
  name: string;
  cik: string;
  has_data: boolean;
  logo_url?: string | null;
}

interface TickerSelectorProps {
  value: SearchResult | null;
  onChange: (result: SearchResult | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function TickerSelector({
  value,
  onChange,
  placeholder = 'Search by ticker or company name...',
  className,
  disabled,
}: TickerSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebounce(query, 250);

  const { data: results, isLoading } = useQuery({
    queryKey: ['ticker-search', debouncedQuery],
    queryFn: async (): Promise<SearchResult[]> => {
      if (!debouncedQuery || debouncedQuery.trim().length < 2) return [];
      const res = await fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`);
      const data = await res.json();
      if (data.success && data.results) return data.results;
      return [];
    },
    enabled: debouncedQuery.trim().length >= 2,
    staleTime: 30_000,
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      onChange(result);
      setQuery('');
      setOpen(false);
      setIsSearching(false);
    },
    [onChange]
  );

  const handleClear = useCallback(() => {
    onChange(null);
    setQuery('');
    setOpen(true);
    setIsSearching(true);
  }, [onChange]);

  const showDropdown = open && (isSearching || query.length >= 2 || (results && results.length > 0));

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        {value && !isSearching && !query ? (
          <div
            className={cn(
              'flex h-11 items-center gap-3 rounded-lg border border-input bg-background px-3 pr-10',
              'cursor-pointer hover:border-ring/50 transition-colors'
            )}
            onClick={() => {
              setIsSearching(true);
              setQuery('');
            }}
          >
            <CompanyLogo size={28} ticker={value.ticker} name={value.name} logoUrl={value.logo_url} />
            <div className="flex-1 min-w-0 text-left">
              <span className="font-medium">{value.ticker}</span>
              <span className="ml-2 text-sm text-muted-foreground truncate">{value.name}</span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              className="absolute right-2 p-1 rounded hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              setOpen(true);
              setIsSearching(true);
            }}
            onBlur={() => {
              if (!query && value) setIsSearching(false);
            }}
            placeholder={placeholder}
            disabled={disabled}
            autoFocus={!value}
            className={cn(
              'flex h-11 w-full rounded-lg border border-input bg-background px-10 py-2 text-sm',
              'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background',
              'transition-all duration-200'
            )}
          />
        )}
      </div>

      {showDropdown && (
        <div
          className={cn(
            'absolute top-full left-0 right-0 mt-1 z-50 rounded-xl border border-border bg-background/95 backdrop-blur-xl shadow-xl',
            'overflow-hidden'
          )}
        >
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Searching...</div>
          ) : results && results.length > 0 ? (
            <div className="max-h-64 overflow-y-auto py-1">
              {results.map((r) => (
                <button
                  key={`${r.ticker}-${r.cik}`}
                  type="button"
                  onClick={() => handleSelect(r)}
                  className={cn(
                    'flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/50',
                    'transition-colors duration-150'
                  )}
                >
                  <CompanyLogo
                    size={36}
                    ticker={r.ticker}
                    name={r.name}
                    logoUrl={r.logo_url}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{r.name}</span>
                    <span className="ml-2 text-sm text-muted-foreground">({r.ticker})</span>
                  </div>
                </button>
              ))}
            </div>
          ) : query.length >= 2 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No companies found</div>
          ) : (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Type 2+ characters to search
            </div>
          )}
        </div>
      )}
    </div>
  );
}
