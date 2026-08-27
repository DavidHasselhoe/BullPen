'use client';

/**
 * StatisticsGrid — visual "Key Numbers".
 *
 * Metric cards that each answer one beginner question with a visual + a
 * plain-language insight line, instead of plain label→value rows. Same data
 * source and cache key throughout (['stock-statistics', ticker]).
 */

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TermTooltip } from '@/components/ui/TermTooltip';
import { useExperienceLevel } from '@/hooks/use-experience-level';
import { useAIPanel } from '@/components/ai/AIPanelProvider';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MetricCard } from '@/components/viz/MetricCard';
import { RangeBar } from '@/components/viz/RangeBar';
import { MeterBar } from '@/components/viz/MeterBar';
import { VolatilityGauge } from '@/components/stock/VolatilityGauge';
import {
  week52Insight,
  marketCapBand,
  marketCapInsight,
  peInsight,
  betaInsight,
  dividendInsight,
  marginInsight,
  growthInsight,
  sectorContext,
  pbInsight,
  evEbitdaInsight,
  psInsight,
  PE_DOMAIN,
  MARGIN_DOMAIN,
  GROWTH_DOMAIN,
  YIELD_DOMAIN,
  BETA_DOMAIN,
  PB_DOMAIN,
  EV_EBITDA_DOMAIN,
  PS_DOMAIN,
  type Distribution,
} from '@/lib/finance/metric-insights';
import type { SectorBenchmarks } from '@/lib/finance/sector-benchmarks';
import { selectMetrics, type ValuationMetric } from '@/lib/finance/metric-selector';
import { showCard, headlineMetric, foldsForwardPe, noteFor } from '@/components/stock/statistics-grid-metrics';
import type { CompanyStatistics } from '@/lib/twelvedata/twelvedata-client';
import type { SignalValue } from '@/lib/finance/health-score';

interface StatsResponse {
  success: boolean;
  stats?: CompanyStatistics;
  fetchedAt?: string | null;
  error?: string;
}

function fmt(value: number | null | undefined, type: 'currency' | 'ratio' | 'percent' | 'volume' | 'number' = 'number'): string {
  if (value === null || value === undefined || isNaN(value)) return '—';
  switch (type) {
    case 'currency': {
      const abs = Math.abs(value);
      if (abs >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
      if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
      if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
      // Locale-pinned: device locales like nb-NO would render "334,68"
      return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    case 'percent':
      return `${(value * 100).toFixed(2)}%`;
    case 'ratio':
      return value.toFixed(2);
    case 'volume': {
      if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
      if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
      return value.toLocaleString();
    }
    default:
      return value.toLocaleString();
  }
}

function formatFetchedAt(iso: string | null | undefined, t: TFunction): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (isToday) return t('statisticsGridUpdatedToday', { time });
  return t('statisticsGridUpdatedOn', { date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), time });
}

