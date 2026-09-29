'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Check, Plus, Search } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { HomeSection, homePanel } from '@/components/dashboard/HomeSection';
import { useAIPanel } from '@/components/ai/AIPanelProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAddToWatchlist, useRemoveFromWatchlist, useWatchlist } from '@/hooks/use-watchlist';
import { useInstantSearch } from '@/hooks/use-symbol-index';
import { fetchHoldingQuotes } from '@/lib/holdings/holding-quotes';
import { useTradingSession } from '@/hooks/use-trading-session';
import { STARTER_STOCKS } from '@/lib/onboarding/starter-stocks';
import { cn } from '@/lib/utils';
import { trackEvent } from '@/lib/analytics/track';

type Pick = { ticker: string; name: string };

/**
 * A brand-new account's Home: one thing to do, tap a few familiar companies.
 * Each tap goes straight onto the watchlist (no money, no share counts), and
 * "Done" hands over to the real Home, which is already about those stocks:
 * how they're doing today and, for the biggest move, why.
 *
 * Replaces the four-way Get started card and the floating starter popup,
 * which asked the same question twice and added picks as empty holdings.
 */
export function StarterPicker({ onPick, onDone }: { onPick: () => void; onDone: () => void }) {
  const { t } = useTranslation('discover');
  const { open: openAIPanel } = useAIPanel();
  const { data: watchlist } = useWatchlist();
  const add = useAddToWatchlist();
  const remove = useRemoveFromWatchlist();
  const [query, setQuery] = useState('');
  const { results } = useInstantSearch(query, 6);

  // Same pricing rule as the rest of Home, so a tile never disagrees with the
  // sentence above it (pre-market move vs yesterday's close).
  const prepost = useTradingSession() !== 'regular';
  const { data: quotes } = useQuery({
    queryKey: ['starter-quotes', prepost],
    queryFn: () => fetchHoldingQuotes(STARTER_STOCKS.map((s) => s.ticker), [], prepost),
    staleTime: 3 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const watched = new Map((watchlist ?? []).map((w) => [w.symbol, w.company_name]));
  const searching = query.trim().length > 0;
  // Picks made through search aren't in the suggestions, so they lead the
  // grid once the search is cleared rather than vanishing from view.
  const extras: Pick[] = [...watched]
    .filter(([s]) => !STARTER_STOCKS.some((x) => x.ticker === s))
    .map(([ticker, name]) => ({ ticker, name }));
  const list: Pick[] = searching ? results.map((r) => ({ ticker: r.ticker, name: r.name })) : [...extras, ...STARTER_STOCKS];

  const toggle = (p: Pick) => {
    onPick();
    trackEvent('home_starter_pick', { ticker: p.ticker, action: watched.has(p.ticker) ? 'remove' : 'add', source: searching ? 'search' : 'suggestion' });
    if (watched.has(p.ticker)) remove.mutate({ symbol: p.ticker });
    else add.mutate({ symbol: p.ticker, company_name: p.name });
  };

  return (
    <HomeSection title={t('starterTitle')}>
      <div className={cn(homePanel, 'p-5')}>
        <p className="max-w-[65ch] text-sm text-muted-foreground">{t('starterIntro')}</p>

        <label className="relative mt-4 block">
          <span className="sr-only">{t('starterSearchLabel')}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('starterSearchPlaceholder')}
            autoComplete="off"
            className="h-10 pl-9"
          />
        </label>

        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((s) => {
            const on = watched.has(s.ticker);
            const pct = quotes?.[s.ticker]?.changePercent;
            return (
              <li key={s.ticker}>
                <button
                  type="button"
                  onClick={() => toggle(s)}
                  aria-pressed={on}
                  className={cn(
                    'flex min-h-14 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    on ? 'border-foreground/40 bg-muted/50' : 'border-border/60 hover:border-border hover:bg-muted/30',
                  )}
                >
                  <CompanyLogo ticker={s.ticker} name={s.name} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground">{s.ticker}</span>
                    {/* clamp-ok: a company name in a tile; the ticker beside it identifies the pick */}
                    <span className="block truncate text-xs text-muted-foreground" title={s.name}>{s.name}</span>
                  </span>
                  {pct !== undefined && (
                    <span
                      className={cn(
                        'shrink-0 font-mono text-xs tabular-nums',
                        pct >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
                      )}
                    >
                      {pct >= 0 ? '+' : '−'}{Math.abs(pct).toFixed(2)}%
                    </span>
                  )}
                  <span
                    aria-hidden
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors',
                      on ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground',
                    )}
                  >
                    {on ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <Plus className="h-3.5 w-3.5" />}
                  </span>
                </button>
              </li>
            );
          })}
          {searching && list.length === 0 && (
            <li className="text-sm text-muted-foreground">{t('starterNoResults')}</li>
          )}
        </ul>

        <div className="mt-5 flex flex-col-reverse gap-4 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            <Link href="/holdings" className="text-foreground underline-offset-4 hover:underline">
              {t('starterOwnLink')}
            </Link>
            <span aria-hidden className="mx-2">·</span>
            <button type="button" onClick={() => openAIPanel({ query: '' })} className="text-foreground underline-offset-4 hover:underline">
              {t('starterAskBull')}
            </button>
          </p>
          <Button
            onClick={() => {
              trackEvent('home_starter_done', { count: watched.size });
              onDone();
            }} disabled={watched.size === 0} className="sm:min-w-40">
            {watched.size === 0 ? t('starterDoneEmpty') : t('starterDone', { count: watched.size })}
          </Button>
        </div>
      </div>
    </HomeSection>
  );
}
