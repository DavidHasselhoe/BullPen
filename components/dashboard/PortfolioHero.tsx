'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { ArrowDown, ArrowRight, ArrowUp, Minus, Sparkles } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { AiPaywallDialog } from '@/components/billing/AiPaywallDialog';
import { ClampedText } from '@/components/ui/ClampedText';
import { AskBullChips } from '@/components/dashboard/AskBullChips';
import { useEntitlements } from '@/hooks/use-entitlements';
import { WHY_TODAY_MIN_MOVE, type InlineWhy } from '@/lib/ai/why-today-shared';
import { SERIES_RANGES, buildPortfolioSeries, type SeriesRange } from '@/lib/dashboard/portfolio-series';
import { trackEvent } from '@/lib/analytics/track';
import type { BatchQuote } from '@/lib/market-data/quote-batcher';
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
 * The portfolio line over the chosen period, from each position's candles
 * (shared server caches, the same bars the stock pages use). The chart and the
 * figure under it are the same series, so they can never tell two stories.
 */
function useRangeSeries(holdings: UserHolding[], range: SeriesRange, quotes?: Record<string, BatchQuote>) {
  const eligible = useMemo(
    () => holdings.filter((h) => h.avg_price != null && h.quantity != null && h.quantity > 0),
    [holdings],
  );
  const key = eligible.map((h) => `${h.symbol}:${h.avg_price}:${h.quantity}`).join(',');

  const { data, isLoading } = useQuery({
    queryKey: ['portfolio-series', range, key],
    queryFn: () =>
      Promise.all(
        eligible.map(async (h) => {
          try {
            const res = await fetch(`/api/stock/${encodeURIComponent(h.symbol)}/candles?range=${range}`);
            if (!res.ok) return { holding: h, candles: null };
            const json = await res.json();
            return { holding: h, candles: (json.candles ?? null) as CandleData | null };
          } catch {
            return { holding: h, candles: null };
          }
        }),
      ),
    enabled: eligible.length > 0,
    staleTime: range === '1D' ? 60 * 1000 : 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  return useMemo(() => {
    const inputs = (data ?? []).flatMap(({ holding, candles }) => {
      if (!candles) return [];
      const q = quotes?.[holding.symbol];
      return [{
        candles,
        quantity: holding.quantity!,
        openedAt: new Date(holding.date_purchased ?? holding.created_at).getTime(),
        avgPrice: holding.avg_price!,
        prevClose: q ? q.price - q.change : null,
      }];
    });
    return { isLoading, ...buildPortfolioSeries(inputs, range) };
  }, [data, isLoading, quotes, range]);
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

/**
 * Inline "why it moved" for the movers that moved enough to have a story:
 * every qualifying mover for Pro, the single biggest one for everyone else.
 * The server shares one explanation per stock per day across all users and
 * decides what it will actually generate; this only avoids asking for moves
 * too small to explain.
 */
function useInlineWhy(movers: HomeMover[]) {
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

/** "• one\n• two" → ["one", "two"]; text without bullets stays one item. */
function bullets(text: string): string[] {
  const items = text.split(/\n+/).map((l) => l.replace(/^\s*[•\-*]\s*/, '').trim()).filter(Boolean);
  return items.length > 0 ? items : [text.trim()];
}

function MoverRow({ mover, why, onWhy }: { mover: HomeMover; why: InlineWhy | 'loading' | null; onWhy: () => void }) {
  const { t } = useTranslation('discover');
  const explained = why !== null && why !== 'loading' && why.status === 'ready' ? why.text : null;
  const writing = why === 'loading' || (why !== null && why.status === 'pending');

  // Analytics only (no state): did anyone get an explanation, and read it.
  useEffect(() => {
    if (explained) trackEvent('home_why_inline_shown', { ticker: mover.symbol });
  }, [explained, mover.symbol]);

  return (
    <li className="px-4 py-2.5 sm:px-5">
      <div className="flex items-center gap-3">
        <CompanyLogo ticker={mover.symbol} name={mover.name} logoUrl={mover.logoUrl} size={28} />
        <Link href={slugToAssetPath(mover.symbol)} className="group min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground group-hover:underline">{mover.symbol}</span>
          {/* clamp-ok: a company name in a dense row; the full name is one click away */}
          <span className="block truncate text-xs text-muted-foreground" title={mover.name}>
            {mover.held ? t('homeMoverHeld', { name: mover.name }) : t('homeMoverWatching', { name: mover.name })}
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

      {explained && (
        <div className="mt-2 flex gap-2 pl-10 text-xs leading-relaxed text-muted-foreground">
          <Sparkles className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <ClampedText
            lines={2}
            className="min-w-0 flex-1"
            onToggle={(open) => open && trackEvent('home_why_inline_expanded', { ticker: mover.symbol })}
          >
            <span className="sr-only">{t('homeWhyLabel', { ticker: mover.symbol })} </span>
            {bullets(explained).map((b, i) => (
              <span key={i} className={cn('block', i > 0 && 'mt-1')}>{b}</span>
            ))}
          </ClampedText>
        </div>
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
  // 1D by default: the line then ends at the "today" figure right above it.
  const [range, setRange] = useState<SeriesRange>('1D');
  const series = useRangeSeries(home.holdings, range, home.quotes);
  const whyFor = useInlineWhy(home.movers);
  const { requestWhyToday, paywallOpen, setPaywallOpen, paywallQuota } = useWhyTodayGate();
  const canWhy = useEntitlements().can('why_today');

  const title =home.hasHoldings ? t('homePortfolioTitle') : t('homeWatchlistTitle');
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
            why={whyFor(m.symbol)}
            onWhy={() => {
              trackEvent('home_why_clicked', { ticker: m.symbol, pro: canWhy });
              requestWhyToday({ ticker: m.symbol, price: m.price, change: m.change, changePct: m.changePercent });
            }}
          />
        ))}
      </ul>
    </div>
  );

  const p = home.portfolio;
  const chartUp = (series.changePct ?? 0) >= 0;
  const chartColor = chartUp ? '#10b981' : '#ef4444';
  const rangeLabel: Record<SeriesRange, string> = {
    '1D': t('homeRangeToday'),
    '1W': t('homePastWeek'),
    '1M': t('homePastMonth'),
    '1Y': t('homePastYear'),
  };

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

            <div className="flex flex-1 flex-col pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {/* 1D shows no figure here: "today" is already the headline right above. */}
                <p className="flex flex-wrap items-center gap-x-2 text-xs">
                  <span className="text-muted-foreground">{rangeLabel[range]}</span>
                  {range !== '1D' && series.changeUSD != null && series.changePct != null && (
                    <Change value={series.changeUSD * home.usdRate} pct={series.changePct} currency={home.currency} round={roundNumbers} />
                  )}
                </p>
                <div role="group" aria-label={t('homeChartPeriod')} className="flex gap-0.5 rounded-md bg-muted/50 p-0.5">
                  {SERIES_RANGES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      aria-pressed={r === range}
                      onClick={() => {
                        setRange(r);
                        trackEvent('home_chart_range', { range: r });
                      }}
                      className={cn(
                        'h-8 min-w-10 rounded px-2 font-mono text-xs font-medium transition-colors sm:h-7',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        r === range ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-2 min-h-20 flex-1" aria-hidden>
                {series.points.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={series.points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="home-series-fill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={chartColor} stopOpacity={0.2} />
                          <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="pl" stroke={chartColor} strokeWidth={1.5} fill="url(#home-series-fill)" dot={false} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : series.isLoading ? (
                  <div className="h-full min-h-20 w-full animate-shimmer rounded" />
                ) : (
                  <p className="pt-6 text-center text-xs text-muted-foreground">{t('homeChartEmpty')}</p>
                )}
              </div>
            </div>
          </div>
        )}
        {moversList || (
          <p className="p-5 text-sm text-muted-foreground">{t('homeMoversEmpty')}</p>
        )}
      </div>

      <AskBullChips movers={home.movers} heldSymbols={home.holdings.map((h) => h.symbol)} />

      <AiPaywallDialog
        open={paywallOpen}
        onOpenChange={setPaywallOpen}
        featureName={t('whyTodayWidgetFeatureName')}
        quota={paywallQuota}
      />
    </HomeSection>
  );
}
