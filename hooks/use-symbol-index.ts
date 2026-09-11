'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { parseSearchIndex, searchSymbols, type SymbolEntry } from '@/lib/search/local-index';
import { useDebounce } from '@/hooks/use-debounce';

/**
 * Downloads the symbol catalogue once and keeps it parsed in the query cache,
 * so every search surface in the app shares one copy and one fetch.
 *
 * `when: 'idle'` is the default for surfaces that are always mounted but rarely
 * used — the global command palette lives on every page, and fetching its index
 * during page load would compete with the page's own data. Waiting for an idle
 * moment still has it ready long before anyone presses ⌘K.
 */
export function useSymbolIndex(when: 'idle' | 'now' = 'idle') {
  const [idle, setIdle] = useState(false);
  const ready = when === 'now' || idle;

  useEffect(() => {
    if (when === 'now' || typeof window === 'undefined') return;
    const ric = window.requestIdleCallback;
    if (!ric) {
      const t = setTimeout(() => setIdle(true), 2000);
      return () => clearTimeout(t);
    }
    const handle = ric(() => setIdle(true), { timeout: 4000 });
    return () => window.cancelIdleCallback?.(handle);
  }, [when]);

  const { data } = useQuery({
    queryKey: ['symbol-index'],
    queryFn: async (): Promise<SymbolEntry[]> => {
      const res = await fetch('/api/search/index');
      if (!res.ok) return [];
      return parseSearchIndex(await res.text());
    },
    enabled: ready,
    // Catalogue data: what exists and what it is called. The CDN copy is good
    // for hours, and a session never needs to re-fetch it.
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
  });

  return data ?? EMPTY;
}

const EMPTY: SymbolEntry[] = [];

/**
 * Local results for a query, recomputed synchronously as the user types.
 *
 * Deliberately not memoized on the query string: the scan costs well under a
 * millisecond, and a cache would cost more to maintain than it saves.
 */
export function useLocalSymbolSearch(query: string, limit = 8, when: 'idle' | 'now' = 'idle') {
  const index = useSymbolIndex(when);
  return searchSymbols(index, query, limit);
}

/** How many server-only results are appended below the local ones. */
const REMOTE_EXTRA_SLOTS = 2;

/** The shape every search surface in the app already renders. */
export interface InstantSearchResult {
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

interface RemoteSearchResponse {
  success: boolean;
  results?: InstantSearchResult[];
}

/** Catalogue kind → the TwelveData instrument_type string the app routes on. */
const INSTRUMENT_TYPE = { s: 'Common Stock', e: 'ETF', f: 'Mutual Fund' } as const;

function toResult(entry: SymbolEntry): InstantSearchResult {
  return {
    ticker: entry.ticker,
    name: entry.name,
    exchange: undefined,
    country: 'United States',
    currency: 'USD',
    instrument_type: INSTRUMENT_TYPE[entry.kind],
    cik: '',
    has_data: true,
    logo_url: null,
  };
}

/**
 * Search that answers on the keystroke and improves a moment later.
 *
 * Local matches over the downloaded catalogue render immediately — no debounce,
 * no request, sub-millisecond. The server route still runs behind a debounce,
 * because the catalogue is US stocks and ETFs only: crypto pairs, foreign
 * listings and symbols listed since the last refresh exist only there. Anything
 * it returns that the catalogue did not is appended when it arrives.
 *
 * Ordering deliberately favours local results. They are ranked by market cap and
 * are what the user is overwhelmingly looking for; letting a slower response
 * reshuffle a list someone is already reading would trade one kind of bad
 * experience for another.
 */
export function useInstantSearch(query: string, limit = 8) {
  const trimmed = query.trim();
  const local = useLocalSymbolSearch(trimmed, limit);

  // Short enough that results feel like part of the same interaction, long
  // enough that a fast typist does not fire one request per character.
  const debounced = useDebounce(trimmed, 250);

  const { data: remote, isFetching: isRemoteLoading } = useQuery({
    queryKey: ['symbol-search-remote', debounced],
    queryFn: async (): Promise<InstantSearchResult[]> => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(debounced)}`);
      if (!res.ok) return [];
      const data: RemoteSearchResponse = await res.json();
      return data.results ?? [];
    },
    enabled: debounced.length >= 2,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const results = useMemo(() => {
    const merged = local.map(toResult);
    const seen = new Set(merged.map((r) => r.ticker.toUpperCase()));
    // Room is kept for server-only hits even when local matches already fill the
    // list. Searching "bitcoin" otherwise returns eight Bitcoin ETFs and never
    // BTC/USD itself, because crypto pairs exist only on the server side.
    let extras = REMOTE_EXTRA_SLOTS;
    for (const r of remote ?? []) {
      if (extras === 0) break;
      if (seen.has(r.ticker.toUpperCase())) continue;
      seen.add(r.ticker.toUpperCase());
      merged.push(r);
      extras--;
    }
    return merged;
  }, [local, remote]);

  return {
    results,
    /** True only while nothing is on screen yet — local hits mean there is already something to read. */
    isLoading: isRemoteLoading && results.length === 0,
  };
}
