'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HoldingWithPrice } from './types';
import type { CurrencyCode } from '@/lib/currency/currency-conversion';

// ─── Types ────────────────────────────────────────────────────────────────────

// 'SINCE' is a virtual range meaning "since earliest date_purchased"
type ApiRange = '1W' | '1M' | '6M' | '1Y' | '3Y' | '5Y' | '10Y' | 'MAX';
type Range = 'SINCE' | ApiRange;

const RANGES: Range[] = ['SINCE', '1W', '1M', '6M', '1Y', '3Y', '5Y', '10Y', 'MAX'];
const RANGE_LABELS: Record<Range, string> = {
  SINCE: 'Since Purchase',
  '1W': '1W', '1M': '1M', '6M': '6M', '1Y': '1Y',
  '3Y': '3Y', '5Y': '5Y', '10Y': '10Y', 'MAX': 'MAX',
};

interface CandleData { t: number[]; c: number[] }
interface ChartPoint { time: number; label: string; pl: number; plPct: number }
interface HoldingCandle { holding: HoldingWithPrice; candles: CandleData | null }

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Given a date, returns the smallest ApiRange that covers back to that date.
 * Used to select an efficient candle request size for the "Since Purchase" mode.
 */
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
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  holdings: HoldingWithPrice[];
  currency?: CurrencyCode;
}

export function PortfolioPerformanceChart({ holdings, currency = 'USD' }: Props) {
  const [range, setRange] = useState<Range>('SINCE');

  const eligible = useMemo(
    () => holdings.filter((h) => h.avg_price != null && h.quantity != null && h.quantity > 0),
    [holdings]
  );

  // Total cost basis (sum of avgPrice × qty) — denominator for the P/L %
  const totalCostBasis = useMemo(
    () => eligible.reduce((sum, h) => sum + (h.avg_price! * h.quantity!), 0),
    [eligible]
  );

  // For "SINCE" mode: find oldest purchase/tracked date to pick the right API range
  const sinceApiRange = useMemo<ApiRange>(() => {
    const dates = eligible.map((h) => {
      const raw = h.date_purchased ?? h.created_at;
      return raw ? new Date(raw) : new Date();
    });
    const oldest = dates.reduce((min, d) => d < min ? d : min, new Date());
    return minRangeForDate(oldest);
  }, [eligible]);

  // Stable key — re-fetches when cost basis or range changes
  const holdingsKey = useMemo(
    () => eligible.map((h) => `${h.symbol}:${h.avg_price}:${h.quantity}:${h.date_purchased ?? h.created_at}`).join(','),
    [eligible]
  );

  const apiRange: ApiRange = range === 'SINCE' ? sinceApiRange : range;

  // Fetch candles for all holdings in one parallel query
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

  // Merge candle series → time-series of total unrealized P/L + P/L %
  const chartData = useMemo<ChartPoint[]>(() => {
    if (!candleResults?.length) return [];

    const plByTime = new Map<number, number>();

    for (const { holding, candles } of candleResults) {
      if (!candles || holding.avg_price == null || holding.quantity == null) continue;

      // Each holding only contributes data from its purchase/tracking start date
      const holdingStart = holding.date_purchased
        ? new Date(holding.date_purchased).getTime()
        : new Date(holding.created_at).getTime();

      const { t, c } = candles;
      for (let i = 0; i < t.length; i++) {
        // In "SINCE" mode filter each holding individually so early data points that
        // pre-date the position are excluded, giving an accurate P/L from day one.
        if (range === 'SINCE' && t[i] * 1000 < holdingStart) continue;

        const pl = (c[i] - holding.avg_price) * holding.quantity;
        plByTime.set(t[i], (plByTime.get(t[i]) ?? 0) + pl);
      }
    }

    const basis = totalCostBasis > 0 ? totalCostBasis : 1;

    return Array.from(plByTime.entries())
      .sort(([a], [b]) => a - b)
      .map(([ts, pl]) => ({
        time: ts,
        label: fmtLabel(ts, range),
        pl,
        plPct: (pl / basis) * 100,
      }));
  }, [candleResults, range, totalCostBasis]);

  const currentPL    = chartData[chartData.length - 1]?.pl    ?? 0;
  const currentPlPct = chartData[chartData.length - 1]?.plPct ?? 0;
  const isPositive   = currentPL >= 0;
  const lineColor    = isPositive ? '#10b981' : '#ef4444';
  const gradientId   = `pp-grad-${isPositive ? 'pos' : 'neg'}`;

  if (eligible.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            {isPositive
              ? <TrendingUp  className="h-4 w-4 text-emerald-500" />
              : <TrendingDown className="h-4 w-4 text-red-500" />}
            Portfolio Performance
          </CardTitle>

          {/* Range selector — mirrors the stock detail chart UI */}
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

        {/* Current unrealized P/L — dollar + percentage */}
        {!isLoading && chartData.length > 0 && (
          <div className="flex items-baseline gap-2 pt-1 flex-wrap">
            <span className={cn('text-2xl font-bold tabular-nums', isPositive ? 'text-emerald-500' : 'text-red-500')}>
              {fmtPL(currentPL, currency)}
            </span>
            <span className={cn('text-sm font-semibold tabular-nums', isPositive ? 'text-emerald-500' : 'text-red-500')}>
              ({fmtPct(currentPlPct)})
            </span>
            <span className="text-xs text-muted-foreground">unrealized P/L</span>
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

        {!isLoading && !isError && chartData.length > 0 && (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
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

              {/* Zero baseline — profit above, loss below */}
              <ReferenceLine
                y={0}
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
                    <div className="rounded-lg border border-border bg-background/95 px-3 py-2 shadow-lg backdrop-blur-sm text-xs space-y-0.5">
                      <p className={cn('font-semibold tabular-nums', pos ? 'text-emerald-500' : 'text-red-500')}>
                        {fmtPL(pt.pl, currency)}
                        <span className="ml-1.5 font-normal opacity-75">
                          ({fmtPct(pt.plPct)})
                        </span>
                      </p>
                      <p className="text-muted-foreground">{dateStr}</p>
                    </div>
                  );
                }}
                cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }}
              />

              <Area
                type="monotone"
                dataKey="pl"
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

        {!isLoading && !isError && chartData.length === 0 && (
          <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
            No chart data available for this period
          </div>
        )}
      </CardContent>
    </Card>
  );
}
