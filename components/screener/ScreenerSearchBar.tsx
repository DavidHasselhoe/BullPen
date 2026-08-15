'use client';

import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { useDebounce } from '@/hooks/use-debounce';
import { cn } from '@/lib/utils';
import type { ScreenerRow } from '@/app/api/screener/route';

interface Props {
  /** Company universe to resolve typed text → ticker (ticker or name match). */
  universe: ScreenerRow[];
  /** Currently picked tickers (uppercase). */
  value: string[];
  onChange: (tickers: string[]) => void;
}

interface Option {
  ticker: string;
  name: string;
  logo_url: string | null;
}

/** Looks enough like a ticker to accept as a raw chip when the universe has no match. */
function looksLikeTicker(s: string): boolean {
  return /^[A-Z0-9.\-]{1,6}$/.test(s.toUpperCase());
}

export function ScreenerSearchBar({ universe, value, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const picked = useMemo(() => new Set(value), [value]);

  // Ticker → company meta, built once per universe change (not per chip per render —
  // the screener re-renders every few seconds on live price ticks).
  const metaByTicker = useMemo(() => {
    const m = new Map<string, ScreenerRow>();
    for (const r of universe) m.set(r.ticker, r);
    return m;
  }, [universe]);

  // Remote symbol search — covers anything the local universe misses (e.g. rows
  // whose stored name is just the ticker, so a company-name search would fail).
  // Same TwelveData-backed endpoint the command palette uses; debounced + cached.
  const debouncedQuery = useDebounce(query.trim(), 250);
  const { data: remote = [] } = useQuery<Option[]>({
    queryKey: ['screener-symbol-search', debouncedQuery.toLowerCase()],
    queryFn: async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`);
      if (!res.ok) return [];
      const d = await res.json();
      return (d.results ?? []).map((r: { ticker: string; name: string; logo_url?: string | null }) => ({
        ticker: r.ticker.toUpperCase(),
        name: r.name,
        logo_url: r.logo_url ?? null,
      }));
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 60_000,
  });

  const suggestions: Option[] = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (q.length < 1) return [];
    // Instant local matches first (zero-cost), ranked by ticker exactness.
    const local = universe
      .filter((r) => !picked.has(r.ticker))
      .filter((r) => r.ticker.includes(q) || r.name.toUpperCase().includes(q))
      .sort((a, b) => {
        const aw = a.ticker === q ? 0 : a.ticker.startsWith(q) ? 1 : 2;
        const bw = b.ticker === q ? 0 : b.ticker.startsWith(q) ? 1 : 2;
        return aw - bw;
      })
      .map((r) => ({ ticker: r.ticker, name: r.name, logo_url: r.logo_url }));

    // Append remote matches not already covered (fills name-data gaps).
    const seen = new Set(local.map((o) => o.ticker));
    const merged = [...local];
    for (const r of remote) {
      if (merged.length >= 7) break;
      if (!seen.has(r.ticker) && !picked.has(r.ticker)) {
        merged.push(r);
        seen.add(r.ticker);
      }
    }
    return merged.slice(0, 7);
  }, [query, universe, picked, remote]);

  function addTicker(ticker: string) {
    const t = ticker.trim().toUpperCase();
    if (!t || picked.has(t)) return;
    onChange([...value, t]);
    setQuery('');
    setActiveIndex(0);
  }

  /** Resolve a free-text fragment to a ticker: best universe match, else raw ticker. */
  function commitText(text: string) {
    const raw = text.trim();
    if (!raw) return;
    const upper = raw.toUpperCase();
    const match =
      universe.find((r) => r.ticker === upper) ??
      universe.find((r) => r.ticker.startsWith(upper)) ??
      universe.find((r) => r.name.toUpperCase().includes(upper));
    if (match) addTicker(match.ticker);
    else if (looksLikeTicker(raw)) addTicker(upper);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === ',' || e.key === 'Enter') {
      e.preventDefault();
      if (suggestions.length > 0) addTicker(suggestions[Math.min(activeIndex, suggestions.length - 1)].ticker);
      else commitText(query);
      return;
    }
    if (e.key === 'Backspace' && query === '' && value.length > 0) {
      onChange(value.slice(0, -1));
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Escape') {
      setQuery('');
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text');
    if (!text.includes(',')) return; // let normal typing handle single values
    e.preventDefault();
    for (const part of text.split(',')) commitText(part);
  }

  const hasQuery = query.trim().length >= 1;
  const showDropdown = focused && hasQuery;
  // When nothing matches but the text could be a ticker, Enter still adds it.
  const noMatchAddable = hasQuery && suggestions.length === 0 && looksLikeTicker(query.trim());

  return (
    <div className="relative">
      {/* Token field */}
      <div
        className={cn(
          'flex flex-wrap items-center gap-1.5 rounded-lg border bg-card px-2.5 py-2 transition-colors',
          focused ? 'border-primary/60 ring-2 ring-primary/15' : 'border-border hover:border-border/80',
        )}
        onClick={() => inputRef.current?.focus()}
      >
        <Search className="h-4 w-4 shrink-0 text-muted-foreground/80" aria-hidden />

        {/* Chips */}
        {value.map((ticker) => {
          const meta = metaByTicker.get(ticker);
          return (
            <span
              key={ticker}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/60 py-1 pl-1.5 pr-0.5 text-xs font-medium"
            >
              <CompanyLogo ticker={ticker} name={meta?.name ?? ticker} logoUrl={meta?.logo_url ?? null} size={16} className="rounded-sm shrink-0" />
              <span className="font-mono font-semibold">{ticker}</span>
              <button
                type="button"
                aria-label={`Remove ${meta?.name ?? ticker}`}
                onClick={(e) => { e.stopPropagation(); onChange(value.filter((t) => t !== ticker)); }}
                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground/80 hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          );
        })}

        {/* Text input */}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          placeholder={value.length === 0 ? 'Search stocks to compare — try "nvidia, broadcom, marvell"' : 'Add another…'}
          aria-label="Search and pick stocks"
          aria-expanded={showDropdown}
          role="combobox"
          aria-autocomplete="list"
          aria-controls="screener-search-listbox"
          aria-activedescendant={
            showDropdown && suggestions.length > 0 ? `screener-search-opt-${activeIndex}` : undefined
          }
          className="min-w-[140px] flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-muted-foreground/80"
        />

        {value.length > 0 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange([]); setQuery(''); }}
            className="ml-auto shrink-0 rounded px-1.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Suggestion dropdown */}
      {showDropdown && (
        <ul
          id="screener-search-listbox"
          role="listbox"
          className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li key={s.ticker} id={`screener-search-opt-${i}`} role="option" aria-selected={i === activeIndex}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); addTicker(s.ticker); }}
                onMouseEnter={() => setActiveIndex(i)}
                className={cn(
                  'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
                  i === activeIndex ? 'bg-accent' : 'hover:bg-muted/50',
                )}
              >
                <CompanyLogo ticker={s.ticker} name={s.name} logoUrl={s.logo_url} size={26} className="rounded shrink-0" />
                <span className="font-mono text-sm font-semibold text-foreground">{s.ticker}</span>
                <span className="truncate text-xs text-muted-foreground">{s.name}</span>
              </button>
            </li>
          ))}

          {/* No-match feedback */}
          {suggestions.length === 0 && (
            <li className="px-3 py-3 text-xs text-muted-foreground/85" aria-live="polite">
              {noMatchAddable ? (
                <>No company match, press <kbd className="rounded border border-border bg-muted px-1 font-mono text-[11px]">Enter</kbd> to add <span className="font-mono font-semibold text-foreground">{query.trim().toUpperCase()}</span> as a ticker</>
              ) : (
                <>No matches for &ldquo;{query.trim()}&rdquo;</>
              )}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
