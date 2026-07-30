'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useHoldings } from '@/hooks/use-holdings';
import { useAuth } from '@/hooks/use-auth';
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { convertCurrency, formatCurrency, type CurrencyCode } from '@/lib/currency/currency-conversion';
import { useExchangeRates } from '@/hooks/use-exchange-rates';
import { useUserSettings } from '@/hooks/use-user-settings';
import { ArrowUpRight, ArrowDownRight, ChevronRight, Plus } from 'lucide-react';
import type { UserHolding } from '@/lib/types/database';

// ─── Sparkline hook ────────────────────────────────────────────────────────────

type CandleData = { t: number[]; c: number[] };

function usePortfolioSparkline(holdings: UserHolding[]) {
  const eligible = useMemo(
    () => holdings.filter((h) => h.avg_price != null && h.quantity != null && h.quantity > 0),
    [holdings]
  );

  const holdingsKey = useMemo(
    () => eligible.map((h) => `${h.symbol}:${h.avg_price}:${h.quantity}`).join(','),
    [eligible]
  );

  // 1-week window — matches the "this week" label under the header stat, so
  // the chart and the number can never tell two different stories. (Used to
  // fetch 1M here while the header showed *today's* change — a mismatch on
  // two counts: wrong window, and a stat computed from a completely
  // different source (live quotes) than what the chart plotted.)
  const { data, isLoading } = useQuery({
    queryKey: ['portfolio-sparkline-week', holdingsKey],
    queryFn: async () => {
      if (eligible.length === 0) return [];
      return Promise.all(
        eligible.map(async (h) => {
          try {
            const res = await fetch(`/api/stock/${encodeURIComponent(h.symbol)}/candles?range=1W`);
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
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  const { chartData, weekChangeUSD, weekChangePercent } = useMemo(() => {
    if (!data?.length) {
      return { chartData: [] as { pl: number }[], weekChangeUSD: null as number | null, weekChangePercent: null as number | null };
    }

    // Dollar P/L and its basis, both keyed by timestamp, so the headline stat
    // (the last point) is derived from the exact same series the chart draws
    // — never a separately-sourced number that can drift from what's plotted.
    const dollarPlByTime = new Map<number, number>();
    const basisByTime = new Map<number, number>();
    let sawAnyCandles = false;

    for (const { holding, candles } of data) {
      if (!candles || holding.avg_price == null || holding.quantity == null || candles.t.length === 0) continue;
      sawAnyCandles = true;
      const { t, c } = candles;
      const periodStartMs = t[0] * 1000;
      const holdingStart = holding.date_purchased
        ? new Date(holding.date_purchased).getTime()
        : new Date(holding.created_at).getTime();
      // Bought mid-week: baseline off the actual purchase price, not the week's
      // opening price (which predates owning the position).
      const boughtDuringPeriod = holdingStart > periodStartMs;
      const basePrice = boughtDuringPeriod ? holding.avg_price : c[0];
      for (let i = 0; i < t.length; i++) {
        if (t[i] * 1000 < holdingStart) continue;
        dollarPlByTime.set(t[i], (dollarPlByTime.get(t[i]) ?? 0) + (c[i] - basePrice) * holding.quantity);
        basisByTime.set(t[i], (basisByTime.get(t[i]) ?? 0) + basePrice * holding.quantity);
      }
    }

    if (!sawAnyCandles) {
      return { chartData: [], weekChangeUSD: null, weekChangePercent: null };
    }

    const sortedTimes = Array.from(dollarPlByTime.keys()).sort((a, b) => a - b);
    const points = sortedTimes.map((t) => {
      const basis = basisByTime.get(t) ?? 0;
      return { pl: basis > 0 ? ((dollarPlByTime.get(t) ?? 0) / basis) * 100 : 0 };
    });

    const lastTime = sortedTimes[sortedTimes.length - 1];
    const finalDollarPl = dollarPlByTime.get(lastTime) ?? 0;
    const finalBasis = basisByTime.get(lastTime) ?? 0;

    return {
      chartData: points,
      weekChangeUSD: finalDollarPl,
      weekChangePercent: finalBasis > 0 ? (finalDollarPl / finalBasis) * 100 : 0,
    };
  }, [data]);

  const isPositive = (weekChangePercent ?? 0) >= 0;
  return { chartData, isLoading, isPositive, weekChangeUSD, weekChangePercent };
}

// ─── Widget ────────────────────────────────────────────────────────────────────

export function PortfolioSummaryWidget() {
  const { user, isAuthenticated } = useAuth();
  const { roundNumbers } = useUserSettings();
  const { data: holdings, isLoading } = useHoldings();

  const userCurrency: CurrencyCode = (() => {
    const settings = (user?.settings as Record<string, unknown>) ?? {};
    const c = settings.default_currency;
    if (!c || c === 'exchange') return 'USD';
    return c as CurrencyCode;
  })();

  const exchangeRates = useExchangeRates(userCurrency);

  const quotesData = useQuery({
    queryKey: ['holdings-quotes', holdings?.map((h) => h.symbol)],
    queryFn: async () => {
      if (!holdings || holdings.length === 0) return { quotes: {} };
      const tickers = holdings.map((h) => h.symbol);
      const batchRes = await fetch('/api/quotes/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: tickers }),
      });
      const batchData = await batchRes.json();
      if (batchRes.status === 429) {
        throw new Error(batchData.error || 'Market data rate limit exceeded. Please try again in a minute.');
      }
      return { quotes: (batchData.success && batchData.quotes) ? batchData.quotes : {} };
    },
    enabled: isAuthenticated && !!holdings && holdings.length > 0,
    staleTime: 3 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const {
    chartData,
    isLoading: sparklineLoading,
    isPositive: sparklinePositive,
    weekChangeUSD,
    weekChangePercent,
  } = usePortfolioSparkline(holdings ?? []);

  const summary = (() => {
    if (!holdings || holdings.length === 0) return null;
    const quotes = quotesData.data?.quotes ?? {};
    const rates = exchangeRates.data;
    const conv = (usd: number) =>
      userCurrency === 'USD' ? usd : convertCurrency(usd, 'USD', userCurrency, rates);

    const withPrices = holdings
      .map((h) => {
        const q = quotes[h.symbol];
        if (!q || !h.quantity) return null;
        return { holding: h, quote: q, marketValue: q.price * h.quantity };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const totalValueUSD = withPrices.reduce((s, p) => s + p.marketValue, 0);

    if (withPrices.length === 0) return null;

    return {
      totalValue: conv(totalValueUSD),
      weekChange: weekChangeUSD != null ? conv(weekChangeUSD) : null,
    };
  })();

  if (!isAuthenticated) return null;

  const showSkeleton =
    isLoading ||
    (!!holdings && holdings.length > 0 && !quotesData.data && quotesData.isLoading);

  if (showSkeleton) {
    return (
      <Card className="border-border/50 overflow-hidden">
        <CardContent className="p-0">
          <div className="px-4 pt-4 pb-3 space-y-1.5">
            <div className="h-3 w-14 animate-shimmer rounded" />
            <div className="h-6 w-28 animate-shimmer rounded" />
            <div className="h-3 w-24 animate-shimmer rounded" />
          </div>
          <div className="h-[72px] animate-shimmer" />
        </CardContent>
      </Card>
    );
  }

  // Empty state — no holdings yet. Render an inline CTA at the same footprint
  // as the populated card so the layout never collapses or shifts.
  if (!holdings || holdings.length === 0) {
    return (
      <Link href="/holdings" className="block group">
        <Card className="border-dashed border-border/60 hover:border-emerald-500/40 hover:bg-emerald-500/[0.03] transition-colors overflow-hidden">
          <CardContent className="p-0">
            <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Portfolio
                </p>
                <p className="text-sm font-semibold text-foreground mt-0.5">
                  Track your first holding
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  Add a stock to see live P/L and a weekly trend.
                </p>
              </div>
              <div className="h-7 w-7 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-emerald-500/20 transition-colors">
                <Plus className="h-3.5 w-3.5 text-emerald-500" />
              </div>
            </div>
            <div className="h-[72px] bg-gradient-to-b from-transparent to-emerald-500/[0.04]" />
          </CardContent>
        </Card>
      </Link>
    );
  }

  // Holdings exist but quotes couldn't price them (transient API failure) —
  // hide silently rather than show a misleading $0 number.
  if (!summary) return null;

  const hasWeekChange = summary.weekChange != null && weekChangePercent != null;
  const isPositive = (weekChangePercent ?? 0) >= 0;
  const chartColor = sparklinePositive ? '#10b981' : '#ef4444';
  const gradientId = `sw-grad-${sparklinePositive ? 'pos' : 'neg'}`;

  return (
    <Link href="/holdings" className="block">
      <Card className="border-border/50 overflow-hidden transition-colors hover:border-primary/30 hover:bg-muted/20">
        <CardContent className="p-0">
          {/* Stats row */}
          <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Portfolio
              </p>
              <p className="text-lg font-bold tabular-nums text-foreground truncate">
                {formatCurrency(summary.totalValue, userCurrency, roundNumbers ? { round: true } : undefined)}
              </p>
              {hasWeekChange && (
                <p
                  className={`text-xs font-medium tabular-nums flex items-center gap-0.5 ${
                    isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {isPositive ? '+' : ''}
                  {formatCurrency(summary.weekChange!, userCurrency, roundNumbers ? { round: true } : undefined)}
                  {' '}({isPositive ? '+' : ''}{weekChangePercent!.toFixed(roundNumbers ? 1 : 2)}%) this week
                </p>
              )}
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground mt-1" />
          </div>

          {/* Sparkline strip */}
          {!sparklineLoading && chartData.length > 1 ? (
            <ResponsiveContainer width="100%" height={72}>
              <AreaChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartColor} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="pl"
                  stroke={chartColor}
                  strokeWidth={1.5}
                  fill={`url(#${gradientId})`}
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className={`h-[72px]${sparklineLoading ? ' animate-shimmer' : ''}`} />
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