/** "How big is this company?" — a 5-band log scale with a marker. */
function CapBandScale({ marketCap, t }: { marketCap: number; t: TFunction }) {
  const { band, position } = marketCapBand(marketCap);
  const bands = [
    { key: 'Micro', label: t('statisticsGridBandMicro') },
    { key: 'Small', label: t('statisticsGridBandSmall') },
    { key: 'Mid', label: t('statisticsGridBandMid') },
    { key: 'Large', label: t('statisticsGridBandLarge') },
    { key: 'Mega', label: t('statisticsGridBandMega') },
  ] as const;
  const bandLabel = bands.find((b) => b.key === band)?.label ?? band;
  return (
    <div className="w-full" role="img" aria-label={t('statisticsGridCompanySizeAriaLabel', { band: bandLabel })}>
      <div className="relative flex h-1.5 w-full gap-[3px]">
        {bands.map((b) => (
          <div
            key={b.key}
            className={cn('h-full flex-1 rounded-full', b.key === band ? 'bg-foreground/50' : 'bg-muted')}
          />
        ))}
        <div
          className="absolute top-[-3px] h-3 w-[3px] -translate-x-1/2 rounded-full bg-foreground"
          style={{ left: `${Math.max(1.5, Math.min(98.5, position * 100))}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-xs leading-none text-muted-foreground">
        {bands.map((b) => (
          <span key={b.key} className={cn(b.key === band && 'font-medium text-foreground/80')}>{b.label}</span>
        ))}
      </div>
    </div>
  );
}

interface StatRow {
  label: string;
  value: string;
}

interface BenchmarksResponse {
  success: boolean;
  groupType: 'industry' | 'sector' | null;
  groupLabel: string | null;
  benchmarks: SectorBenchmarks;
}

export function StatisticsGrid({
  ticker,
  signals,
  currentPrice,
  sector,
  industry,
  forceFull = false,
}: {
  ticker: string;
  signals?: Record<string, SignalValue>;
  /** Live/last price for the 52-week range marker (from the page snapshot). */
  currentPrice?: number | null;
  /** Company sector — benchmark fallback when industry is unknown/thin. */
  sector?: string | null;
  /** Company industry — preferred "typical for its kind" benchmark peer group. */
  industry?: string | null;
  forceFull?: boolean;
}) {
  const { t } = useTranslation('stock');
  const { isSimplified: rawSimplified } = useExperienceLevel();
  // Local, non-destructive "show everything" toggle. Expanding the full stats
  // must NOT rewrite the user's saved experience level (it used to silently call
  // setLevel('intermediate')) — it's a per-view reveal, not an account change.
  const [expandedFull, setExpandedFull] = useState(false);
  const isSimplified = (forceFull || expandedFull) ? false : rawSimplified;
  const { open: openAIPanel } = useAIPanel();
  const handleAskAI = useCallback((q: string) => openAIPanel({ query: q }), [openAIPanel]);
  const [showAll, setShowAll] = useState(forceFull);

  const { data, isLoading } = useQuery<StatsResponse>({
    queryKey: ['stock-statistics', ticker],
    queryFn: async () => {
      const res = await fetch(`/api/stock/${ticker}/statistics`);
      return res.json();
    },
    enabled: !!ticker,
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Benchmarks — "typical for its kind" context. Prefers the industry peer
  // group (e.g. "Software"), falling back to the broader sector (e.g.
  // "Technology") server-side when industry is unknown or too thin. Reference
  // data, so cache long and never refetch on focus; a null/thin pair just
  // yields {}.
  const { data: benchData } = useQuery<BenchmarksResponse>({
    queryKey: ['sector-benchmarks', sector ?? '', industry ?? ''],
    queryFn: async () => {
      const path = encodeURIComponent(sector || industry || '');
      const qs = industry ? `?industry=${encodeURIComponent(industry)}` : '';
      const res = await fetch(`/api/sector-benchmarks/${path}${qs}`);
      return res.json();
    },
    enabled: !!sector || !!industry,
    staleTime: 12 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const benchmarks = benchData?.benchmarks;
  const benchmarkLabel = benchData?.groupLabel ?? industry ?? sector ?? '';
  const dist = (key: keyof SectorBenchmarks): Distribution | undefined => {
    const b = benchmarks?.[key];
    return b ? { p25: b.p25, median: b.median, p75: b.p75 } : undefined;
  };

  if (isLoading) {
    return (
      <Card className="mb-8">
        <CardHeader><CardTitle className="text-base font-semibold">{t('statisticsGridTitle')}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[132px] rounded-xl" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data?.success) {
    if (data?.error === 'plan_restricted') {
      return (
        <Card className="mb-8">
          <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">{t('statisticsGridTitle')}</CardTitle></CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground py-6 text-center">{t('statisticsGridEnterprisePlanRequired')}</p>
          </CardContent>
        </Card>
      );
    }
    return null;
  }
  if (!data.stats) return null;

  const s = data.stats;
  const updatedLabel = formatFetchedAt(data.fetchedAt, t);
  const sig = (key: string): SignalValue | undefined => (signals ? signals[key] : undefined);

  const hasRange = s.week52High != null && s.week52Low != null && s.week52High > s.week52Low;
  const price = currentPrice ?? null;

  const selection = selectMetrics({
    profitMargin: s.profitMargin,
    sector,
    industry,
    hasForwardEarnings: s.peRatioForward != null,
    dividendYield: s.dividendYield,
  });
  const headline = headlineMetric(selection, isSimplified);
  const forwardPeDetail = (metric: ValuationMetric) =>
    foldsForwardPe(selection, metric) && s.peRatioForward != null ? (
      <p className="text-xs tabular-nums text-muted-foreground">
        {t('statisticsGridForwardPe', { value: fmt(s.peRatioForward, 'ratio') })}
        {s.peRatioTTM != null && s.peRatioForward < s.peRatioTTM && ' ↓'}
        {s.peRatioTTM != null && s.peRatioForward > s.peRatioTTM && ' ↑'}
      </p>
    ) : null;

  // ── Metric cards — each answers exactly one question ─────────────────────
  const cards: React.ReactNode[] = [];

  if (hasRange) {
    cards.push(
      <MetricCard
        key="range"
        label="52W Range"
        value={price != null ? `$${price.toFixed(2)}` : `${fmt(s.week52Low, 'currency')} – ${fmt(s.week52High, 'currency')}`}
        insight={price != null ? week52Insight(s.week52Low!, s.week52High!, price) : t('statisticsGridRangeFallbackInsight')}
        tourId="stat-52w-high"
        ticker={ticker}
        onAskAI={handleAskAI}
      >
        <RangeBar
          low={s.week52Low!}
          high={s.week52High!}
          current={price}
          srLabel={
            price != null
              ? t('statisticsGridRangeSrLabelCurrent', { low: fmt(s.week52Low, 'currency'), high: fmt(s.week52High, 'currency'), current: fmt(price, 'currency') })
              : t('statisticsGridRangeSrLabel', { low: fmt(s.week52Low, 'currency'), high: fmt(s.week52High, 'currency') })
          }
        />
      </MetricCard>
    );
  }

  if (s.marketCap != null) {
    cards.push(
      <MetricCard
        key="cap"
        label="Market Cap"
        value={fmt(s.marketCap, 'currency')}
        insight={marketCapInsight(marketCapBand(s.marketCap).band)}
        tourId="stat-market-cap"
        ticker={ticker}
        onAskAI={handleAskAI}
      >
        <CapBandScale marketCap={s.marketCap} t={t} />
      </MetricCard>
    );
  }

  if (headline === 'P/E' && (s.peRatioTTM != null || s.peRatioForward != null)) {
    cards.push(
      <MetricCard
        key="pe"
        label="P/E (TTM)"
        value={fmt(s.peRatioTTM, 'ratio')}
        signal={sig('peRatioTTM')}
        insight={peInsight(s.peRatioTTM, s.peRatioForward)}
        context={noteFor(selection, 'P/E') ?? sectorContext(s.peRatioTTM, dist('pe_ratio'), 'pe', benchmarkLabel)}
        tourId="stat-p-e-ttm"
        ticker={ticker}
        onAskAI={handleAskAI}
      >
        {s.peRatioTTM != null && s.peRatioTTM > 0 && (
          <MeterBar
            value={s.peRatioTTM}
            min={PE_DOMAIN.min}
            max={PE_DOMAIN.max}
            signal={sig('peRatioTTM')}
            benchmark={dist('pe_ratio') ? { value: dist('pe_ratio')!.median, label: t('statisticsGridBenchmarkTypical') } : undefined}
            srLabel={t('statisticsGridPeSrLabel', { value: fmt(s.peRatioTTM, 'ratio') })}
            minLabel="0"
            maxLabel="60"
          />
        )}
        {forwardPeDetail('P/E')}
      </MetricCard>
    );
  } else if (headline === 'P/S' && s.psRatio != null && s.psRatio > 0) {
    cards.push(
      <MetricCard
        key="ps"
        label="P/S"
        value={fmt(s.psRatio, 'ratio')}
        insight={psInsight(s.psRatio, selection.hideMetrics.includes('P/E'))}
        context={noteFor(selection, 'P/S') ?? sectorContext(s.psRatio, dist('ps_ratio'), 'ps', benchmarkLabel)}
        tourId="stat-p-s"
        ticker={ticker}
        onAskAI={handleAskAI}
      >
        <MeterBar
          value={s.psRatio}
          min={PS_DOMAIN.min}
          max={PS_DOMAIN.max}
          benchmark={dist('ps_ratio') ? { value: dist('ps_ratio')!.median, label: t('statisticsGridBenchmarkTypical') } : undefined}
          srLabel={t('statisticsGridPsSrLabel', { value: fmt(s.psRatio, 'ratio') })}
          minLabel="0"
          maxLabel="20"
        />
        {forwardPeDetail('P/S')}
      </MetricCard>
    );
  }

  if (!isSimplified && (s.profitMargin != null || s.revenueGrowthTTM != null)) {
    cards.push(
      <MetricCard
        key="margin"
        label="Profit Margin"
        value={fmt(s.profitMargin, 'percent')}
        signal={sig('profitMargin')}
        insight={marginInsight(s.profitMargin) || growthInsight(s.revenueGrowthTTM)}
        context={sectorContext(s.profitMargin, dist('profit_margin'), 'margin', benchmarkLabel)}
        tourId="stat-profit-margin"
        ticker={ticker}
        onAskAI={handleAskAI}
      >
        {s.profitMargin != null && (
          <MeterBar
            value={s.profitMargin}
            min={MARGIN_DOMAIN.min}
            max={MARGIN_DOMAIN.max}
            signal={sig('profitMargin')}
            benchmark={dist('profit_margin') ? { value: dist('profit_margin')!.median, label: t('statisticsGridBenchmarkTypical') } : undefined}
            srLabel={t('statisticsGridMarginSrLabel', { value: fmt(s.profitMargin, 'percent') })}
            minLabel="-10%"
            maxLabel="40%"
          />
        )}
        {s.revenueGrowthTTM != null && (
          <div className="flex items-center gap-2" data-tour="stat-rev-growth">
            <span className="w-20 shrink-0 text-xs text-muted-foreground">{t('statisticsGridRevGrowthLabel')}</span>
            <MeterBar
              value={s.revenueGrowthTTM}
              min={GROWTH_DOMAIN.min}
              max={GROWTH_DOMAIN.max}
              signal={sig('revenueGrowthTTM')}
              srLabel={t('statisticsGridRevGrowthSrLabel', { value: fmt(s.revenueGrowthTTM, 'percent') })}
              className="flex-1"
              minLabel="-20%"
              maxLabel="40%"
            />
            <span className="shrink-0 text-xs font-medium tabular-nums">{fmt(s.revenueGrowthTTM, 'percent')}</span>
          </div>
        )}
      </MetricCard>
    );
  }

  cards.push(
    <MetricCard
      key="div"
      label="Dividend Yield"
      value={s.dividendYield != null && s.dividendYield > 0 ? fmt(s.dividendYield, 'percent') : t('statisticsGridDividendNone')}
      signal={s.dividendYield != null && s.dividendYield > 0 ? sig('dividendYield') : undefined}
      insight={dividendInsight(s.dividendYield)}
      context={s.dividendYield != null && s.dividendYield > 0 ? sectorContext(s.dividendYield, dist('dividend_yield'), 'yield', benchmarkLabel) : ''}
      tourId="stat-dividend-yield"
      ticker={ticker}
      onAskAI={handleAskAI}
    >
      {s.dividendYield != null && s.dividendYield > 0 && (
        <MeterBar
          value={s.dividendYield}
          min={YIELD_DOMAIN.min}
          max={YIELD_DOMAIN.max}
          signal={sig('dividendYield')}
          benchmark={dist('dividend_yield') ? { value: dist('dividend_yield')!.median, label: t('statisticsGridBenchmarkTypical') } : undefined}
          srLabel={t('statisticsGridDividendSrLabel', { value: fmt(s.dividendYield, 'percent') })}
          minLabel="0%"
          maxLabel="8%"
        />
      )}
    </MetricCard>
  );

  if (!isSimplified && s.beta != null) {
    cards.push(
      <MetricCard
        key="beta"
        label="Beta"
        value={fmt(s.beta, 'ratio')}
        signal={sig('beta')}
        insight={betaInsight(s.beta)}
        context={sectorContext(s.beta, dist('beta'), 'beta', benchmarkLabel)}
        tourId="stat-beta"
        ticker={ticker}
        onAskAI={handleAskAI}
      >
        <VolatilityGauge
          value={s.beta}
          min={BETA_DOMAIN.min}
          max={BETA_DOMAIN.max}
          ticker={ticker}
          marketValue={1}
          industryValue={dist('beta')?.median}
          industryLabel={benchmarkLabel || 'Industry'}
          srLabel={
            dist('beta')
              ? t('statisticsGridBetaSrLabelWithBenchmark', { value: fmt(s.beta, 'ratio'), group: benchmarkLabel || t('volatilityIndustry'), groupValue: dist('beta')!.median.toFixed(2) })
              : t('statisticsGridBetaSrLabelSimple', { value: fmt(s.beta, 'ratio') })
          }
        />
      </MetricCard>
    );
  }

  // P/B and EV/EBITDA — the valuation multiples beginners understand least, so
  // they get the full visual treatment (meter + sector "typical" tick + a plain
  // sentence) instead of being buried as context-free rows in the disclosure.
  if (showCard(selection, isSimplified, 'P/B') && s.pbRatio != null && s.pbRatio > 0) {
    cards.push(
      <MetricCard
        key="pb"
        label="P/B"
        value={fmt(s.pbRatio, 'ratio')}
        insight={pbInsight(s.pbRatio)}
        context={noteFor(selection, 'P/B') ?? sectorContext(s.pbRatio, dist('pb_ratio'), 'pb', benchmarkLabel)}
        ticker={ticker}
        onAskAI={handleAskAI}
      >
        <MeterBar
          value={s.pbRatio}
          min={PB_DOMAIN.min}
          max={PB_DOMAIN.max}
          benchmark={dist('pb_ratio') ? { value: dist('pb_ratio')!.median, label: t('statisticsGridBenchmarkTypical') } : undefined}
          srLabel={t('statisticsGridPbSrLabel', { value: fmt(s.pbRatio, 'ratio') })}
          minLabel="0"
          maxLabel="10"
        />
        {forwardPeDetail('P/B')}
      </MetricCard>
    );
  }

  if (showCard(selection, isSimplified, 'EV/EBITDA') && s.evToEbitda != null && s.evToEbitda > 0) {
    cards.push(
      <MetricCard
        key="ev"
        label="EV/EBITDA"
        value={fmt(s.evToEbitda, 'ratio')}
        insight={evEbitdaInsight(s.evToEbitda)}
        context={noteFor(selection, 'EV/EBITDA') ?? sectorContext(s.evToEbitda, dist('ev_to_ebitda'), 'evEbitda', benchmarkLabel)}
        ticker={ticker}
        onAskAI={handleAskAI}
      >
        <MeterBar
          value={s.evToEbitda}
          min={EV_EBITDA_DOMAIN.min}
          max={EV_EBITDA_DOMAIN.max}
          benchmark={dist('ev_to_ebitda') ? { value: dist('ev_to_ebitda')!.median, label: t('statisticsGridBenchmarkTypical') } : undefined}
          srLabel={t('statisticsGridEvEbitdaSrLabel', { value: fmt(s.evToEbitda, 'ratio') })}
          minLabel="0"
          maxLabel="30"
        />
        {forwardPeDetail('EV/EBITDA')}
      </MetricCard>
    );
  }

  // ── Remaining metrics → quiet disclosure rows ────────────────────────────
  // A metric with a value that isn't shown as a card (selected by selectMetrics
  // or the simplified-mode headline) falls back to a plain row here — unless
  // it's in hideMetrics, in which case it's actively misleading and excluded
  // everywhere, not just demoted.
  const demotedRow = (metric: ValuationMetric, label: string, value: number | null): StatRow[] =>
    !selection.hideMetrics.includes(metric) && !showCard(selection, isSimplified, metric)
      ? [{ label, value: fmt(value, 'ratio') }]
      : [];

  const restRows: StatRow[] = [
    { label: 'Enterprise Value', value: fmt(s.enterpriseValue, 'currency') },
    { label: 'Avg Volume', value: fmt(s.avgVolume, 'volume') },
    { label: 'Shares Float', value: fmt(s.sharesFloat, 'volume') },
    ...demotedRow('P/E', 'P/E (TTM)', s.peRatioTTM),
    ...demotedRow('P/S', 'P/S', s.psRatio),
    ...demotedRow('P/B', 'P/B', s.pbRatio),
    ...demotedRow('EV/EBITDA', 'EV/EBITDA', s.evToEbitda),
    { label: 'Short Ratio', value: fmt(s.shortRatio, 'ratio') },
    { label: '52W High', value: fmt(s.week52High, 'currency') },
    { label: '52W Low', value: fmt(s.week52Low, 'currency') },
  ].filter((r) => r.value !== '—');

  return (
    <Card className="mb-8">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-3 min-w-0">
            <CardTitle className="text-base font-semibold shrink-0">{t('statisticsGridTitle')}</CardTitle>
            {updatedLabel && (
              <span className="text-xs text-muted-foreground/80 font-mono tracking-wide truncate">
                {updatedLabel}
              </span>
            )}
          </div>
          {isSimplified && (
            <button
              onClick={() => setExpandedFull(true)}
              className="text-xs text-muted-foreground hover:text-primary transition-colors shrink-0"
            >
              {t('statisticsGridShowFullStatistics')} →
            </button>
          )}
        </div>
        {isSimplified && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('statisticsGridSimplifiedHint')}
          </p>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2', !isSimplified && 'lg:grid-cols-3')}>
          {cards}
        </div>

        {restRows.length > 0 && (
          <div className="mt-4">
            <button
              onClick={() => setShowAll((v) => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              aria-expanded={showAll}
            >
              {showAll ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {showAll ? t('statisticsGridHideDetailed') : t('statisticsGridAllStatistics')}
            </button>
            {showAll && (
              <div className="mt-2 grid grid-cols-1 gap-x-10 sm:grid-cols-2 lg:grid-cols-3">
                {restRows.map((r) => (
                  <div key={r.label} className="flex items-center justify-between gap-2 border-b border-border/50 py-2.5 last:border-0">
                    <span className="text-xs text-muted-foreground">
                      <TermTooltip term={r.label} ticker={ticker} onAskAI={handleAskAI} />
                    </span>
                    <span className="text-xs font-medium tabular-nums text-foreground/80">{r.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
