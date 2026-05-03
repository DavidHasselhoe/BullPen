'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HoldingWithPrice } from './types';
import type { CurrencyCode } from '@/lib/currency/currency-conversion';

// ─── Types ────────────────────────────────────────────────────────────────────

type ApiRange = '1W' | '1M' | '6M' | '1Y' | '3Y' | '5Y' | '10Y' | 'MAX';
type Range = 'SINCE' | ApiRange;

const RANGES: Range[] = ['SINCE', '1W', '1M', '6M', '1Y', '3Y', '5Y', '10Y', 'MAX'];
const RANGE_LABELS: Record<Range, string> = {
  SINCE: 'Since Purchase',
  '1W': '1W', '1M': '1M', '6M': '6M', '1Y': '1Y',
  '3Y': '3Y', '5Y': '5Y', '10Y': '10Y', 'MAX': 'MAX',
};

interface CandleData { t: number[]; c: number[] }
interface ChartPoint { time: number; label: string; pl: number; plPct: number; spyPct?: number }
interface HoldingCandle { holding: HoldingWithPrice; candles: CandleData | null }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function minRangeForDate(date: Date): ApiRange {
  const days = (Date.now() - date.getTime()) / 86_400_000;
  if (days <= 8)    return '1W';
  if (days <= 32)   return '1M';
  if (days <= 185)  return '6M';
  if (days <= 367)  return '1Y';
  if (days <= 1096) return '3Y';
  if (days <= 1827) return '5Y';
  if (days <= 3653) return '10Y';
  return 'MAX';
}

function fmtLabel(ts: number, range: Range): string {
  const d = new Date(ts * 1000);
  if (range === 'SINCE' || range === '1W' || range === '1M') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  if (range === '6M' || range === '1Y') {
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }
  return d.getFullYear().toString();
}

const CURRENCY_SYMBOLS: Partial<Record<CurrencyCode, string>> = {
  USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'C$', AUD: 'A$', NZD: 'NZ$',
  CHF: 'CHF ', NOK: 'NOK ', SEK: 'SEK ', DKK: 'DKK ',
};

