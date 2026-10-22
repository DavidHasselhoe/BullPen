'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { LineChart } from '@/components/charts/line-chart';
import { Area } from '@/components/charts/area';
import { ChartTooltip } from '@/components/charts/tooltip';
import { ArrowRight } from 'lucide-react';
import { AiPaywallDialog } from '@/components/billing/AiPaywallDialog';
import { AskBullChips } from '@/components/dashboard/AskBullChips';
import { Change, MoverRow, useInlineWhy } from '@/components/dashboard/MoverRow';
import { useEntitlements } from '@/hooks/use-entitlements';
import { SERIES_RANGES, buildPortfolioSeries, type MarketSession, type SeriesRange } from '@/lib/dashboard/portfolio-series';
import { SessionLine, SessionLegend, SESSION_MUTED_STROKE as MUTED_STROKE, type SessionRegion } from '@/components/charts/session-line';
import { trackEvent } from '@/lib/analytics/track';
import type { BatchQuote } from '@/lib/market-data/quote-batcher';
import { HomeSection, homePanel } from '@/components/dashboard/HomeSection';
import { useHomePortfolio } from '@/hooks/use-home-portfolio';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useWhyTodayGate } from '@/hooks/use-why-today-gate';
import { formatCurrency } from '@/lib/currency/currency-conversion';
import { cn } from '@/lib/utils';
import type { UserHolding } from '@/lib/types/database';

type CandleData = { t: number[]; c: number[]; session?: MarketSession[] };


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
  // The series is in USD; the headline above is in the user's currency, so the
  // tooltip converts the same way the headline does.
  const chartData = useMemo(
    () => series.points.map((pt) => ({ date: new Date(pt.t * 1000), pl: pt.pl * home.usdRate, plPct: pt.plPct, session: pt.session })),
    [series.points, home.usdRate],
  );
  // On 1D, pre-market and after-hours draw like the stock chart's (muted,
  // dashed / dotted, no fill), so the regular session reads as the day.
  // Consecutive same-session runs, as in StockPricePanel.
  const sessionRegions = useMemo<SessionRegion[]>(() => {
    const regions: SessionRegion[] = [];
    series.points.forEach((pt, i) => {
      if (!pt.session) return;
      const current = regions[regions.length - 1];
      if (current && current.session === pt.session) current.endIndex = i;
      else regions.push({ startIndex: i, endIndex: i, session: pt.session });
    });
    return regions.some((r) => r.session !== 'regular') ? regions : [];
  }, [series.points]);
  const sessionsShown = [...new Set(sessionRegions.map((r) => r.session))];
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
  const sessionLabel = (s: MarketSession) =>
    s === 'pre' ? t('homeSessionPre') : s === 'post' ? t('homeSessionPost') : t('homeSessionRegular');
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
                {chartData.length > 1 ? (
                  // Same chart kit and tooltip as the Holdings performance chart, kept
                  // compact: no grid or axis. pan-y (the kit sets touch-action: none)
                  // so a vertical swipe starting on the chart still scrolls Home,
                  // while a horizontal drag scrubs the tooltip.
                  <LineChart
                    key={range}
                    data={chartData}
                    margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
                    aspectRatio=""
                    className="h-full min-h-20"
                    style={{ touchAction: 'pan-y' }}
                    zeroBaseline={false}
                  >
                    {sessionRegions.length > 0 ? (
                      <SessionLine dataKey="pl" regions={sessionRegions} regularStroke={chartColor} strokeWidth={1.5} showArea fillOpacity={0.2} />
                    ) : (
                      <Area dataKey="pl" stroke={chartColor} strokeWidth={1.5} fill={chartColor} fillOpacity={0.2} showMarkers={false} />
                    )}
                    <ChartTooltip
                      showTime={range === '1D' || range === '1W'}
                      showYear={range === '1Y'}
                      rows={(point) => {
                        const pl = point.pl as number;
                        const pct = point.plPct as number;
                        const sign = pct > 0.005 ? '+' : pct < -0.005 ? '−' : '';
                        const money = formatCurrency(Math.abs(pl), home.currency, roundNumbers ? { round: true } : undefined);
                        const session = sessionRegions.length > 0 ? (point.session as MarketSession | undefined) : undefined;
                        return [
                          {
                            label: t('homeChartTooltipPl'),
                            value: `${sign}${money} (${sign}${Math.abs(pct).toFixed(2)}%)`,
                            color: session && session !== 'regular' ? MUTED_STROKE : chartColor,
                          },
                          ...(session ? [{ label: t('homeChartSession'), value: sessionLabel(session), color: MUTED_STROKE }] : []),
                        ];
                      }}
                    />
                  </LineChart>
                ) : series.isLoading ? (
                  <div className="h-full min-h-20 w-full animate-shimmer rounded" />
                ) : (
                  <p className="pt-6 text-center text-xs text-muted-foreground">{t('homeChartEmpty')}</p>
                )}
              </div>
              {/* Says what the dashed and dotted parts are; only when the line has them. */}
              {sessionsShown.length > 1 && (
                <SessionLegend
                  sessions={sessionsShown}
                  regularStroke={chartColor}
                  label={sessionLabel}
                  className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
                />
              )}
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
