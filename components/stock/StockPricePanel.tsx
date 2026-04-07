'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useTheme } from 'next-themes';
import { Skeleton } from '@/components/ui/skeleton';
import { useLivePrices } from '@/hooks/use-live-prices';
import { useStockQuote } from '@/hooks/use-stock-price';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type Range = '1W' | '1M' | '6M' | '1Y' | '3Y' | '5Y' | '10Y' | 'MAX';
const RANGES: Range[] = ['1W', '1M', '6M', '1Y', '3Y', '5Y', '10Y', 'MAX'];

interface CandleData { t: number[]; c: number[]; o: number[]; h: number[]; l: number[]; v: number[] }
interface ChartPoint { time: number; label: string; price: number; volume: number }

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

  // ── Data sources ─────────────────────────────────────────────────────────
  // 1) WebSocket live tick — updates price in real time
  const livePrices = useLivePrices([ticker]);
  const live = livePrices.get(ticker);
  const isLive = !!live;

  // 2) REST snapshot (seeded by useStockSnapshot on the page) — day H/L/O/PC
  const { data: restQuote, isLoading: quoteLoading } = useStockQuote(ticker);

  // Merge: live price supersedes REST, but REST provides the daily metadata
  const price       = live?.price        ?? restQuote?.c  ?? 0;
  const change      = live?.change       ?? restQuote?.d  ?? 0;
  const changePct   = live?.changePercent ?? restQuote?.dp ?? 0;
  const prevClose   = live?.previousClose ?? restQuote?.pc ?? 0;
  const dayHigh     = restQuote?.h ?? 0;
  const dayLow      = restQuote?.l ?? 0;
  const openPrice   = restQuote?.o ?? 0;

  const isPositive = changePct >= 0;
  const priceColor = isPositive ? 'text-emerald-500' : 'text-red-500';

  // 3) Candle chart data
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

  const chartData = useMemo<ChartPoint[]>(() => {
    if (!candleData?.candles) return [];
    const { t, c, v } = candleData.candles;
    return t.map((ts, i) => ({ time: ts, label: fmtLabel(ts, range), price: c[i], volume: v[i] }));
  }, [candleData, range]);

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

  const tickCount    = range === '1W' ? 7 : range === '1M' ? 6 : 8;
  const tickInterval = chartData.length ? Math.max(1, Math.floor(chartData.length / tickCount)) : 1;
  const textColor    = isDark ? '#52525b' : '#a1a1aa';
  const gridColor    = isDark ? '#1c1c1f' : '#f1f1f1';

  const isLoadingChart = (candleLoading || isFetching) && !candleData?.candles;
  const hasChart       = chartData.length > 0;

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

          {/* Left: price + change */}
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
          </div>

          {/* Right: day stats */}
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
        {/* Range performance */}
        {hasChart && (
          <span className={cn('text-xs font-medium tabular-nums', chartIsPos ? 'text-emerald-500' : 'text-red-500')}>
            {chartIsPos ? '+' : ''}{chartDiff.toFixed(2)} ({chartIsPos ? '+' : ''}{chartPct.toFixed(2)}%) {range}
          </span>
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

      {/* ── Chart ────────────────────────────────────────────────────────── */}
      <div className="px-1">
        {isLoadingChart && <Skeleton className="h-[260px] w-full mx-4" />}

        {!candleLoading && candleData?.candles === null && (
          <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
            No chart data available
          </div>
        )}

        {hasChart && (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={lineColor} stopOpacity={0.15} />
                  <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                </linearGradient>
              </defs>

              <XAxis
                dataKey="label"
                interval={tickInterval}
                tick={{ fill: textColor, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                dy={4}
              />
              <YAxis
                domain={[priceMin - yPad, priceMax + yPad]}
                tick={{ fill: textColor, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(0)}`}
                width={44}
              />

              {/* Subtle horizontal bands instead of grid lines */}
              <CartesianGrid strokeDasharray="0" stroke={gridColor} vertical={false} />

              <Tooltip
                content={<ChartTooltip firstPrice={firstPrice} />}
                cursor={{ stroke: isDark ? '#3f3f46' : '#e4e4e7', strokeWidth: 1 }}
              />

              <Area
                type="monotone"
                dataKey="price"
                stroke={lineColor}
                strokeWidth={1.5}
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{ r: 3.5, fill: lineColor, strokeWidth: 0 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
