'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useTheme } from 'next-themes';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type Range = '1W' | '1M' | '6M' | '1Y' | '3Y' | '5Y' | '10Y' | 'MAX';

const RANGES: Range[] = ['1W', '1M', '6M', '1Y', '3Y', '5Y', '10Y', 'MAX'];

interface CandleData {
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v: number[];
}

interface CandlesResponse {
  success: boolean;
  candles: CandleData | null;
  range: Range;
  interval: string;
  message?: string;
  error?: string;
}

interface ChartPoint {
  time: number;
  label: string;
  price: number;
  open: number;
  volume: number;
}

function formatPrice(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${price.toFixed(2)}`;
}

function formatVolume(v: number): string {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

function formatLabel(ts: number, range: Range): string {
  const d = new Date(ts * 1000);
  if (range === '1W' || range === '1M') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  if (range === '6M' || range === '1Y') {
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }
  return d.getFullYear().toString();
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: ChartPoint }>;
  label?: string;
  firstPrice: number;
}

function CustomTooltip({ active, payload, firstPrice }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const price = point.price;
  const diff = price - firstPrice;
  const pct = firstPrice !== 0 ? (diff / firstPrice) * 100 : 0;
  const isPos = diff >= 0;
  const date = new Date(point.time * 1000).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <div className="rounded-lg border border-border bg-background/95 px-3 py-2 shadow-lg backdrop-blur-sm text-xs">
      <p className="font-medium text-foreground">{formatPrice(price)}</p>
      <p className={isPos ? 'text-green-500' : 'text-red-500'}>
        {isPos ? '+' : ''}{diff.toFixed(2)} ({isPos ? '+' : ''}{pct.toFixed(2)}%)
      </p>
      <p className="text-muted-foreground">{date}</p>
      <p className="text-muted-foreground">Vol {formatVolume(point.volume)}</p>
    </div>
  );
}

export function PriceChart({ ticker }: { ticker: string }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [range, setRange] = useState<Range>('1Y');

  const { data, isLoading, isFetching } = useQuery<CandlesResponse>({
    queryKey: ['stock-candles', ticker, range],
    queryFn: async () => {
      const res = await fetch(`/api/stock/${ticker}/candles?range=${range}`);
      return res.json();
    },
    enabled: !!ticker,
    staleTime: 5 * 60 * 1000,
  });

  const chartData = useMemo<ChartPoint[]>(() => {
    if (!data?.candles) return [];
    const { t, o, c, v } = data.candles;
    return t.map((ts, i) => ({
      time: ts,
      label: formatLabel(ts, range),
      price: c[i],
      open: o[i],
      volume: v[i],
    }));
  }, [data, range]);

  const firstPrice = chartData[0]?.price ?? 0;
  const lastPrice = chartData[chartData.length - 1]?.price ?? 0;
  const isPositive = lastPrice >= firstPrice;
  const diff = lastPrice - firstPrice;
  const pct = firstPrice !== 0 ? (diff / firstPrice) * 100 : 0;

  const lineColor = isPositive ? '#22c55e' : '#ef4444';
  const gradientId = `price-gradient-${ticker}`;
  const gridColor = isDark ? '#27272a' : '#f4f4f5';
  const textColor = isDark ? '#71717a' : '#a1a1aa';

  const priceMin = chartData.length ? Math.min(...chartData.map(d => d.price)) : 0;
  const priceMax = chartData.length ? Math.max(...chartData.map(d => d.price)) : 0;
  const padding = (priceMax - priceMin) * 0.05;

  const candles = data?.candles;
  const hasData = chartData.length > 0;
  const isLoadingInitial = (isLoading || isFetching) && !candles;

  // Thin out x-axis ticks so they don't crowd each other
  const tickCount = range === '1W' ? 7 : range === '1M' ? 6 : range === '6M' ? 6 : 8;
  const tickInterval = hasData ? Math.max(1, Math.floor(chartData.length / tickCount)) : 1;

  return (
    <Card className="mb-8">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <CardTitle className="text-base font-semibold">Price</CardTitle>
            {hasData && !isLoadingInitial && (
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium tabular-nums">{formatPrice(lastPrice)}</span>
                <span className={`text-xs tabular-nums ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                  {isPositive ? '+' : ''}{diff.toFixed(2)} ({isPositive ? '+' : ''}{pct.toFixed(2)}%)
                </span>
                <span className="text-xs text-muted-foreground">{range}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                  range === r
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pb-4 pt-0">
        {isLoadingInitial && (
          <Skeleton className="h-[300px] w-full" />
        )}

        {!isLoading && data?.candles === null && (
          <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
            No price data available for {ticker}
          </div>
        )}

        {hasData && (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={lineColor} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                stroke={gridColor}
                vertical={false}
              />

              <XAxis
                dataKey="label"
                interval={tickInterval}
                tick={{ fill: textColor, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                dy={6}
              />

              <YAxis
                domain={[priceMin - padding, priceMax + padding]}
                tick={{ fill: textColor, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${v.toFixed(0)}`}
                width={52}
              />

              <Tooltip
                content={<CustomTooltip firstPrice={firstPrice} />}
                cursor={{ stroke: isDark ? '#52525b' : '#d4d4d8', strokeWidth: 1 }}
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
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
