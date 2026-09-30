'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { cn } from '@/lib/utils';
import type { IndexMover, IndexMovers } from '@/lib/market-data/index-movers';

const SHOWN = 5;

/**
 * The index members that moved most, gainers beside losers.
 *
 * Sits after the index strip: first how the market feels, then which names
 * made it feel that way. The ranking and its definition (S&P 500 + Nasdaq-100,
 * regular session only, stale quotes dropped) live in lib/market-data/index-movers.ts.
 * The numbers are the ranked snapshot rather than live ticks, so the order on
 * screen always matches the figures next to it.
 */
export function MarketMovers() {
  const { t, i18n } = useTranslation('discover');
  const { data } = useQuery<{ success: boolean; movers?: IndexMovers }>({
    queryKey: ['market-movers'],
    queryFn: async () => {
      const res = await fetch('/api/market/movers');
      if (!res.ok) throw new Error(`Movers failed: ${res.status}`);
      return res.json();
    },
    staleTime: 3 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    // A cheap CDN-cached read. Polling picks up the refresh the server runs in
    // the background: a "last session" list at the open rolls over to live.
    refetchInterval: (q) => (q.state.data?.movers ? 5 * 60 * 1000 : 60 * 1000),
    refetchOnWindowFocus: false,
  });

  const movers = data?.movers;
  if (!movers || (movers.gainers.length === 0 && movers.losers.length === 0)) return null;

  // asOf is a New York calendar date; noon UTC keeps it on the same day in every zone.
  const day = movers.asOf
    ? new Date(`${movers.asOf}T12:00:00Z`).toLocaleDateString(i18n.language, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      })
    : null;

  return (
    <section aria-labelledby="movers-heading" className="mb-10">
      <div className="mb-3">
        <h2 id="movers-heading" className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          {t('moversHeading')}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {movers.session === 'live' || !day ? t('moversSubtitleLive') : t('moversSubtitleLast', { day })}
        </p>
      </div>

      <div className="grid overflow-hidden rounded-xl border border-border/50 bg-card/40 md:grid-cols-2 md:divide-x md:divide-border/50">
        <MoverList title={t('moversGainers')} rows={movers.gainers.slice(0, SHOWN)} />
        <MoverList title={t('moversLosers')} rows={movers.losers.slice(0, SHOWN)} className="border-t border-border/50 md:border-t-0" />
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">{t('moversFooterNote')}</p>
    </section>
  );
}

function MoverList({ title, rows, className }: { title: string; rows: IndexMover[]; className?: string }) {
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
                <span className="block text-sm font-semibold text-foreground group-hover:underline">{m.symbol}</span>
                {/* clamp-ok: a company name in a dense row; the full name is one click away */}
                <span className="block truncate text-xs text-muted-foreground" title={m.name ?? undefined}>
                  {m.name ?? m.symbol}
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
