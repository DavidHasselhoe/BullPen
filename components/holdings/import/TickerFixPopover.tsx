'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { Search, Loader2, AlertCircle } from 'lucide-react';

interface Candidate {
  symbol: string;
  instrument_name: string;
  exchange: string;
  mic_code: string;
  currency: string;
  instrument_type: string;
}

export interface FixedResolution {
  symbol: string;
  instrument_name: string;
  exchange: string;
  mic_code: string;
  currency: string;
  instrument_type: string;
}

interface Props {
  defaultQuery: string;
  onResolved: (resolution: FixedResolution) => void;
  children: React.ReactNode;
}

/**
 * Manual fix control for a security the automated resolver couldn't verify.
 * Search is cheap and unverified (1 TwelveData credit); picking a candidate
 * triggers one real quote check before it's accepted — a deliberate human
 * choice is worth the extra credit, unlike a per-keystroke search.
 */
export function TickerFixPopover({ defaultQuery, onResolved, children }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(defaultQuery);
  const [debounced, setDebounced] = useState(defaultQuery);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(id);
  }, [query]);

  const { data, isFetching } = useQuery({
    queryKey: ['import-resolve-search', debounced],
    queryFn: async () => {
      const res = await fetch(`/api/import/resolve?q=${encodeURIComponent(debounced)}`);
      if (!res.ok) return { candidates: [] as Candidate[] };
      return res.json() as Promise<{ candidates: Candidate[] }>;
    },
    enabled: open && debounced.trim().length > 0,
    staleTime: 60_000,
  });

  async function pick(candidate: Candidate) {
    setVerifying(candidate.symbol);
    setVerifyError(null);
    try {
      const params = new URLSearchParams({ symbol: candidate.symbol, currency: candidate.currency });
      if (candidate.mic_code) params.set('micCode', candidate.mic_code);
      const res = await fetch(`/api/import/resolve?${params.toString()}`);
      const result = await res.json();
      if (result.status !== 'resolved') {
        setVerifyError(`${candidate.symbol} doesn't have a live price feed right now. Try another listing.`);
        return;
      }
      onResolved({
        symbol: candidate.symbol,
        instrument_name: candidate.instrument_name,
        exchange: candidate.exchange,
        mic_code: candidate.mic_code,
        currency: candidate.currency,
        instrument_type: candidate.instrument_type,
      });
      setOpen(false);
    } finally {
      setVerifying(null);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search ticker or company name…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {isFetching && (
              <div className="flex items-center justify-center py-4 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            )}
            {!isFetching && (data?.candidates.length ?? 0) === 0 && (
              <CommandEmpty>
                <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                  <Search className="h-3.5 w-3.5" />
                  No matches found
                </div>
              </CommandEmpty>
            )}
            {!isFetching && data && data.candidates.length > 0 && (
              <CommandGroup>
                {data.candidates.map((c) => (
                  <CommandItem
                    key={`${c.symbol}-${c.mic_code}`}
                    value={`${c.symbol}-${c.mic_code}`}
                    onSelect={() => pick(c)}
                    disabled={verifying !== null}
                    className="flex items-center justify-between gap-2"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="font-mono text-xs font-semibold">{c.symbol}</span>
                      <span className="truncate text-[11px] text-muted-foreground">{c.instrument_name}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                      {verifying === c.symbol ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      <span>{c.exchange}</span>
                      <span className="font-mono">{c.currency}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
        {verifyError && (
          <div className="flex items-start gap-1.5 border-t border-border/40 px-3 py-2 text-[11px] text-amber-500">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-px" />
            {verifyError}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
