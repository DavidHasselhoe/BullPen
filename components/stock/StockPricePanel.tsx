'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, ReferenceLine,
} from 'recharts';
import { useTheme } from 'next-themes';
import { Skeleton } from '@/components/ui/skeleton';
import { useLivePrices } from '@/hooks/use-live-prices';
import { useStockQuote } from '@/hooks/use-stock-price';
import { useExperienceLevel } from '@/hooks/use-experience-level';
import { cn } from '@/lib/utils';
import type { IndicatorValue, ExtendedHoursQuote } from '@/lib/twelvedata/twelvedata-client';

// ─── Types ────────────────────────────────────────────────────────────────────

type Range = '1W' | '1M' | '6M' | '1Y' | '3Y' | '5Y' | '10Y' | 'MAX';
const RANGES: Range[] = ['1W', '1M', '6M', '1Y', '3Y', '5Y', '10Y', 'MAX'];

type Indicator = 'none' | 'sma50' | 'sma200' | 'ema20' | 'bbands' | 'rsi' | 'macd';
interface IndicatorOption { key: Indicator; label: string; type: string; params?: Record<string, number> }

const INDICATORS: IndicatorOption[] = [
  { key: 'none',   label: 'None',    type: '' },
  { key: 'sma50',  label: 'SMA 50',  type: 'sma',    params: { time_period: 50 } },
  { key: 'sma200', label: 'SMA 200', type: 'sma',    params: { time_period: 200 } },
  { key: 'ema20',  label: 'EMA 20',  type: 'ema',    params: { time_period: 20 } },
  { key: 'bbands', label: 'BB',      type: 'bbands', params: { time_period: 20 } },
  { key: 'rsi',    label: 'RSI',     type: 'rsi',    params: { time_period: 14 } },
  { key: 'macd',   label: 'MACD',    type: 'macd' },
];

// Indicators overlaid ON the price chart
const OVERLAY_INDICATORS = new Set<Indicator>(['sma50', 'sma200', 'ema20', 'bbands']);
// Indicators rendered in a SEPARATE panel below
const OSCILLATOR_INDICATORS = new Set<Indicator>(['rsi', 'macd']);

interface CandleData { t: number[]; c: number[]; o: number[]; h: number[]; l: number[]; v: number[] }
interface ChartPoint {
  time: number; label: string; price: number; volume: number;
  sma?: number; ema?: number; upper?: number; lower?: number; middle?: number;
  rsi?: number; macd?: number; signal?: number; hist?: number;
}

