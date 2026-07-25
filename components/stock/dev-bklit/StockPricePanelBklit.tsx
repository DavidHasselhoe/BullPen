'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Maximize2, Sparkles } from 'lucide-react';

import { useQuery } from '@tanstack/react-query';
import { LineChart, Line } from '@/components/charts/line-chart';
import { Grid } from '@/components/charts/grid';
import { XAxis } from '@/components/charts/x-axis';
import { ChartTooltip } from '@/components/charts/tooltip';
import { useChartPrefs, type AdvancedChartType } from '@/hooks/use-chart-prefs';
import { getIndicatorDef, defaultParamsFor, INDICATOR_PALETTE, INDICATOR_PRESETS, type IndicatorInstance } from '@/lib/finance/indicators';
import { WhyTodayPanel } from '@/components/stock/WhyTodayPanel';
import { Skeleton } from '@/components/ui/skeleton';
import { useLivePrices } from '@/hooks/use-live-prices';
import { useStockQuote } from '@/hooks/use-stock-price';
import { useExperienceLevel } from '@/hooks/use-experience-level';
import { cn } from '@/lib/utils';
import type { ExtendedHoursQuote, IndicatorValue } from '@/lib/twelvedata/twelvedata-client';

// Fullscreen advanced chart is loaded on demand so lightweight-charts stays out
// of the main bundle — same lazy-load pattern as the production panel.
const AdvancedChartModal = dynamic(
  () => import('@/components/stock/advanced-chart/AdvancedChartModal').then((m) => m.AdvancedChartModal),
  { ssr: false }
);

// ─── Types ────────────────────────────────────────────────────────────────────

type Range = '1D' | '1W' | '1M' | '6M' | '1Y' | 'YTD' | '5Y' | 'MAX';
const RANGES: Range[] = ['1D', '1W', '1M', '6M', '1Y', 'YTD', '5Y', 'MAX'];

const RANGE_DISPLAY: Record<Range, string> = {
  '1D': '1D', '1W': '5D', '1M': '1M', '6M': '6M', '1Y': '1Y', 'YTD': 'YTD', '5Y': '5Y', 'MAX': 'ALL',
};
const RANGE_LABEL: Record<Range, string> = {
  '1D': 'today', '1W': 'this week', '1M': 'this month',
  '6M': 'past 6 months', '1Y': 'past year', 'YTD': 'year to date', '5Y': 'past 5 years', 'MAX': 'all time',
};

interface CandleData { t: number[]; c: number[]; o: number[]; h: number[]; l: number[]; v: number[]; session?: Array<'pre' | 'regular' | 'post'> }
interface ChartPoint {
  time: number; price: number;
  session?: 'pre' | 'regular' | 'post';
  sma50?: number; sma200?: number; ema?: number; upper?: number; middle?: number; lower?: number;
}

// Oscillators (RSI/MACD) are a later sub-project — this is overlay indicators only.
type Indicator = 'sma50' | 'sma200' | 'ema20' | 'bbands';
interface IndicatorOption { key: Indicator; label: string; type: string; params?: Record<string, number> }

const INDICATORS: IndicatorOption[] = [
  { key: 'sma50',  label: 'SMA 50',  type: 'sma',    params: { time_period: 50 } },
  { key: 'sma200', label: 'SMA 200', type: 'sma',    params: { time_period: 200 } },
  { key: 'ema20',  label: 'EMA 20',  type: 'ema',    params: { time_period: 20 } },
  { key: 'bbands', label: 'BB',      type: 'bbands', params: { time_period: 20 } },
];

// Canonical per-indicator colors — same mapping as the production panel, so an
// indicator always means the same color regardless of which chart renders it.
const INDICATOR_COLORS: Record<Indicator, string> = {
  sma50: '#f59e0b', sma200: '#fb923c', ema20: '#a78bfa', bbands: '#60a5fa',
};

interface IndicatorResponse {
  success: boolean;
  data?: IndicatorValue[];
  error?: string;
}

