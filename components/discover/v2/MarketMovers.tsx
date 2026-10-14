'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { cn } from '@/lib/utils';
import type { IndexMover, IndexMovers, PremarketMovers } from '@/lib/market-data/index-movers';
import { displayCompanyName } from '@/lib/market-data/company-name';

const SHOWN = 5;

/**
 * The index members that moved most, gainers beside losers.
 *
 * Sits after the index strip: first how the market feels, then which names
 * made it feel that way. The ranking and its definition (S&P 500 + Nasdaq-100,
 * regular session only, stale quotes dropped) live in lib/market-data/index-movers.ts.
 * The numbers are the ranked snapshot rather than live ticks, so the order on
 * screen always matches the figures next to it.
 *
 * During pre-market a toggle adds this morning's movers beside the last
 * session's, and opens on them: for a European reader that window is most of
 * the working day, and the last session's list is old news by then.
 */
export function MarketMovers() {
  const { t, i18n } = useTranslation('discover');
  const [view, setView] = useState<'premarket' | 'last'>('premarket');
  const { data } = useQuery<{ success: boolean; movers?: IndexMovers; premarket?: PremarketMovers | null; premarketPending?: boolean }>({
    queryKey: ['market-movers'],
    queryFn: async () => {
      const res = await fetch('/api/market/movers');
      if (!res.ok) throw new Error(`Movers failed: ${res.status}`);
      return res.json();
    },
    staleTime: 3 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    // A cheap CDN-cached read. Polling picks up the refresh the server runs in
    // the background: a "last session" list at the open rolls over to live, and
    // a pre-market list still being built shows up within the minute.
    refetchInterval: (q) => (q.state.data?.movers && !q.state.data.premarketPending ? 5 * 60 * 1000 : 30 * 1000),
    refetchOnWindowFocus: false,
  });

  const movers = data?.movers;
  if (!movers || (movers.gainers.length === 0 && movers.losers.length === 0)) return null;

  // Only offered once something has traded this morning; at 4:00 the list is empty.
  const pre = data?.premarket && (data.premarket.gainers.length > 0 || data.premarket.losers.length > 0) ? data.premarket : null;
  const showPre = pre !== null && view === 'premarket';
  const lists = showPre ? pre : movers;

  // asOf is a New York calendar date; noon UTC keeps it on the same day in every zone.
  const day = movers.asOf
    ? new Date(`${movers.asOf}T12:00:00Z`).toLocaleDateString(i18n.language, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      })
    : null;

  const weekday = movers.asOf
    ? new Date(`${movers.asOf}T12:00:00Z`).toLocaleDateString(i18n.language, { weekday: 'short', timeZone: 'UTC' })
    : null;

  return (
    <section aria-labelledby="movers-heading" className="mb-10">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 id="movers-heading" className="text-lg font-semibold tracking-tight text-foreground">
            {t('moversHeading')}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {showPre
              ? t('moversSubtitlePremarket', { day: weekday ?? day ?? '' })
              : movers.session === 'live' || !day ? t('moversSubtitleLive') : t('moversSubtitleLast', { day })}
          </p>
        </div>
        {pre && (
          <div role="group" aria-label={t('moversToggleLabel')} className="flex shrink-0 rounded-lg border border-border/60 bg-muted/30 p-0.5">
            <button
              type="button"
              aria-pressed={!showPre}
              onClick={() => setView('last')}
              className={cn(
                'min-h-9 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                !showPre ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {weekday ? t('moversToggleLast', { day: weekday }) : t('moversToggleLastFallback')}
            </button>
            <button
              type="button"
              aria-pressed={showPre}
              onClick={() => setView('premarket')}
              className={cn(
                'inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                showPre ? 'bg-background text-amber-600 shadow-sm dark:text-amber-500' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {/* Same amber marker as the pre-market pill on Holdings and the watchlist. */}
              <span className={cn('h-1.5 w-1.5 rounded-full bg-amber-500', showPre && 'animate-pulse')} aria-hidden />
              {t('moversTogglePremarket')}
            </button>
          </div>
        )}
      </div>

      <div className="grid overflow-hidden rounded-xl border border-border/50 bg-card/40 md:grid-cols-2 md:divide-x md:divide-border/50">
        <MoverList title={t('moversGainers')} rows={lists.gainers.slice(0, SHOWN)} earningsLabel={t('moversEarnings')} />
        <MoverList title={t('moversLosers')} rows={lists.losers.slice(0, SHOWN)} earningsLabel={t('moversEarnings')} className="border-t border-border/50 md:border-t-0" />
      </div>

      <p className="mt-2 text-xs text-muted-foreground">{showPre ? t('moversFooterPremarket') : t('moversFooterNote')}</p>
    </section>
  );
}

function MoverList({ title, rows, earningsLabel, className }: { title: string; rows: IndexMover[]; earningsLabel: string; className?: string }) {
  if (rows.length === 0) return null;
  return (
    <div className={cn('min-w-0', className)}>
      <h3 className="px-4 pt-3 text-xs font-medium text-foreground sm:px-5">{title}</h3>
      <ul className="py-1">
        {rows.map((m) => (
          <li key={m.symbol}>
            <Link
              href={slugToAssetPath(m.symbol)}
              className="group flex items-center gap-3 px-4 py-2 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none sm:px-5"
            >
              <CompanyLogo ticker={m.symbol} name={m.name ?? m.symbol} logoUrl={m.logo_url} size={28} />
              <span className="min-w-0 flex-1">
                {/* clamp-ok: a company name in a dense row; the full name is one click away */}
                <span className="block truncate text-sm font-semibold text-foreground group-hover:underline" title={m.name ?? undefined}>
                  {displayCompanyName(m.name ?? m.symbol, m.symbol)}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">{m.symbol}</span>
                  {/* Most pre-market moves in index names are earnings reactions; this says which. */}
                  {m.earnings && (
                    <span className="rounded border border-border/70 px-1 py-px text-[10px] font-medium leading-none text-muted-foreground">
                      {earningsLabel}
                    </span>
                  )}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <Pct value={m.changePercent} />
                <span className="block font-mono text-xs tabular-nums text-muted-foreground">${m.price.toFixed(2)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Pct({ value }: { value: number }) {
  const up = value > 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-mono text-sm font-medium tabular-nums',
        up ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {up ? '+' : '−'}
      {Math.abs(value).toFixed(2)}%
    </span>
  );
}