interface IndicatorResponse {
  success: boolean;
  data?: IndicatorValue[];
  error?: string;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtPrice(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtVol(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(v);
}
function fmtLabel(ts: number, range: Range): string {
  const d = new Date(ts * 1000);
  if (range === '1W' || range === '1M') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (range === '6M' || range === '1Y') return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  return d.getFullYear().toString();
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, firstPrice }: {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
  firstPrice: number;
}) {
  if (!active || !payload?.length) return null;
  const pt = payload[0].payload;
  const diff = pt.price - firstPrice;
  const pct = firstPrice ? (diff / firstPrice) * 100 : 0;
  const isPos = diff >= 0;
  const date = new Date(pt.time * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return (
    <div className="rounded-lg border border-border bg-background/95 px-3 py-2 shadow-lg backdrop-blur-sm text-xs space-y-0.5">
      <p className="font-semibold text-foreground tabular-nums">{fmtPrice(pt.price)}</p>
      <p className={cn('tabular-nums', isPos ? 'text-emerald-500' : 'text-red-500')}>
        {isPos ? '+' : ''}{diff.toFixed(2)} ({isPos ? '+' : ''}{pct.toFixed(2)}%)
      </p>
      <p className="text-muted-foreground">{date}</p>
      {pt.volume > 0 && <p className="text-muted-foreground">Vol {fmtVol(pt.volume)}</p>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function StockPricePanel({ ticker }: { ticker: string }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [range, setRange] = useState<Range>('1Y');
  const [activeIndicator, setActiveIndicator] = useState<Indicator>('none');
  const { isSimplified } = useExperienceLevel();

  // ── Data sources ─────────────────────────────────────────────────────────
  const livePrices = useLivePrices([ticker]);
  const live = livePrices.get(ticker);
  const isLive = !!live;

  // Extended hours (pre/after-market) — only show when market is closed
  const { data: extHoursData } = useQuery<{ success: boolean; data: ExtendedHoursQuote | null }>({
    queryKey: ['extended-hours', ticker],
    queryFn: async () => {
      const res = await fetch(`/api/stock/${ticker}/extended-hours`);
      return res.json();
    },
    enabled: !!ticker,
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000, // refresh every 2 min
  });
  const extHours = extHoursData?.data ?? null;

  const { data: restQuote, isLoading: quoteLoading } = useStockQuote(ticker);

  const price       = live?.price        ?? restQuote?.c  ?? 0;
  const change      = live?.change       ?? restQuote?.d  ?? 0;
  const changePct   = live?.changePercent ?? restQuote?.dp ?? 0;
  const prevClose   = live?.previousClose ?? restQuote?.pc ?? 0;
  const dayHigh     = restQuote?.h ?? 0;
  const dayLow      = restQuote?.l ?? 0;
  const openPrice   = restQuote?.o ?? 0;

  const isPositive = changePct >= 0;
  const priceColor = isPositive ? 'text-emerald-500' : 'text-red-500';

  // ── Candle data ───────────────────────────────────────────────────────────
  const { data: candleData, isLoading: candleLoading, isFetching } = useQuery<{
    success: boolean; candles: CandleData | null; range: Range;
  }>({
    queryKey: ['stock-candles', ticker, range],
    queryFn: async () => {
      const res = await fetch(`/api/stock/${ticker}/candles?range=${range}`);
      return res.json();
    },
    enabled: !!ticker,
    staleTime: 5 * 60 * 1000,
  });

  // ── Indicator data ────────────────────────────────────────────────────────
  const indicatorOption = INDICATORS.find((i) => i.key === activeIndicator)!;
  const needsIndicator = activeIndicator !== 'none';

  const { data: indicatorData } = useQuery<IndicatorResponse>({
    queryKey: ['indicator', ticker, activeIndicator, range],
    queryFn: async () => {
      const params = new URLSearchParams({ type: indicatorOption.type, range });
      if (indicatorOption.params) {
        for (const [k, v] of Object.entries(indicatorOption.params)) {
          params.set(k, String(v));
        }
      }
      const res = await fetch(`/api/stock/${ticker}/indicator?${params}`);
      return res.json();
    },
    enabled: needsIndicator && !!ticker,
    staleTime: 5 * 60 * 1000,
  });

  // ── Merge candles + indicator ─────────────────────────────────────────────
  const chartData = useMemo<ChartPoint[]>(() => {
    if (!candleData?.candles) return [];
    const { t, c, v } = candleData.candles;
    const pts: ChartPoint[] = t.map((ts, i) => ({
      time: ts, label: fmtLabel(ts, range), price: c[i], volume: v[i],
    }));

    if (!indicatorData?.data?.length) return pts;
    const indValues = indicatorData.data;

    // Build a date→value map for fast lookup
    const indMap = new Map<string, IndicatorValue>();
    for (const iv of indValues) {
      const key = iv.datetime.slice(0, 10);
      indMap.set(key, iv);
    }

    for (const pt of pts) {
      const key = new Date(pt.time * 1000).toISOString().slice(0, 10);
      const iv = indMap.get(key);
      if (!iv) continue;

      if (activeIndicator === 'sma50' || activeIndicator === 'sma200') pt.sma = iv.sma as number;
      if (activeIndicator === 'ema20') pt.ema = iv.ema as number;
      if (activeIndicator === 'bbands') {
        pt.upper = iv.upper_band as number;
        pt.middle = iv.middle_band as number;
        pt.lower = iv.lower_band as number;
      }
      if (activeIndicator === 'rsi') pt.rsi = iv.rsi as number;
      if (activeIndicator === 'macd') {
        pt.macd = iv.macd as number;
        pt.signal = iv.macd_signal as number;
        pt.hist = iv.macd_hist as number;
      }
    }
    return pts;
  }, [candleData, range, indicatorData, activeIndicator]);

  const firstPrice   = chartData[0]?.price ?? 0;
  const chartLast    = chartData[chartData.length - 1]?.price ?? 0;
  const chartDiff    = chartLast - firstPrice;
  const chartPct     = firstPrice ? (chartDiff / firstPrice) * 100 : 0;
  const chartIsPos   = chartDiff >= 0;
  const lineColor    = chartIsPos ? '#10b981' : '#ef4444';
  const gradientId   = `pg-${ticker}`;

  const priceMin = chartData.length ? Math.min(...chartData.map(d => d.price)) : 0;
  const priceMax = chartData.length ? Math.max(...chartData.map(d => d.price)) : 0;
  const yPad     = (priceMax - priceMin) * 0.06;

  // Fewer labels = cleaner chart. 4 is enough for any range.
  const tickCount    = 4;
  const tickInterval = chartData.length ? Math.max(1, Math.floor(chartData.length / tickCount)) : 1;
  const textColor    = isDark ? '#3f3f46' : '#c4c4c8';

  const isLoadingChart = (candleLoading || isFetching) && !candleData?.candles;
  const hasChart       = chartData.length > 0;
  const showOscillator = hasChart && !isSimplified && OSCILLATOR_INDICATORS.has(activeIndicator);

  if (quoteLoading && !restQuote && !live) {
    return (
      <div className="mb-8 rounded-2xl border border-border bg-card p-6 space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-[280px] w-full" />
      </div>
    );
  }

  if (!price && !quoteLoading) return null;

  return (
    <div className="mb-8 rounded-2xl border border-border bg-card overflow-hidden">

      {/* ── Price header ─────────────────────────────────────────────────── */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-bold tracking-tight text-foreground tabular-nums">
                {fmtPrice(price)}
              </span>
              <span className={cn('text-lg font-semibold tabular-nums', priceColor)}>
                {isPositive ? '+' : ''}{changePct.toFixed(2)}%
              </span>
            </div>
            <div className={cn('flex items-center gap-2 mt-1 text-sm', priceColor)}>
              <span className="tabular-nums">
                {isPositive ? '+' : ''}{fmtPrice(change)} today
              </span>
              {isLive && (
                <span className="flex items-center gap-1 text-xs text-emerald-500 font-medium">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live
                </span>
              )}
            </div>

            {/* Extended hours (pre/after-market) */}
            {extHours && (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="capitalize font-medium">
                  {extHours.pre_or_post === 'pre' ? 'Pre-market' : 'After-hours'}:
                </span>
                <span className="font-semibold text-foreground tabular-nums">{fmtPrice(extHours.price)}</span>
                <span className={cn('tabular-nums', extHours.changePercent >= 0 ? 'text-emerald-500' : 'text-red-500')}>
                  {extHours.changePercent >= 0 ? '+' : ''}{extHours.changePercent.toFixed(2)}%
                </span>
              </div>
            )}
          </div>

          {(dayHigh || prevClose) ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm shrink-0">
              {prevClose > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">Prev close</span>
                  <span className="font-medium tabular-nums">{fmtPrice(prevClose)}</span>
                </div>
              )}
              {openPrice > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">Open</span>
                  <span className="font-medium tabular-nums">{fmtPrice(openPrice)}</span>
                </div>
              )}
              {dayHigh > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">High</span>
                  <span className="font-medium tabular-nums text-emerald-500">{fmtPrice(dayHigh)}</span>
                </div>
              )}
              {dayLow > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">Low</span>
                  <span className="font-medium tabular-nums text-red-500">{fmtPrice(dayLow)}</span>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Chart controls ───────────────────────────────────────────────── */}
      <div className="px-5 pb-2 flex items-center justify-between gap-3 flex-wrap">
        {/* Range performance — plain English in simple mode, numeric in pro mode */}
        {hasChart && (
          isSimplified ? (
            <span className={cn('text-xs font-medium', chartIsPos ? 'text-emerald-500' : 'text-red-500')}>
              {chartIsPos ? '▲ Up' : '▼ Down'}{' '}
              {Math.abs(chartPct).toFixed(1)}% over this {range === '1W' ? 'week' : range === '1M' ? 'month' : range === '6M' ? '6 months' : range === '1Y' ? 'year' : range}
            </span>
          ) : (
            <span className={cn('text-xs font-medium tabular-nums', chartIsPos ? 'text-emerald-500' : 'text-red-500')}>
              {chartIsPos ? '+' : ''}{chartDiff.toFixed(2)} ({chartIsPos ? '+' : ''}{chartPct.toFixed(2)}%) {range}
            </span>
          )
        )}
        {/* Range tabs */}
        <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5 ml-auto">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-all',
                range === r
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* ── Indicator selector — hidden in simple mode ───────────────────── */}
      {!isSimplified && (
        <div className="px-5 pb-3 flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-muted-foreground mr-1">Indicator:</span>
          {INDICATORS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveIndicator(key)}
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-medium transition-all border',
                activeIndicator === key
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-transparent text-muted-foreground border-border hover:text-foreground hover:border-foreground/30'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ── Price chart ──────────────────────────────────────────────────── */}
      <div className="relative">
        {isLoadingChart && <Skeleton className="h-[280px] w-full" />}

        {!candleLoading && candleData?.candles === null && (
          <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
            No chart data available
          </div>
        )}

        {hasChart && (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={lineColor} stopOpacity={0.2} />
                  <stop offset="60%"  stopColor={lineColor} stopOpacity={0.05} />
                  <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                </linearGradient>
              </defs>

              {/* Hidden axis — only provides the Y domain, no labels rendered */}
              <YAxis domain={[priceMin - yPad, priceMax + yPad]} hide />

              {/* Minimal date labels — ~4 across the full range, very subtle */}
              <XAxis
                dataKey="label"
                interval={tickInterval}
                tick={{ fill: textColor, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                dy={6}
              />

              <Tooltip
                content={<ChartTooltip firstPrice={firstPrice} />}
                cursor={{ stroke: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)', strokeWidth: 1 }}
              />

              <Area
                type="monotone"
                dataKey="price"
                stroke={lineColor}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{ r: 4, fill: lineColor, strokeWidth: 0 }}
                isAnimationActive={false}
              />

              {/* SMA overlay */}
              {(activeIndicator === 'sma50' || activeIndicator === 'sma200') && (
                <Line type="monotone" dataKey="sma" stroke="#f59e0b" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              )}

              {/* EMA overlay */}
              {activeIndicator === 'ema20' && (
                <Line type="monotone" dataKey="ema" stroke="#a78bfa" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              )}

              {/* Bollinger Bands overlay */}
              {activeIndicator === 'bbands' && (
                <>
                  <Line type="monotone" dataKey="upper" stroke="#60a5fa" strokeWidth={1} dot={false} strokeDasharray="4 2" isAnimationActive={false} />
                  <Line type="monotone" dataKey="middle" stroke="#60a5fa" strokeWidth={1} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="lower" stroke="#60a5fa" strokeWidth={1} dot={false} strokeDasharray="4 2" isAnimationActive={false} />
                </>
              )}
            </AreaChart>
          </ResponsiveContainer>
        )}

        {/* Floating min / max price labels — inside the chart, no axis clutter */}
        {hasChart && priceMax > 0 && (
          <div className="pointer-events-none absolute inset-x-3 top-2 flex justify-end">
            <span className="text-[10px] tabular-nums text-muted-foreground/50 font-medium">
              {fmtPrice(priceMax)}
            </span>
          </div>
        )}
        {hasChart && priceMin > 0 && (
          <div className="pointer-events-none absolute inset-x-3 bottom-6 flex justify-end">
            <span className="text-[10px] tabular-nums text-muted-foreground/50 font-medium">
              {fmtPrice(priceMin)}
            </span>
          </div>
        )}
      </div>

      {/* ── Oscillator panel (RSI / MACD) ────────────────────────────────── */}
      {showOscillator && (
        <div className="border-t border-border/30 mt-1">
          <div className="px-5 pt-2 pb-1">
            <span className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-widest">
              {activeIndicator.toUpperCase()}
            </span>
          </div>

          {activeIndicator === 'rsi' && (
            <ResponsiveContainer width="100%" height={90}>
              <LineChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <XAxis dataKey="label" hide />
                <YAxis domain={[0, 100]} hide ticks={[30, 50, 70]} />
                <Tooltip formatter={(v: number) => v?.toFixed(1)} labelFormatter={() => ''} contentStyle={{ fontSize: 10 }} />
                <ReferenceLine y={70} stroke="#ef4444" strokeOpacity={0.3} strokeDasharray="3 3" strokeWidth={1} />
                <ReferenceLine y={30} stroke="#10b981" strokeOpacity={0.3} strokeDasharray="3 3" strokeWidth={1} />
                <ReferenceLine y={50} stroke={textColor} strokeDasharray="2 4" strokeWidth={1} />
                <Line type="monotone" dataKey="rsi" stroke="#f59e0b" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          )}

          {activeIndicator === 'macd' && (
            <ResponsiveContainer width="100%" height={90}>
              <LineChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <XAxis dataKey="label" hide />
                <YAxis hide tickFormatter={(v) => v?.toFixed(1)} />
                <Tooltip formatter={(v: number) => v?.toFixed(3)} labelFormatter={() => ''} contentStyle={{ fontSize: 10 }} />
                <ReferenceLine y={0} stroke={textColor} strokeDasharray="2 4" strokeWidth={1} />
                <Line type="monotone" dataKey="macd" stroke="#60a5fa" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="signal" stroke="#f59e0b" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  );
}