function fetchIndicator(ticker: string, opt: IndicatorOption, range: Range): Promise<IndicatorResponse> {
  const params = new URLSearchParams({ type: opt.type, range });
  if (opt.params) {
    for (const [k, v] of Object.entries(opt.params)) params.set(k, String(v));
  }
  return fetch(`/api/stock/${ticker}/indicator?${params}`).then((r) => r.json());
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtPrice(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Stat item (bottom bar) ───────────────────────────────────────────────────

function StatItem({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 shrink-0">{label}</span>
      <span className={cn('text-xs font-medium tabular-nums text-foreground truncate', valueClass)}>{value}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * Dev-only copy of StockPricePanel with the core price chart swapped from
 * Recharts to Bklit UI's LineChart — see
 * docs/superpowers/specs/2026-07-24-bklit-stock-chart-dev-copy-design.md.
 * Building up to full parity in ordered sub-projects before this replaces
 * production (see docs/superpowers/specs/2026-07-24-bklit-chart-indicators-design.md
 * for sub-project 1, indicators — done here). Still to come: sessions,
 * volume, oscillators, earnings markers. The production StockPricePanel
 * is untouched throughout.
 */
export function StockPricePanelBklit({ ticker }: { ticker: string }) {
  const { prefs, setPref } = useChartPrefs();
  const [range, setRange] = useState<Range>(prefs.defaultRange as Range);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [whyTodayOpen, setWhyTodayOpen] = useState(false);
  const { isSimplified } = useExperienceLevel();

  const [activeIndicators, setActiveIndicators] = useState<Set<Indicator>>(new Set());
  function toggleIndicator(key: Indicator) {
    setActiveIndicators((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  // Advanced (fullscreen) chart prefs — unchanged from the production panel,
  // kept only so the "Advanced chart" button below still works as-is.
  const advIndicators = prefs.advancedIndicators;
  const addAdvIndicator = (type: string) => {
    const def = getIndicatorDef(type);
    if (!def) return;
    const used = new Set(advIndicators.map((i) => i.color));
    const color = INDICATOR_PALETTE.find((c) => !used.has(c)) ?? INDICATOR_PALETTE[advIndicators.length % INDICATOR_PALETTE.length];
    const inst: IndicatorInstance = { id: `${type}-${Date.now()}`, type, params: defaultParamsFor(def), color };
    setPref('advancedIndicators', [...advIndicators, inst]);
  };
  const removeAdvIndicator = (id: string) =>
    setPref('advancedIndicators', advIndicators.filter((i) => i.id !== id));
  const updateAdvIndicator = (id: string, params: Record<string, number>) =>
    setPref('advancedIndicators', advIndicators.map((i) => (i.id === id ? { ...i, params } : i)));
  const applyAdvPreset = (presetId: string) => {
    const preset = INDICATOR_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const insts = preset.items
      .map((item, i) => {
        const def = getIndicatorDef(item.type);
        if (!def) return null;
        return {
          id: `${item.type}-${Date.now()}-${i}`,
          type: item.type,
          params: { ...defaultParamsFor(def), ...(item.params ?? {}) },
          color: INDICATOR_PALETTE[i % INDICATOR_PALETTE.length],
        } as IndicatorInstance;
      })
      .filter((x): x is IndicatorInstance => x != null);
    setPref('advancedIndicators', insts);
  };
  const replaceAdvIndicators = (insts: IndicatorInstance[]) =>
    setPref('advancedIndicators', insts);
  const applyAdvConfig = (c: {
    chartType: AdvancedChartType;
    indicators: IndicatorInstance[];
    showVolume: boolean;
    showEvents: boolean;
  }) =>
    setPref('advancedChartType', c.chartType);

  // ── Data sources (identical to production StockPricePanel) ──────────────
  const livePrices = useLivePrices([ticker]);
  const live = livePrices.get(ticker);
  const isLive = !!live;

  const { data: extHoursData } = useQuery<{ success: boolean; data: ExtendedHoursQuote | null }>({
    queryKey: ['extended-hours', ticker],
    queryFn: async () => {
      const res = await fetch(`/api/stock/${ticker}/extended-hours`);
      return res.json();
    },
    enabled: !!ticker,
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });
  const extHours = extHoursData?.data ?? null;

  const { data: restQuote, isLoading: quoteLoading } = useStockQuote(ticker);

  const livePrice = live?.price;
  const restClose = restQuote?.c ?? 0;
  const restChange = restQuote?.d ?? 0;
  const restPct = restQuote?.dp ?? 0;
  const prevClose = restQuote?.pc ?? 0;
  const dayHigh   = restQuote?.h ?? 0;
  const dayLow    = restQuote?.l ?? 0;
  const openPrice = restQuote?.o ?? 0;

  const showDual = !!extHours && prefs.showExtendedHours;

  const closePrice = restClose;
  const closeChange = restChange;
  const closePct = restPct;
  const closeIsPos = closePct >= 0;

  const price     = livePrice ?? restClose;
  const change    = prevClose > 0 ? price - prevClose : restChange;
  const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : restPct;

  const isPositive = changePct >= 0;
  const priceColor = isPositive ? 'text-emerald-400' : 'text-red-400';

  // ── Candle data (same endpoint as production — no new TwelveData calls) ──
  const { data: candleData, isLoading: candleLoading, isFetching, isError: candleError } = useQuery<{
    success: boolean; candles: CandleData | null; range: Range;
  }>({
    queryKey: ['stock-candles', ticker, range],
    queryFn: async () => {
      const res = await fetch(`/api/stock/${ticker}/candles?range=${range}`);
      if (!res.ok) throw new Error(`Failed to fetch candles (${res.status})`);
      return res.json();
    },
    enabled: !!ticker,
    staleTime: range === '1D' ? 60 * 1000 : 5 * 60 * 1000,
    refetchInterval: range === '1D' ? 60 * 1000 : false,
  });

  // ── Indicator queries (same endpoint as production — no new TwelveData calls) ──
  const sma50Query  = useQuery<IndicatorResponse>({ queryKey: ['indicator', ticker, 'sma50',  range], queryFn: () => fetchIndicator(ticker, INDICATORS[0], range), enabled: activeIndicators.has('sma50')  && !!ticker, staleTime: 5 * 60 * 1000 });
  const sma200Query = useQuery<IndicatorResponse>({ queryKey: ['indicator', ticker, 'sma200', range], queryFn: () => fetchIndicator(ticker, INDICATORS[1], range), enabled: activeIndicators.has('sma200') && !!ticker, staleTime: 5 * 60 * 1000 });
  const ema20Query  = useQuery<IndicatorResponse>({ queryKey: ['indicator', ticker, 'ema20',  range], queryFn: () => fetchIndicator(ticker, INDICATORS[2], range), enabled: activeIndicators.has('ema20')  && !!ticker, staleTime: 5 * 60 * 1000 });
  const bbandsQuery = useQuery<IndicatorResponse>({ queryKey: ['indicator', ticker, 'bbands', range], queryFn: () => fetchIndicator(ticker, INDICATORS[3], range), enabled: activeIndicators.has('bbands') && !!ticker, staleTime: 5 * 60 * 1000 });

  const sma50Data  = sma50Query.data?.data;
  const sma200Data = sma200Query.data?.data;
  const ema20Data  = ema20Query.data?.data;
  const bbandsData = bbandsQuery.data?.data;

  // ── Chart data ────────────────────────────────────────────────────────────
  const chartData = useMemo<ChartPoint[]>(() => {
    if (!candleData?.candles) return [];
    const { t, c, session } = candleData.candles;
    const pts: ChartPoint[] = t.map((ts, i) => ({ time: ts, price: c[i], session: session?.[i] }));

    function applyIndicator(values: IndicatorValue[], key: Indicator) {
      const map = new Map<string, IndicatorValue>();
      for (const iv of values) map.set(iv.datetime.slice(0, 10), iv);
      for (const pt of pts) {
        const iv = map.get(new Date(pt.time * 1000).toISOString().slice(0, 10));
        if (!iv) continue;
        if (key === 'sma50') pt.sma50 = iv.sma as number;
        if (key === 'sma200') pt.sma200 = iv.sma as number;
        if (key === 'ema20') pt.ema = iv.ema as number;
        if (key === 'bbands') { pt.upper = iv.upper_band as number; pt.middle = iv.middle_band as number; pt.lower = iv.lower_band as number; }
      }
    }

    if (sma50Data?.length)  applyIndicator(sma50Data,  'sma50');
    if (sma200Data?.length) applyIndicator(sma200Data, 'sma200');
    if (ema20Data?.length)  applyIndicator(ema20Data,  'ema20');
    if (bbandsData?.length) applyIndicator(bbandsData, 'bbands');

    return pts;
  }, [candleData, sma50Data, sma200Data, ema20Data, bbandsData]);

  // Append live tick so the chart always ends at the current price.
  const isIntradayRange = range === '1D' || range === '1W' || range === '1M';
  const displayData = useMemo<ChartPoint[]>(() => {
    if (!isIntradayRange || !isLive || !live || !chartData.length) return chartData;
    // eslint-disable-next-line react-hooks/purity
    const nowSec = Math.floor(Date.now() / 1000);
    const last = chartData[chartData.length - 1];
    if (Math.abs(last.time - nowSec) < 120) return chartData;
    return [...chartData, { time: nowSec, price: live.price }];
  }, [chartData, isIntradayRange, isLive, live]);

  // Strip pre/post candles when extended hours are hidden.
  const chartDisplayData = useMemo(() => {
    if (range !== '1D' || prefs.showExtendedHours) return displayData;
    return displayData.some((d) => d.session !== undefined)
      ? displayData.filter((d) => !d.session || d.session === 'regular')
      : displayData;
  }, [displayData, range, prefs.showExtendedHours]);

  const bklitData = useMemo(
    () => chartDisplayData.map((pt) => ({
      date: new Date(pt.time * 1000),
      price: pt.price,
      sma50: pt.sma50, sma200: pt.sma200, ema: pt.ema,
      upper: pt.upper, middle: pt.middle, lower: pt.lower,
    })),
    [chartDisplayData]
  );

  const lastDisplayPt = displayData.length > 0 ? displayData[displayData.length - 1] : null;
  const lastIsExtended = lastDisplayPt?.session === 'pre' || lastDisplayPt?.session === 'post';
  const extPriceVal = livePrice
    ?? (showDual && lastIsExtended && lastDisplayPt ? lastDisplayPt.price : null)
    ?? extHours?.price
    ?? 0;
  const extDiff = closePrice > 0 ? extPriceVal - closePrice : (extHours?.change ?? 0);
  const extPct  = closePrice > 0 ? (extDiff / closePrice) * 100 : (extHours?.changePercent ?? 0);
  const extIsPos = extDiff >= 0;

  const firstPrice = chartDisplayData[0]?.price ?? 0;
  const chartLast  = chartDisplayData[chartDisplayData.length - 1]?.price ?? 0;
  const dayBase    = showDual ? closePrice : prevClose;
  const chartBase  = range === '1D' && dayBase > 0 ? dayBase : firstPrice;
  const chartDiff  = chartLast - chartBase;
  const chartPct   = chartBase ? (chartDiff / chartBase) * 100 : 0;
  const chartIsPos = chartDiff >= 0;
  const lineColor  = chartIsPos ? '#22c55e' : '#ef4444';

  const isLoadingChart = (candleLoading || isFetching) && !candleData?.candles;
  const hasChart       = chartDisplayData.length > 0;

  const perfIsPos = range === '1D' ? (showDual ? extIsPos  : isPositive) : chartIsPos;
  const perfPct   = range === '1D' ? (showDual ? extPct    : changePct)  : chartPct;
  const perfDiff  = range === '1D' ? (showDual ? extDiff   : change)     : chartDiff;

  if (quoteLoading && !restQuote && !live) {
    return (
      <div className="mb-8 rounded-2xl border border-border bg-card p-6 space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  if (!price && !quoteLoading) return null;

  return (
    <div className="mb-8 rounded-2xl border border-border bg-card overflow-hidden">

      {/* ── Price header ─────────────────────────────────────────────────── */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-6 flex-wrap">

          <div className="min-w-0">
            {showDual ? (
              <div className="flex flex-wrap items-stretch gap-x-4 gap-y-3 sm:gap-x-8">
                <div className="min-w-0">
                  <div className="text-[32px] sm:text-[40px] font-bold tracking-tight text-foreground tabular-nums leading-none">
                    {fmtPrice(closePrice)}
                  </div>
                  <div className={cn(
                    'text-sm font-medium tabular-nums mt-2',
                    closeIsPos ? 'text-emerald-400' : 'text-red-400'
                  )}>
                    {closeIsPos ? '+' : ''}{fmtPrice(closeChange)} ({closeIsPos ? '+' : ''}{closePct.toFixed(2)}%)
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">
                      At Close
                    </span>
                    <button
                      type="button"
                      onClick={() => setWhyTodayOpen((v) => !v)}
                      aria-expanded={whyTodayOpen}
                      className={cn(
                        'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
                        whyTodayOpen
                          ? 'border-primary/40 bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                      )}
                    >
                      <Sparkles className="h-3 w-3" />
                      Why?
                    </button>
                  </div>
                </div>

                <div className="w-px self-stretch bg-border/50" />

                <div className="min-w-0">
                  <div className="text-[32px] sm:text-[40px] font-bold tracking-tight text-foreground tabular-nums leading-none">
                    {fmtPrice(extPriceVal)}
                  </div>
                  <div className={cn(
                    'text-sm font-medium tabular-nums mt-2',
                    extIsPos ? 'text-emerald-400' : 'text-red-400'
                  )}>
                    {extIsPos ? '+' : ''}{fmtPrice(extDiff)} ({extIsPos ? '+' : ''}{extPct.toFixed(2)}%)
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    {isLive && (
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    )}
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">
                      {extHours!.pre_or_post === 'pre' ? 'Pre-Market' : 'After-Hours'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="text-[40px] sm:text-[52px] font-bold tracking-tight text-foreground tabular-nums leading-none">
                  {fmtPrice(price)}
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2.5">
                  <span className={cn('text-sm font-medium tabular-nums', priceColor)}>
                    {isPositive ? '+' : ''}{fmtPrice(change)} ({isPositive ? '+' : ''}{changePct.toFixed(2)}%) today
                  </span>

                  {range === '1D' && (
                    <button
                      type="button"
                      onClick={() => setWhyTodayOpen((v) => !v)}
                      aria-expanded={whyTodayOpen}
                      className={cn(
                        'flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors',
                        whyTodayOpen
                          ? 'border-primary/40 bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                      )}
                    >
                      <Sparkles className="h-3 w-3" />
                      Why?
                    </button>
                  )}

                  {isLive && (
                    <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Live
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Right: performance banner + range tabs */}
          <div className="flex flex-col items-end gap-2 shrink-0 pt-1">
            {hasChart && (
              <div className={cn('text-right tabular-nums', perfIsPos ? 'text-emerald-400' : 'text-red-400')}>
                <span className="text-sm font-semibold">
                  {perfIsPos ? '+' : ''}{fmtPrice(perfDiff)}
                  {' '}
                  ({perfIsPos ? '+' : ''}{Math.abs(perfPct).toFixed(2)}%)
                </span>
                {' '}
                <span className="text-xs font-normal text-muted-foreground">{RANGE_LABEL[range]}</span>
              </div>
            )}

            <div className="flex items-center gap-0.5">
              {RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => { setRange(r); if (r === '1D') setActiveIndicators(new Set()); }}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs font-medium transition-all',
                    range === r
                      ? 'text-foreground font-semibold'
                      : 'text-muted-foreground/50 hover:text-muted-foreground'
                  )}
                >
                  {RANGE_DISPLAY[r]}
                </button>
              ))}
              <div className="ml-1 pl-1 border-l border-border/30 flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setAdvancedOpen(true)}
                  title="Advanced chart (fullscreen)"
                  aria-label="Open advanced fullscreen chart"
                  className="rounded-md p-1.5 text-muted-foreground/40 hover:text-foreground hover:bg-muted/60 transition-colors"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Indicators — advanced users, non-1D only (oscillators/RSI/MACD come later) */}
            {!isSimplified && range !== '1D' && (
              <div className="flex items-center gap-1 flex-wrap justify-end">
                {INDICATORS.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => toggleIndicator(key)}
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-medium transition-all border',
                      activeIndicators.has(key)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-transparent text-muted-foreground border-border hover:text-foreground hover:border-foreground/30'
                    )}
                  >
                    {label}
                  </button>
                ))}
                {activeIndicators.size > 0 && (
                  <button
                    onClick={() => setActiveIndicators(new Set())}
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium border border-border text-muted-foreground hover:text-foreground transition-all"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <WhyTodayPanel
        ticker={ticker}
        price={price}
        change={change}
        changePct={changePct}
        open={whyTodayOpen}
        onClose={() => setWhyTodayOpen(false)}
      />

      {/* ── Price chart (Bklit UI) ───────────────────────────────────────── */}
      <div className="relative">
        {isLoadingChart && <Skeleton className="h-[300px] w-full" />}

        {!isLoadingChart && candleError && (
          <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
            Couldn&apos;t load chart data
          </div>
        )}

        {!isLoadingChart && !candleError && candleData?.candles === null && (
          <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
            No chart data available
          </div>
        )}

        {hasChart && (
          <LineChart data={bklitData} margin={{ top: 16, right: 28, bottom: 32, left: 28 }} style={{ height: 300 }} zeroBaseline={false}>
            <Grid horizontal />
            <Line dataKey="price" stroke={lineColor} showMarkers={false} />
            {activeIndicators.has('sma50') && (
              <Line dataKey="sma50" stroke={INDICATOR_COLORS.sma50} strokeWidth={1.5} showMarkers={false} />
            )}
            {activeIndicators.has('sma200') && (
              <Line dataKey="sma200" stroke={INDICATOR_COLORS.sma200} strokeWidth={1.5} showMarkers={false} />
            )}
            {activeIndicators.has('ema20') && (
              <Line dataKey="ema" stroke={INDICATOR_COLORS.ema20} strokeWidth={1.5} showMarkers={false} />
            )}
            {activeIndicators.has('bbands') && (
              <>
                <Line dataKey="upper" stroke={INDICATOR_COLORS.bbands} strokeWidth={1} dashArray="4,2" showMarkers={false} />
                <Line dataKey="middle" stroke={INDICATOR_COLORS.bbands} strokeWidth={1} showMarkers={false} />
                <Line dataKey="lower" stroke={INDICATOR_COLORS.bbands} strokeWidth={1} dashArray="4,2" showMarkers={false} />
              </>
            )}
            <ChartTooltip
              rows={(point) => {
                const rows = [{ label: 'Price', value: fmtPrice(point.price as number), color: lineColor }];
                if (activeIndicators.has('sma50') && point.sma50 != null) rows.push({ label: 'SMA 50', value: fmtPrice(point.sma50 as number), color: INDICATOR_COLORS.sma50 });
                if (activeIndicators.has('sma200') && point.sma200 != null) rows.push({ label: 'SMA 200', value: fmtPrice(point.sma200 as number), color: INDICATOR_COLORS.sma200 });
                if (activeIndicators.has('ema20') && point.ema != null) rows.push({ label: 'EMA 20', value: fmtPrice(point.ema as number), color: INDICATOR_COLORS.ema20 });
                if (activeIndicators.has('bbands')) {
                  if (point.upper != null) rows.push({ label: 'BB Upper', value: fmtPrice(point.upper as number), color: INDICATOR_COLORS.bbands });
                  if (point.middle != null) rows.push({ label: 'BB Mid', value: fmtPrice(point.middle as number), color: INDICATOR_COLORS.bbands });
                  if (point.lower != null) rows.push({ label: 'BB Lower', value: fmtPrice(point.lower as number), color: INDICATOR_COLORS.bbands });
                }
                return rows;
              }}
            />
            <XAxis />
          </LineChart>
        )}
      </div>

      {/* ── Stats bar ────────────────────────────────────────────────────── */}
      {(openPrice > 0 || dayHigh > 0 || dayLow > 0 || prevClose > 0) && (
        <div className="px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-1.5 border-t border-border/20">
          {openPrice > 0  && <StatItem label="Open"       value={fmtPrice(openPrice)} />}
          {dayHigh > 0    && <StatItem label="High"       value={fmtPrice(dayHigh)}   valueClass="text-emerald-400" />}
          {dayLow > 0     && <StatItem label="Low"        value={fmtPrice(dayLow)}    valueClass="text-red-400" />}
          {prevClose > 0  && <StatItem label="Prev Close" value={fmtPrice(prevClose)} />}
        </div>
      )}

      {advancedOpen && (
        <AdvancedChartModal
          ticker={ticker}
          initialRange={range}
          onClose={() => setAdvancedOpen(false)}
          chartType={prefs.advancedChartType}
          onChartType={(t) => setPref('advancedChartType', t)}
          indicators={advIndicators}
          onAddIndicator={addAdvIndicator}
          onRemoveIndicator={removeAdvIndicator}
          onUpdateIndicator={updateAdvIndicator}
          onApplyPreset={applyAdvPreset}
          onReplaceIndicators={replaceAdvIndicators}
          onApplyConfig={applyAdvConfig}
          showVolume={prefs.showVolume}
          onToggleVolume={() => setPref('showVolume', !prefs.showVolume)}
          showEvents={prefs.showEarnings}
          onToggleEvents={() => setPref('showEarnings', !prefs.showEarnings)}
        />
      )}
    </div>
  );
}
