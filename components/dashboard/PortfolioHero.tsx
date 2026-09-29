'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { ArrowDown, ArrowRight, ArrowUp, Minus } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { AiPaywallDialog } from '@/components/billing/AiPaywallDialog';
import { HomeSection, homePanel } from '@/components/dashboard/HomeSection';
import { useHomePortfolio, type HomeMover } from '@/hooks/use-home-portfolio';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useWhyTodayGate } from '@/hooks/use-why-today-gate';
import { formatCurrency, type CurrencyCode } from '@/lib/currency/currency-conversion';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { cn } from '@/lib/utils';
import type { UserHolding } from '@/lib/types/database';

type CandleData = { t: number[]; c: number[] };

/**
 * Past-week P/L of the current positions, from 1W candles. The chart and the
 * "past week" figure under it are the same series, so they can never tell two
 * stories. Positions bought mid-week are baselined at their own purchase price.
 */
function useWeekSeries(holdings: UserHolding[]) {
  const eligible = useMemo(
    () => holdings.filter((h) => h.avg_price != null && h.quantity != null && h.quantity > 0),
    [holdings],
  );
  const key = eligible.map((h) => `${h.symbol}:${h.avg_price}:${h.quantity}`).join(',');

  const { data, isLoading } = useQuery({
    queryKey: ['portfolio-sparkline-week', key],
    queryFn: () =>
      Promise.all(
        eligible.map(async (h) => {
          try {
            const res = await fetch(`/api/stock/${encodeURIComponent(h.symbol)}/candles?range=1W`);
            if (!res.ok) return { holding: h, candles: null };
            const json = await res.json();
            return { holding: h, candles: (json.candles ?? null) as CandleData | null };
          } catch {
            return { holding: h, candles: null };
          }
        }),
      ),
    enabled: eligible.length > 0,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  return useMemo(() => {
    const plByTime = new Map<number, number>();
    const basisByTime = new Map<number, number>();
    for (const { holding, candles } of data ?? []) {
      if (!candles || candles.t.length === 0 || holding.avg_price == null || holding.quantity == null) continue;
      const start = new Date(holding.date_purchased ?? holding.created_at).getTime();
      const base = start > candles.t[0] * 1000 ? holding.avg_price : candles.c[0];
      candles.t.forEach((t, i) => {
        if (t * 1000 < start) return;
        plByTime.set(t, (plByTime.get(t) ?? 0) + (candles.c[i] - base) * holding.quantity!);
        basisByTime.set(t, (basisByTime.get(t) ?? 0) + base * holding.quantity!);
      });
    }
    const times = [...plByTime.keys()].sort((a, b) => a - b);
    if (times.length < 2) return { isLoading, points: [], weekUSD: null, weekPct: null };
    const points = times.map((t) => {
      const basis = basisByTime.get(t) ?? 0;
      return { pl: basis > 0 ? ((plByTime.get(t) ?? 0) / basis) * 100 : 0 };
    });
    const last = times[times.length - 1];
    const weekUSD = plByTime.get(last) ?? 0;
    const basis = basisByTime.get(last) ?? 0;
    return { isLoading, points, weekUSD, weekPct: basis > 0 ? (weekUSD / basis) * 100 : 0 };
  }, [data, isLoading]);
}

function Change({ value, pct, currency, round, className }: {
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

function MoverRow({ mover, onWhy }: { mover: HomeMover; onWhy: () => void }) {
  const { t } = useTranslation('discover');
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
      <CompanyLogo ticker={mover.symbol} name={mover.name} logoUrl={mover.logoUrl} size={28} />
      <Link href={slugToAssetPath(mover.symbol)} className="group min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground group-hover:underline">{mover.symbol}</span>
        {/* clamp-ok: a company name in a dense row; the full name is one click away */}
        <span className="block truncate text-xs text-muted-foreground" title={mover.name}>
          {mover.held ? t('homeMoverHeld', { name: mover.name }) : t('homeMoverWatching', { name: mover.name })}
        </span>
      </Link>
      <Change pct={mover.changePercent} className="text-sm font-medium" />
      <button
        type="button"
        onClick={onWhy}
        className="h-9 shrink-0 rounded-md border border-border/60 px-3 text-xs font-medium sm:h-8 text-muted-foreground transition-colors hover:border-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={t('homeMoverWhyAria', { ticker: mover.symbol })}
      >
        {t('whyTodayWidgetWhyButton')}
      </button>
    </li>
  );
}

function PanelSkeleton() {
  return (
    <div className={cn(homePanel, 'grid gap-6 p-5 md:grid-cols-2')} aria-hidden>
      <div className="space-y-3">
        <div className="h-8 w-44 animate-shimmer rounded" />
        <div className="h-4 w-36 animate-shimmer rounded" />
        <div className="h-16 w-full animate-shimmer rounded" />
      </div>
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-9 w-full animate-shimmer rounded" />)}
      </div>
    </div>
  );
}

/**
 * The first thing under the greeting: what my money did, and which of my
 * stocks did it. Owners see value, the day's change and the past week beside
 * their biggest movers; watchlist-only accounts see just the movers.
 */
export function PortfolioHero() {
  const { t } = useTranslation('discover');
  const { roundNumbers } = useUserSettings();
  const home = useHomePortfolio();
  const week = useWeekSeries(home.holdings);
  const { requestWhyToday, paywallOpen, setPaywallOpen, paywallQuota } = useWhyTodayGate();

  const title = home.hasHoldings ? t('homePortfolioTitle') : t('homeWatchlistTitle');
  const aside = (
    <Link
      href={home.hasHoldings ? '/holdings' : '/watchlist'}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      {home.hasHoldings ? t('homePortfolioLink') : t('homeWatchlistLink')}
      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </Link>
  );

  if (home.isLoading) {
    return <HomeSection title={t('homePortfolioTitle')}><PanelSkeleton /></HomeSection>;
  }

  if (home.pricesFailed) {
    return (
      <HomeSection title={title} aside={aside}>
        <p className={cn(homePanel, 'px-5 py-6 text-sm text-muted-foreground')}>{t('homePricesFailed')}</p>
      </HomeSection>
    );
  }

  const last = home.session === 'closed';
  const moversList = home.movers.length > 0 && (
    <div className="min-w-0">
      <h3 className="px-4 pt-4 text-sm font-medium text-foreground sm:px-5">
        {last ? t('homeMoversTitleLast') : t('homeMoversTitle')}
      </h3>
      <ul className="py-1.5">
        {home.movers.map((m) => (
          <MoverRow
            key={m.symbol}
            mover={m}
            onWhy={() => requestWhyToday({ ticker: m.symbol, price: m.price, change: m.change, changePct: m.changePercent })}
          />
        ))}
      </ul>
    </div>
  );

  const p = home.portfolio;
  const chartUp = (week.weekPct ?? 0) >= 0;
  const chartColor = chartUp ? '#10b981' : '#ef4444';

  return (
    <HomeSection title={title} aside={aside}>
      <div className={cn(homePanel, 'grid min-w-0', p && 'divide-y divide-border/60 md:grid-cols-2 md:divide-x md:divide-y-0')}>
        {p && (
          <div className="flex min-w-0 flex-col gap-1 p-5">
            <p className="font-mono text-3xl font-semibold tracking-tight tabular-nums text-foreground">
              {formatCurrency(p.value, home.currency, roundNumbers ? { round: true } : undefined)}
            </p>
            <p className="flex flex-wrap items-center gap-x-2 text-sm">
              <Change value={p.todayChange} pct={p.todayPct} currency={home.currency} round={roundNumbers} className="font-medium" />
              <span className="text-muted-foreground">{last ? t('homeChangeLastSession') : t('homeChangeToday')}</span>
            </p>

            {week.points.length > 1 && week.weekUSD != null && week.weekPct != null && (
              <div className="flex flex-1 flex-col pt-4">
                <div className="min-h-16 flex-1" aria-hidden>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={week.points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="home-week-fill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={chartColor} stopOpacity={0.2} />
                          <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="pl" stroke={chartColor} strokeWidth={1.5} fill="url(#home-week-fill)" dot={false} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs">
                  <span className="text-muted-foreground">{t('homePastWeek')}</span>
                  <Change value={week.weekUSD * home.usdRate} pct={week.weekPct} currency={home.currency} round={roundNumbers} />
                </p>
              </div>
            )}
          </div>
        )}
        {moversList || (
          <p className="p-5 text-sm text-muted-foreground">{t('homeMoversEmpty')}</p>
        )}
      </div>

      <AiPaywallDialog
        open={paywallOpen}
        onOpenChange={setPaywallOpen}
        featureName={t('whyTodayWidgetFeatureName')}
        quota={paywallQuota}
      />
    </HomeSection>
  );
}
