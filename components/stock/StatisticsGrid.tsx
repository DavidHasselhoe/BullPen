'use client';

/**
 * StatisticsGrid — visual "Key Numbers".
 *
 * Metric cards that each answer one beginner question with a visual + a
 * plain-language insight line, instead of plain label→value rows. Same data
 * source and cache key throughout (['stock-statistics', ticker]).
 */

import { useCallback, useState } from 'react';
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
import {
  week52Insight,
  marketCapBand,
  marketCapInsight,
  peInsight,
  betaInsight,
  dividendInsight,
  marginInsight,
  growthInsight,
  PE_DOMAIN,
  MARGIN_DOMAIN,
  GROWTH_DOMAIN,
  YIELD_DOMAIN,
  BETA_DOMAIN,
} from '@/lib/finance/metric-insights';
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

function formatFetchedAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (isToday) return `Updated today at ${time}`;
  return `Updated ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${time}`;
}

/** "How big is this company?" — a 5-band log scale with a marker. */
function CapBandScale({ marketCap }: { marketCap: number }) {
  const { band, position } = marketCapBand(marketCap);
  const bands = ['Micro', 'Small', 'Mid', 'Large', 'Mega'] as const;
  return (
    <div className="w-full" role="img" aria-label={`Company size: ${band}-cap`}>
      <div className="relative flex h-1.5 w-full gap-[3px]">
        {bands.map((b) => (
          <div
            key={b}
            className={cn('h-full flex-1 rounded-full', b === band ? 'bg-foreground/50' : 'bg-muted')}
          />
        ))}
        <div
          className="absolute top-[-3px] h-3 w-[3px] -translate-x-1/2 rounded-full bg-foreground"
          style={{ left: `${Math.max(1.5, Math.min(98.5, position * 100))}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-xs leading-none text-muted-foreground">
        {bands.map((b) => (
          <span key={b} className={cn(b === band && 'font-medium text-foreground/80')}>{b}</span>
        ))}
      </div>
    </div>
  );
}

interface StatRow {
  label: string;
  value: string;
}

export function StatisticsGrid({
  ticker,
  signals,
  currentPrice,
  forceFull = false,
}: {
  ticker: string;
  signals?: Record<string, SignalValue>;
  /** Live/last price for the 52-week range marker (from the page snapshot). */
  currentPrice?: number | null;
  forceFull?: boolean;
}) {
  const { isSimplified: rawSimplified, setLevel } = useExperienceLevel();
  const isSimplified = forceFull ? false : rawSimplified;
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

  if (isLoading) {
    return (
      <Card className="mb-8">
        <CardHeader><CardTitle className="text-base font-semibold">Key Numbers</CardTitle></CardHeader>
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
          <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Key Numbers</CardTitle></CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground py-6 text-center">Statistics require an Enterprise plan.</p>
          </CardContent>
        </Card>
      );
    }
    return null;
  }
  if (!data.stats) return null;

  const s = data.stats;
  const updatedLabel = formatFetchedAt(data.fetchedAt);
  const sig = (key: string): SignalValue | undefined => (signals ? signals[key] : undefined);

  const hasRange = s.week52High != null && s.week52Low != null && s.week52High > s.week52Low;
  const price = currentPrice ?? null;

  // ── Metric cards — each answers exactly one question ─────────────────────
  const cards: React.ReactNode[] = [];

  if (hasRange) {
    cards.push(
      <MetricCard
        key="range"
        label="52W Range"
        value={price != null ? `$${price.toFixed(2)}` : `${fmt(s.week52Low, 'currency')} – ${fmt(s.week52High, 'currency')}`}
        insight={price != null ? week52Insight(s.week52Low!, s.week52High!, price) : 'The price range over the past year'}
        tourId="stat-52w-high"
        ticker={ticker}
        onAskAI={handleAskAI}
      >
        <RangeBar
          low={s.week52Low!}
          high={s.week52High!}
          current={price}
          srLabel={`52-week range ${fmt(s.week52Low, 'currency')} to ${fmt(s.week52High, 'currency')}${price != null ? `, currently ${fmt(price, 'currency')}` : ''}`}
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
        <CapBandScale marketCap={s.marketCap} />
      </MetricCard>
    );
  }

  if (s.peRatioTTM != null || s.peRatioForward != null) {
    cards.push(
      <MetricCard
        key="pe"
        label="P/E (TTM)"
        value={fmt(s.peRatioTTM, 'ratio')}
        signal={sig('peRatioTTM')}
        insight={peInsight(s.peRatioTTM, s.peRatioForward)}
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
            srLabel={`P/E ratio ${fmt(s.peRatioTTM, 'ratio')} on a 0 to 60 scale`}
          />
        )}
        {s.peRatioForward != null && (
          <p className="text-xs tabular-nums text-muted-foreground">
            Forward P/E {fmt(s.peRatioForward, 'ratio')}
            {s.peRatioTTM != null && s.peRatioForward < s.peRatioTTM && ' ↓'}
            {s.peRatioTTM != null && s.peRatioForward > s.peRatioTTM && ' ↑'}
          </p>
        )}
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
            srLabel={`Profit margin ${fmt(s.profitMargin, 'percent')}`}
          />
        )}
        {s.revenueGrowthTTM != null && (
          <div className="flex items-center gap-2" data-tour="stat-rev-growth">
            <span className="w-20 shrink-0 text-xs text-muted-foreground">Rev Growth</span>
            <MeterBar
              value={s.revenueGrowthTTM}
              min={GROWTH_DOMAIN.min}
              max={GROWTH_DOMAIN.max}
              signal={sig('revenueGrowthTTM')}
              srLabel={`Revenue growth ${fmt(s.revenueGrowthTTM, 'percent')}`}
              className="flex-1"
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
      value={s.dividendYield != null && s.dividendYield > 0 ? fmt(s.dividendYield, 'percent') : 'None'}
      signal={s.dividendYield != null && s.dividendYield > 0 ? sig('dividendYield') : undefined}
      insight={dividendInsight(s.dividendYield)}
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
          srLabel={`Dividend yield ${fmt(s.dividendYield, 'percent')} on a 0 to 8 percent scale`}
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
        tourId="stat-beta"
        ticker={ticker}
        onAskAI={handleAskAI}
      >
        <MeterBar
          value={s.beta}
          min={BETA_DOMAIN.min}
          max={BETA_DOMAIN.max}
          signal={sig('beta')}
          benchmark={{ value: 1, label: 'market' }}
          srLabel={`Beta ${fmt(s.beta, 'ratio')}, where 1 moves with the market`}
        />
      </MetricCard>
    );
  }

  // ── Remaining metrics → quiet disclosure rows ────────────────────────────
  const restRows: StatRow[] = [
    { label: 'Enterprise Value', value: fmt(s.enterpriseValue, 'currency') },
    { label: 'Avg Volume', value: fmt(s.avgVolume, 'volume') },
    { label: 'Shares Float', value: fmt(s.sharesFloat, 'volume') },
    { label: 'P/B', value: fmt(s.pbRatio, 'ratio') },
    { label: 'EV/EBITDA', value: fmt(s.evToEbitda, 'ratio') },
    { label: 'Short Ratio', value: fmt(s.shortRatio, 'ratio') },
    { label: '52W High', value: fmt(s.week52High, 'currency') },
    { label: '52W Low', value: fmt(s.week52Low, 'currency') },
  ].filter((r) => r.value !== '—');

  return (
    <Card className="mb-8">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-3 min-w-0">
            <CardTitle className="text-base font-semibold shrink-0">Key Numbers</CardTitle>
            {updatedLabel && (
              <span className="text-xs text-muted-foreground/40 font-mono tracking-wide truncate">
                {updatedLabel}
              </span>
            )}
          </div>
          {isSimplified && (
            <button
              onClick={() => setLevel('intermediate')}
              className="text-xs text-muted-foreground hover:text-primary transition-colors shrink-0"
            >
              Show full statistics →
            </button>
          )}
        </div>
        {isSimplified && (
          <p className="text-xs text-muted-foreground mt-0.5">
            The most important numbers to evaluate this company — hover any label for an explanation.
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
              {showAll ? 'Hide detailed statistics' : 'All statistics'}
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
