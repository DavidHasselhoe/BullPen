'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { useHoldings } from '@/hooks/use-holdings';
import { useAuth } from '@/hooks/use-auth';
import { useQuery } from '@tanstack/react-query';
import { getExchangeRates, convertCurrency, formatCurrency, type CurrencyCode } from '@/lib/currency/currency-conversion';
import { useUserSettings } from '@/hooks/use-user-settings';
import { Briefcase, ArrowUpRight, ArrowDownRight, ChevronRight } from 'lucide-react';

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

  const exchangeRates = useQuery({
    queryKey: ['exchange-rates', userCurrency],
    queryFn: () => getExchangeRates('USD'),
    enabled: userCurrency !== 'USD',
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });

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
      return {
        quotes: (batchData.success && batchData.quotes) ? batchData.quotes : {},
      };
    },
    enabled: isAuthenticated && !!holdings && holdings.length > 0,
    staleTime: 3 * 60 * 1000,
    gcTime: 5 * 60 * 1000,  // price data; evict quickly so stale prices don't persist
  });

  const summary = (() => {
    if (!holdings || holdings.length === 0) return null;
    const quotes = quotesData.data?.quotes ?? {};
    const rates = exchangeRates.data;
    const conv = (usd: number) =>
      userCurrency === 'USD' ? usd : convertCurrency(usd, 'USD', userCurrency, rates);

    let totalValueUSD = 0;
    let totalDayChangeUSD = 0;

    const withPrices = holdings
      .map((h) => {
        const q = quotes[h.symbol];
        if (!q || !h.quantity) return null;
        const mv = q.price * h.quantity;
        const dayChg = q.change * h.quantity;
        totalValueUSD += mv;
        totalDayChangeUSD += dayChg;
        return { holding: h, quote: q, marketValue: mv, dayChange: dayChg };
      })
      .filter(Boolean) as Array<{ holding: (typeof holdings)[0]; quote: { price: number; change: number; changePercent: number }; marketValue: number; dayChange: number }>;

    if (withPrices.length === 0) return null;

    const dayChangePercent = totalValueUSD > 0 ? (totalDayChangeUSD / totalValueUSD) * 100 : 0;
    const totalValue = conv(totalValueUSD);
    const totalDayChange = conv(totalDayChangeUSD);

    return { totalValue, totalDayChange, dayChangePercent };
  })();

  if (!isAuthenticated) return null;

  // Skeleton placeholder — shown while holdings or quotes are fetching so the
  // flex row (CommandBar + this widget) doesn't collapse and re-expand (layout shift).
  const showSkeleton =
    isLoading ||
    (!!holdings && holdings.length > 0 && !quotesData.data && quotesData.isLoading);

  if (showSkeleton) {
    return (
      <Card className="border-border/50 overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-muted animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-24 bg-muted animate-pulse rounded" />
              <div className="h-3 w-16 bg-muted animate-pulse rounded" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!holdings || holdings.length === 0) return null;

  if (!summary) {
    return null;
  }

  const isPositive = summary.dayChangePercent >= 0;

  return (
    <Link href="/holdings" className="block">
      <Card className="border-border/50 overflow-hidden transition-colors hover:border-primary/30 hover:bg-muted/20">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Briefcase className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Portfolio
                </p>
                <p className="text-lg font-bold tabular-nums text-foreground truncate">
                  {formatCurrency(summary.totalValue, userCurrency, roundNumbers ? { round: true } : undefined)}
                </p>
                <p
                  className={`text-xs font-medium tabular-nums flex items-center gap-0.5 ${
                    isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {isPositive ? (
                    <ArrowUpRight className="h-3 w-3" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3" />
                  )}
                  {summary.dayChangePercent >= 0 ? '+' : ''}
                  {formatCurrency(summary.totalDayChange, userCurrency, roundNumbers ? { round: true } : undefined)}
                  {' '}
                  ({summary.dayChangePercent >= 0 ? '+' : ''}
                  {summary.dayChangePercent.toFixed(roundNumbers ? 1 : 2)}%) today
                </p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
