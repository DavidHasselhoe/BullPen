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
import { useHoldingSales } from '@/hooks/use-holdings';
import type { HoldingWithPrice } from './types';
import type { CurrencyCode } from '@/lib/currency/currency-conversion';
import type { HoldingSale } from '@/lib/types/database';

// ─── Types ────────────────────────────────────────────────────────────────────

type Range = '1W' | '1M' | '6M' | '1Y' | '3Y' | '5Y' | '10Y' | 'MAX';

const RANGES: Range[] = ['1W', '1M', '6M', '1Y', '3Y', '5Y', '10Y', 'MAX'];
const RANGE_LABELS: Record<Range, string> = {
  '1W': '1W', '1M': '1M', '6M': '6M', '1Y': '1Y',
  '3Y': '3Y', '5Y': '5Y', '10Y': '10Y', 'MAX': 'MAX',
};

interface CandleData { t: number[]; c: number[] }
interface ChartPoint { time: number; label: string; pl: number; plPct: number; spyPct?: number }
interface HoldingCandle { holding: HoldingWithPrice; candles: CandleData | null }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtLabel(ts: number, range: Range): string {
  const d = new Date(ts * 1000);
  if (range === '1W' || range === '1M') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  if (range === '6M' || range === '1Y') {
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }
  return d.getFullYear().toString();
}

function fmtPL(value: number, currency: CurrencyCode): string {
  const sign = value < 0 ? '-' : '+';
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(Math.abs(value));
  return `${sign}${formatted}`;
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
  /** 1 USD = X `currency` at today's rate (1 for USD). Candle closes are USD-denominated
   *  (matching how the rest of the holdings page treats quotes), so this scales the
   *  chart's raw P/L into the user's display currency the same way the header stats do. */
  fxRate?: number;
  isLoading?: boolean;
}