function fmtPL(value: number, currency: CurrencyCode): string {
  const sym = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '+';
  if (abs >= 1_000_000) return `${sign}${sym}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}${sym}${(abs / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(value).replace(/^-/, sign);
}

function fmtPct(pct: number): string {
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

// Binary search: largest index where pairs[i][0] <= ts
function floorLookup(pairs: [number, number][], ts: number): number | undefined {
  let lo = 0, hi = pairs.length - 1, res = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (pairs[mid][0] <= ts) { res = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return res >= 0 ? pairs[res][1] : undefined;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  holdings: HoldingWithPrice[];
  currency?: CurrencyCode;
}

export function PortfolioPerformanceChart({ holdings, currency = 'USD' }: Props) {
  const [range, setRange]           = useState<Range>('SINCE');
  const [showBenchmark, setShowBenchmark] = useState(false);

  const eligible = useMemo(
    () => holdings.filter((h) => h.avg_price != null && h.quantity != null && h.quantity > 0),
    [holdings]
  );

  const totalCostBasis = useMemo(
    () => eligible.reduce((sum, h) => sum + (h.avg_price! * h.quantity!), 0),
    [eligible]
  );

  const sinceApiRange = useMemo<ApiRange>(() => {
    const dates = eligible.map((h) => {
      const raw = h.date_purchased ?? h.created_at;
      return raw ? new Date(raw) : new Date();
    });
    const oldest = dates.reduce((min, d) => d < min ? d : min, new Date());
    return minRangeForDate(oldest);
  }, [eligible]);

  const holdingsKey = useMemo(
    () => eligible.map((h) => `${h.symbol}:${h.avg_price}:${h.quantity}:${h.date_purchased ?? h.created_at}`).join(','),
    [eligible]
  );

  const apiRange: ApiRange = range === 'SINCE' ? sinceApiRange : range;

  // Portfolio candles
  const { data: candleResults, isLoading, isError } = useQuery<HoldingCandle[]>({
    queryKey: ['portfolio-performance', holdingsKey, apiRange],
    queryFn: async () => {
      if (eligible.length === 0) return [];
      return Promise.all(
        eligible.map(async (h) => {
          try {
            const res = await fetch(`/api/stock/${encodeURIComponent(h.symbol)}/candles?range=${apiRange}`);
            if (!res.ok) return { holding: h, candles: null };
            const json = await res.json();
            return { holding: h, candles: (json.candles ?? null) as CandleData | null };
          } catch {
            return { holding: h, candles: null };
          }
        })
      );
    },
    enabled: eligible.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // SPY benchmark candles — only fetched when toggle is on
  const { data: spyCandles, isLoading: spyLoading } = useQuery<CandleData | null>({
    queryKey: ['spy-benchmark', apiRange],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/stock/SPY/candles?range=${apiRange}`);
        if (!res.ok) return null;
        const json = await res.json();
        return (json.candles ?? null) as CandleData | null;
      } catch {
        return null;
      }
    },
    enabled: showBenchmark,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // Portfolio chart points
  const chartData = useMemo<ChartPoint[]>(() => {
    if (!candleResults?.length) return [];

    const plByTime = new Map<number, number>();
    let periodBasis = 0;

    for (const { holding, candles } of candleResults) {
      if (!candles || holding.avg_price == null || holding.quantity == null) continue;

      const holdingStart = holding.date_purchased
        ? new Date(holding.date_purchased).getTime()
        : new Date(holding.created_at).getTime();

      const { t, c } = candles;

      if (range === 'SINCE') {
        for (let i = 0; i < t.length; i++) {
          if (t[i] * 1000 < holdingStart) continue;
          const pl = (c[i] - holding.avg_price) * holding.quantity;
          plByTime.set(t[i], (plByTime.get(t[i]) ?? 0) + pl);
        }
      } else {
        const periodStartMs = t.length > 0 ? t[0] * 1000 : 0;
        const boughtDuringPeriod = holdingStart > periodStartMs;
        const basePrice = boughtDuringPeriod ? holding.avg_price : c[0];
        periodBasis += basePrice * holding.quantity;

        for (let i = 0; i < t.length; i++) {
          if (t[i] * 1000 < holdingStart) continue;
          const pl = (c[i] - basePrice) * holding.quantity;
          plByTime.set(t[i], (plByTime.get(t[i]) ?? 0) + pl);
        }
      }
    }

    const basis = range === 'SINCE'
      ? (totalCostBasis > 0 ? totalCostBasis : 1)
      : (periodBasis > 0 ? periodBasis : 1);

    return Array.from(plByTime.entries())
      .sort(([a], [b]) => a - b)
      .map(([ts, pl]) => ({
        time: ts,
        label: fmtLabel(ts, range),
        pl,
        plPct: (pl / basis) * 100,
      }));
  }, [candleResults, range, totalCostBasis]);

  // Enrich chart points with SPY % return, normalized from the first portfolio timestamp
  const enrichedData = useMemo<ChartPoint[]>(() => {
    if (!showBenchmark || !spyCandles || chartData.length === 0) return chartData;

    const pairs: [number, number][] = spyCandles.t
      .map((t, i) => [t, spyCandles.c[i]] as [number, number])
      .sort((a, b) => a[0] - b[0]);

    const spyStart = floorLookup(pairs, chartData[0].time);
    if (!spyStart) return chartData;

    return chartData.map((pt) => {
      const spyPrice = floorLookup(pairs, pt.time);
      return {
        ...pt,
        spyPct: spyPrice !== undefined ? (spyPrice / spyStart - 1) * 100 : undefined,
      };
    });
  }, [chartData, showBenchmark, spyCandles]);

  const lastPt        = enrichedData[enrichedData.length - 1];
  const currentPL     = lastPt?.pl    ?? 0;
  const currentPlPct  = lastPt?.plPct ?? 0;
  const spyCurrentPct = lastPt?.spyPct;
  const outperformance = spyCurrentPct !== undefined ? currentPlPct - spyCurrentPct : undefined;

  const isPositive  = currentPL >= 0;
  const lineColor   = isPositive ? '#10b981' : '#ef4444';
  const gradientId  = `pp-grad-${isPositive ? 'pos' : 'neg'}`;

  if (eligible.length === 0) return null;

  const benchmarkReady = showBenchmark && !spyLoading && spyCurrentPct !== undefined;

  return (
    <Card className="overflow-hidden h-full">
      <CardHeader className="pb-3">

        {/* Row 1 — title + range selector */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            {isPositive
              ? <TrendingUp  className="h-4 w-4 text-emerald-500" />
              : <TrendingDown className="h-4 w-4 text-red-500" />}
            Performance
          </CardTitle>

          <div className="flex items-center gap-0.5 rounded-full bg-muted p-1">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-medium transition-all whitespace-nowrap',
                  r === range
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2 — metrics + benchmark controls */}
        {!isLoading && enrichedData.length > 0 && (
          <div className="flex items-center justify-between flex-wrap gap-2 pt-0.5">

            {/* Left: P/L summary or benchmark legend */}
            {showBenchmark ? (
              <div className="flex items-center gap-4 flex-wrap">
                {/* Portfolio legend item */}
                <div className="flex items-center gap-2">
                  <svg width="18" height="8" className="shrink-0">
                    <line x1="0" y1="4" x2="18" y2="4" stroke={lineColor} strokeWidth="2" />
                  </svg>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/50">
                    Your Portfolio
                  </span>
                  <span className={cn('text-[11px] font-bold tabular-nums', isPositive ? 'text-emerald-500' : 'text-red-500')}>
                    {fmtPct(currentPlPct)}
                  </span>
                </div>
                {/* SPY legend item */}
                {benchmarkReady && (
                  <div className="flex items-center gap-2">
                    <svg width="18" height="8" className="shrink-0">
                      <line x1="0" y1="4" x2="18" y2="4" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="3 2" />
                    </svg>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/50">
                      S&P 500
                    </span>
                    <span className="text-[11px] font-bold tabular-nums text-slate-400">
                      {fmtPct(spyCurrentPct!)}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-baseline gap-2">
                <span className={cn('text-2xl font-bold tabular-nums', isPositive ? 'text-emerald-500' : 'text-red-500')}>
                  {fmtPL(currentPL, currency)}
                </span>
                <span className={cn('text-sm font-semibold tabular-nums', isPositive ? 'text-emerald-500' : 'text-red-500')}>
                  ({fmtPct(currentPlPct)})
                </span>
                <span className="text-xs text-muted-foreground">
                  {range === 'SINCE' ? 'unrealized P/L' : 'period return'}
                </span>
              </div>
            )}

            {/* Right: outperformance badge + toggle */}
            <div className="flex items-center gap-2">
              {benchmarkReady && outperformance !== undefined && (
                <span className={cn(
                  'text-[11px] font-bold tabular-nums px-2.5 py-1 rounded-full border',
                  outperformance >= 0
                    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                    : 'text-red-400 bg-red-500/10 border-red-500/20'
                )}>
                  {fmtPct(outperformance)} VS S&P
                </span>
              )}
              <button
                onClick={() => setShowBenchmark((v) => !v)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all duration-150',
                  showBenchmark
                    ? 'bg-foreground/8 border-border text-foreground/70 hover:border-border/60'
                    : 'border-border/50 text-muted-foreground hover:text-foreground hover:border-border'
                )}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" className="shrink-0">
                  {showBenchmark ? (
                    <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  ) : (
                    <>
                      <line x1="5" y1="1" x2="5" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </>
                  )}
                </svg>
                S&P Benchmark
              </button>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0 pb-3">
        {isLoading && <Skeleton className="h-[220px] w-full rounded-none" />}

        {!isLoading && isError && (
          <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
            Could not load chart data
          </div>
        )}

        {!isLoading && !isError && enrichedData.length > 0 && (
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={enrichedData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={lineColor} stopOpacity={0.22} />
                  <stop offset="75%"  stopColor={lineColor} stopOpacity={0.04} />
                  <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                </linearGradient>
              </defs>

              <YAxis domain={['auto', 'auto']} hide />
              <XAxis
                dataKey="label"
                tick={{ fill: '#71717a', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                dy={6}
                interval="preserveStartEnd"
              />

              <ReferenceLine
                y={showBenchmark ? 0 : 0}
                stroke="#71717a"
                strokeDasharray="3 3"
                strokeWidth={1}
                strokeOpacity={0.45}
              />

              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const pt = payload[0].payload as ChartPoint;
                  const dateStr = new Date(pt.time * 1000).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                  });
                  const pos = pt.pl >= 0;
                  return (
                    <div className="rounded-lg border border-border bg-background/95 px-3 py-2 shadow-lg backdrop-blur-sm text-xs space-y-1">
                      {showBenchmark ? (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="h-1.5 w-3 rounded-full" style={{ backgroundColor: lineColor }} />
                            <span className={cn('font-semibold tabular-nums', pos ? 'text-emerald-500' : 'text-red-500')}>
                              {fmtPct(pt.plPct)}
                            </span>
                            <span className="text-muted-foreground">portfolio</span>
                          </div>
                          {pt.spyPct !== undefined && (
                            <div className="flex items-center gap-2">
                              <span className="h-px w-3 border-t border-dashed border-slate-400" />
                              <span className="font-semibold tabular-nums text-slate-400">
                                {fmtPct(pt.spyPct)}
                              </span>
                              <span className="text-muted-foreground">S&P 500</span>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className={cn('font-semibold tabular-nums', pos ? 'text-emerald-500' : 'text-red-500')}>
                          {fmtPL(pt.pl, currency)}
                          <span className="ml-1.5 font-normal opacity-75">({fmtPct(pt.plPct)})</span>
                        </p>
                      )}
                      <p className="text-muted-foreground">{dateStr}</p>
                    </div>
                  );
                }}
                cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }}
              />

              {/* Portfolio area — switches dataKey based on benchmark mode */}
              <Area
                type="monotone"
                dataKey={showBenchmark ? 'plPct' : 'pl'}
                stroke={lineColor}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{ r: 4, fill: lineColor, strokeWidth: 0 }}
                isAnimationActive={false}
              />

              {/* S&P 500 benchmark line — only when toggled on and data is ready */}
              {benchmarkReady && (
                <Line
                  type="monotone"
                  dataKey="spyPct"
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={false}
                  activeDot={{ r: 3, fill: '#94a3b8', strokeWidth: 0 }}
                  isAnimationActive={false}
                  connectNulls
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {!isLoading && !isError && enrichedData.length === 0 && (
          <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
            No chart data available for this period
          </div>
        )}
      </CardContent>
    </Card>
  );
}
