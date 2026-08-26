'use client';

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, X } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { cn } from '@/lib/utils';
import type { ScreenerRow } from '@/app/api/screener/route';
import type { ScreenerView } from '@/hooks/use-screener-views';

interface CompanyOption {
  ticker: string;
  name: string;
  logo_url: string | null;
  sector: string | null;
}

interface Props {
  /** The active custom view */
  view: ScreenerView;
  /** Full company universe for search (ticker + name + logo) */
  universe: ScreenerRow[];
  onAdd: (ticker: string) => void;
  /** Used to show empty-state vs add-more CTA */
  hasStocks: boolean;
}

export function ScreenerViewStockPicker({ view, universe, onAdd, hasStocks }: Props) {
  const { t } = useTranslation('tools');
  // Start expanded when the view is empty (no stocks yet)
  const [expanded, setExpanded] = useState(!hasStocks);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const q = query.trim().toUpperCase();

  const suggestions: CompanyOption[] = q.length >= 1
    ? universe
        .filter((r) => !view.tickers.includes(r.ticker))
        .filter((r) =>
          r.ticker.includes(q) ||
          r.name.toUpperCase().includes(q)
        )
        .slice(0, 7)
        .map((r) => ({ ticker: r.ticker, name: r.name, logo_url: r.logo_url, sector: r.sector }))
    : [];

  const handleAdd = (ticker: string) => {
    onAdd(ticker);
    setQuery('');
    inputRef.current?.focus();
  };

  if (!expanded) {
    return (
      <button
        onClick={() => { setExpanded(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        className={cn(
          'flex items-center gap-2 w-full px-3 py-2 rounded-md',
          'text-xs text-muted-foreground/85 hover:text-muted-foreground hover:bg-muted/30',
          'border border-dashed border-border/30 hover:border-border/60',
          'transition-colors group mt-2'
        )}
      >
        <div className="h-5 w-5 rounded-full border border-dashed border-border/50 flex items-center justify-center shrink-0 group-hover:border-primary/50 transition-colors">
          <Plus className="h-3 w-3 group-hover:text-primary transition-colors" />
        </div>
        {t('screenerAddStockToView')}
      </button>
    );
  }

  return (
    <div className="mt-1 rounded-lg border border-border/50 bg-card overflow-hidden shadow-sm">
      {/* Search input */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/30">
        <Search className="h-3.5 w-3.5 text-muted-foreground/85 shrink-0" />
        <input
          ref={inputRef}
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('compareSearchPlaceholder')}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/80"
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setExpanded(false); setQuery(''); }
            if (e.key === 'Enter' && suggestions.length > 0) handleAdd(suggestions[0].ticker);
          }}
        />
        <button
          type="button"
          onClick={() => { setExpanded(false); setQuery(''); }}
          className="text-muted-foreground/80 hover:text-muted-foreground transition-colors shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Results */}
      {suggestions.length > 0 && (
        <ul>
          {suggestions.map((s, i) => (
            <li key={s.ticker}>
              <button
                type="button"
                onClick={() => handleAdd(s.ticker)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 text-left',
                  'hover:bg-muted/50 transition-colors',
                  i < suggestions.length - 1 && 'border-b border-border/20'
                )}
              >
                <CompanyLogo
                  ticker={s.ticker}
                  name={s.name}
                  logoUrl={s.logo_url}
                  size={28}
                  className="rounded shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-foreground font-mono">{s.ticker}</span>
                    <span className="text-xs text-muted-foreground truncate">{s.name}</span>
                  </div>
                  {s.sector && (
                    <span className="text-[11px] text-muted-foreground/85">{s.sector}</span>
                  )}
                </div>
                <Plus className="h-3.5 w-3.5 text-muted-foreground/80 shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Empty search state */}
      {q.length > 0 && suggestions.length === 0 && (
        <div className="px-3 py-4 text-xs text-muted-foreground/85 text-center">
          {t('screenerNoStocksMatch', { query })}
        </div>
      )}

      {/* Hint when no query yet */}
      {q.length === 0 && (
        <div className="px-3 py-3 text-[11px] text-muted-foreground/80 text-center">
          {t('screenerSearchHint')}
        </div>
      )}
    </div>
  );
}