export function PortfolioPerformanceChart({ holdings, currency = 'USD', fxRate = 1, isLoading: holdingsLoading }: Props) {
  const [range, setRange]           = useState<Range>('MAX');
  const [showBenchmark, setShowBenchmark] = useState(false);

  const { data: allSales } = useHoldingSales();

  const salesBySymbol = useMemo(() => {
    const map = new Map<string, HoldingSale[]>();
    for (const sale of allSales ?? []) {
      const list = map.get(sale.symbol) ?? [];
      list.push(sale);
      map.set(sale.symbol, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.sale_date).getTime() - new Date(b.sale_date).getTime());
    }
    return map;
  }, [allSales]);

  // Symbols with sale history but no surviving user_holdings row (the row
  // was hard-deleted after being fully sold, via the existing Remove
  // action). Without a synthetic entry here, eligible below would never
  // include them — since it filters `holdings`, which has no row for a
  // deleted symbol at all — silently dropping their locked-in realized
  // gains from the chart even though the sales still show in the
  // Sold Positions list. quantity is always 0 here: whatever the holding's
  // remaining share count was at the moment of deletion is not recoverable
  // (it only ever lived in the now-gone user_holdings row), so only the
  // realized portion can be reconstructed for these — which is exactly the
  // portion this feature promises stays permanent.
  const orphanedEntries = useMemo(() => {
    const known = new Set(holdings.map((h) => h.symbol));
    const entries: HoldingWithPrice[] = [];
    for (const [symbol, sales] of salesBySymbol) {
      if (known.has(symbol) || sales.length === 0) continue;
      const last = sales[sales.length - 1]; // salesBySymbol entries are pre-sorted ascending by sale_date
      entries.push({
        id: `orphaned:${symbol}`,
        user_id: last.user_id,
        symbol,
        company_name: last.company_name,
        quantity: 0,
        avg_price: last.avg_cost_basis,
        date_purchased: sales[0].sale_date,
        source: 'manual',
        brokerage_account_id: null,
        alerts_enabled: false,
        asset_type: (last.asset_type as HoldingWithPrice['asset_type']) ?? 'stock',
        purchase_currency: null,
        purchase_fx_rate: null,
        trading_currency: last.trading_currency,
        created_at: sales[0].sale_date,
        updated_at: last.sale_date,
      });
    }
    return entries;
  }, [holdings, salesBySymbol]);

  const eligible = useMemo(
    () => [...holdings, ...orphanedEntries].filter((h) =>
      h.avg_price != null &&
      ((h.quantity != null && h.quantity > 0) || (salesBySymbol.get(h.symbol)?.length ?? 0) > 0)
    ),
    [holdings, orphanedEntries, salesBySymbol]
  );

  const holdingsKey = useMemo(
    () => eligible.map((h) => {
      const sales = salesBySymbol.get(h.symbol) ?? [];
      const salesTag = sales.map((s) => `${s.sale_date}:${s.quantity_sold}:${s.realized_pl}`).join('|');
      return `${h.symbol}:${h.avg_price}:${h.quantity}:${h.date_purchased ?? h.created_at}:${salesTag}`;
    }).join(','),
    [eligible, salesBySymbol]
  );

  // Portfolio candles
  const { data: candleResults, isLoading, isError } = useQuery<HoldingCandle[]>({
    queryKey: ['portfolio-performance', holdingsKey, range],
    queryFn: async () => {
      if (eligible.length === 0) return [];
      return Promise.all(
        eligible.map(async (h) => {
          try {
            const res = await fetch(`/api/stock/${encodeURIComponent(h.symbol)}/candles?range=${range}`);
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
    queryKey: ['spy-benchmark', range],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/stock/SPY/candles?range=${range}`);
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
      if (!candles || holding.avg_price == null) continue;

      const holdingStart = holding.date_purchased
        ? new Date(holding.date_purchased).getTime()
        : new Date(holding.created_at).getTime();

      const sales = salesBySymbol.get(holding.symbol) ?? [];
      const currentQty = holding.quantity ?? 0;
      const { t, c } = candles;

      // Basis is avg_price whenever the holding was bought during the
      // selected window (the common case — and for MAX, effectively always,
      // since the window predates any realistic purchase date), otherwise
      // the period's opening price for a true windowed return.
      const periodStartMs = t.length > 0 ? t[0] * 1000 : 0;
      const boughtDuringPeriod = holdingStart > periodStartMs;
      const basePrice = boughtDuringPeriod ? holding.avg_price : c[0];

      // Shares still held at time t: current quantity, plus back out every
      // sale that hadn't happened yet as of t.
      const sharesHeldAt = (tMs: number): number => {
        let shares = currentQty;
        for (const sale of sales) {
          if (new Date(sale.sale_date).getTime() > tMs) shares += sale.quantity_sold;
        }
        return shares;
      };

      // Realized gain locked in as of time t. When the position's entire
      // life fits inside the selected window (boughtDuringPeriod), each
      // sale's own lifetime realized_pl is already consistent with
      // basePrice (= avg_price) — used as-is, matching MAX's existing
      // behavior exactly. When the position predates the window, a sale's
      // LIFETIME realized_pl is anchored to the original purchase price,
      // not this window's opening price — using it as-is would overstate
      // (or, for a sale that happened entirely before the window opened,
      // badly distort) a windowed return. So each such sale is re-expressed
      // relative to the window's own basePrice instead, and — matching how
      // sharesHeldAt already treats them — a sale that happened before the
      // window opened contributes nothing to this window's own story at all.
      const realizedAt = (tMs: number): number => {
        let realized = 0;
        for (const sale of sales) {
          const saleMs = new Date(sale.sale_date).getTime();
          if (saleMs > tMs) continue;
          if (boughtDuringPeriod) {
            realized += sale.realized_pl;
          } else if (saleMs >= periodStartMs) {
            realized += (sale.sale_price - basePrice) * sale.quantity_sold;
          }
        }
        return realized;
      };

      periodBasis += basePrice * sharesHeldAt(periodStartMs);

      for (let i = 0; i < t.length; i++) {
        const tsMs = t[i] * 1000;
        if (tsMs < holdingStart) continue;
        const shares = sharesHeldAt(tsMs);
        const pl = (c[i] - basePrice) * shares + realizedAt(tsMs);
        plByTime.set(t[i], (plByTime.get(t[i]) ?? 0) + pl);
      }
    }

    const basis = periodBasis > 0 ? periodBasis : 1;

    return Array.from(plByTime.entries())
      .sort(([a], [b]) => a - b)
      .map(([ts, pl]) => ({
        time: ts,
        label: fmtLabel(ts, range),
        // fxRate scales display-only — plPct is a ratio of two USD figures, so the
        // rate cancels out and must stay computed from the unconverted pl/basis.
        pl: pl * fxRate,
        plPct: (pl / basis) * 100,
      }));
  }, [candleResults, range, salesBySymbol, fxRate]);

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

  if (holdingsLoading) {
    return (
      <Card className="overflow-hidden h-full">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-7 w-64 rounded-full" />
          </div>
        </CardHeader>
        <CardContent className="p-0 pb-3">
          <Skeleton className="h-[220px] w-full rounded-none" />
        </CardContent>
      </Card>
    );
  }

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
                  {range === 'MAX' ? 'total P/L' : 'period return'}
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
