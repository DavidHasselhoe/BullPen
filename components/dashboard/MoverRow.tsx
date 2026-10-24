'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Minus, Sparkles } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { ClampedText } from '@/components/ui/ClampedText';
import { InkReveal, InkBullets } from '@/components/ai/InkText';
import { useEntitlements } from '@/hooks/use-entitlements';
import { WHY_TODAY_MIN_MOVE, whyBullets, type InlineWhy } from '@/lib/ai/why-today-shared';
import { trackEvent } from '@/lib/analytics/track';
import type { HomeMover } from '@/hooks/use-home-portfolio';
import { formatCurrency, type CurrencyCode } from '@/lib/currency/currency-conversion';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { displayCompanyName } from '@/lib/market-data/company-name';
import { cn } from '@/lib/utils';

/**
 * A mover row with Bull's inline "why it moved", shared by Home's Biggest
 * moves and the watchlist's list movers. Its own module so the watchlist
 * doesn't pull Home's portfolio chart into its bundle.
 */
export function Change({ value, pct, currency, round, className }: {
  value?: number;
  pct: number;
  currency?: CurrencyCode;
  round?: boolean;
  className?: string;
}) {
  const up = pct > 0.005;
  const down = pct < -0.005;
  const Icon = up ? ArrowUp : down ? ArrowDown : Minus;
  const sign = up ? '+' : down ? '−' : '';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-mono tabular-nums',
        up ? 'text-emerald-700 dark:text-emerald-400' : down ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground',
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {value != null && currency && (
        <>{sign}{formatCurrency(Math.abs(value), currency, round ? { round: true } : undefined)} </>
      )}
      {value != null ? '(' : ''}{sign}{Math.abs(pct).toFixed(2)}%{value != null ? ')' : ''}
    </span>
  );
}

/**
 * Inline "why it moved" for the movers that moved enough to have a story:
 * every qualifying mover for Pro, the single biggest one for everyone else.
 * The server shares one explanation per stock per day across all users and
 * decides what it will actually generate; this only avoids asking for moves
 * too small to explain.
 */
export function useInlineWhy(movers: HomeMover[]) {
  const { i18n } = useTranslation();
  const { can } = useEntitlements();
  const eligible = movers.filter((m) => Math.abs(m.changePercent) >= WHY_TODAY_MIN_MOVE).map((m) => m.symbol);
  const tickers = can('why_today') ? eligible : eligible.slice(0, 1);

  const query = useQuery({
    queryKey: ['why-today-inline', tickers.join(','), i18n.language],
    queryFn: async (): Promise<Record<string, InlineWhy>> => {
      const res = await fetch('/api/ai/why-today/inline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers, language: i18n.language }),
      });
      if (!res.ok) return {};
      return (await res.json()).explanations ?? {};
    },
    enabled: tickers.length > 0,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
    // Another page load is writing one of these right now: ask again shortly.
    refetchInterval: (q) => (Object.values(q.state.data ?? {}).some((e) => e.status === 'pending') ? 8000 : false),
  });

  return (symbol: string): InlineWhy | 'loading' | null => {
    if (!tickers.includes(symbol)) return null;
    if (query.isLoading) return 'loading';
    return query.data?.[symbol] ?? null;
  };
}

/** `${source}:${symbol}` already reported as shown. Module memory, so a visit ends on a full page load. */
const shownWhyThisVisit = new Set<string>();

/** `source` prefixes the analytics events, so the watchlist's reads don't count as Home's. */
export function MoverRow({ mover, why, onWhy, source = 'home' }: { mover: HomeMover; why: InlineWhy | 'loading' | null; onWhy: () => void; source?: 'home' | 'watchlist' }) {
  const { t } = useTranslation('discover');
  const explained = why !== null && why !== 'loading' && why.status === 'ready' ? why.text : null;
  const writing = why === 'loading' || (why !== null && why.status === 'pending');

  // Analytics only (no state): did anyone get an explanation, and read it.
  // Once per stock per visit: rows remount on every refetch, which sent 700+
  // events from 3 people in a month.
  useEffect(() => {
    const key = `${source}:${mover.symbol}`;
    if (!explained || shownWhyThisVisit.has(key)) return;
    shownWhyThisVisit.add(key);
    trackEvent(`${source}_why_inline_shown`, { ticker: mover.symbol });
  }, [explained, mover.symbol, source]);

  return (
    <li className="px-4 py-2.5 sm:px-5">
      <div className="flex items-center gap-3">
        <CompanyLogo ticker={mover.symbol} name={mover.name} logoUrl={mover.logoUrl} size={28} />
        <Link href={slugToAssetPath(mover.symbol)} className="group min-w-0 flex-1">
          {/* clamp-ok: a company name in a dense row; the full name is in the title */}
          <span className="block truncate text-sm font-semibold text-foreground group-hover:underline" title={mover.name}>
            {displayCompanyName(mover.name || mover.symbol, mover.symbol)}
          </span>
          <span className="block text-xs text-muted-foreground">
            {mover.held ? t('homeMoverHeld', { name: mover.symbol }) : t('homeMoverWatching', { name: mover.symbol })}
          </span>
        </Link>
        <Change pct={mover.changePercent} className="text-sm font-medium" />
        {!explained && !writing && (
          <button
            type="button"
            onClick={onWhy}
            className="h-9 shrink-0 rounded-md border border-border/60 px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8"
            aria-label={t('homeMoverWhyAria', { ticker: mover.symbol })}
          >
            {t('whyTodayWidgetWhyButton')}
          </button>
        )}
      </div>

      {/* Opens from the height of the "Reading the news" line it replaces, so
          the row grows into the explanation instead of collapsing first. */}
      {explained && (
        <InkReveal className="min-h-6">
          <div className="flex gap-2 pl-10 pt-2 text-xs leading-relaxed text-muted-foreground">
            <Sparkles className="ink-glint mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            <ClampedText
              lines={2}
              className="min-w-0 flex-1"
              textClassName="ink-ellipsis"
              onToggle={(open) => open && trackEvent(`${source}_why_inline_expanded`, { ticker: mover.symbol })}
            >
              <span className="sr-only">{t('homeWhyLabel', { ticker: mover.symbol })} </span>
              <InkBullets bullets={whyBullets(explained)} bulletClassName={(i) => (i > 0 ? 'mt-1' : undefined)} />
            </ClampedText>
          </div>
        </InkReveal>
      )}
      {writing && (
        <p className="mt-2 flex items-center gap-2 pl-10 text-xs text-muted-foreground" role="status">
          <Sparkles className="h-3 w-3 shrink-0 animate-pulse" aria-hidden />
          {t('homeWhyReading')}
        </p>
      )}
    </li>
  );
}
