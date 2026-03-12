'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { useHoldings } from '@/hooks/use-holdings';
import { useAuth } from '@/hooks/use-auth';
import { createBrowserClient } from '@/lib/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { getExchangeRates, convertCurrency, formatCurrency, type CurrencyCode } from '@/lib/currency/currency-conversion';
import { Briefcase, ArrowUpRight, ArrowDownRight, ChevronRight } from 'lucide-react';

const DISPLAY_COUNT = 3;

export function PortfolioSummaryWidget() {
  const { user, isAuthenticated } = useAuth();
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
      const quoteMap: Record<string, { price: number; change: number; changePercent: number }> = {};
      await Promise.all(
        holdings.map(async (holding) => {
          const res = await fetch(`/api/stock/${holding.symbol}/quote`).then((r) => r.json());
          if (res.success && res.quote?.c > 0) {
            quoteMap[holding.symbol] = {
              price: res.quote.c,
              change: res.quote.d,
              changePercent: res.quote.dp,
            };
          }
        })
      );
      return { quotes: quoteMap };
    },
    enabled: isAuthenticated && !!holdings && holdings.length > 0,
    staleTime: 3 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
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

    const sorted = [...withPrices].sort((a, b) => b.marketValue - a.marketValue);
    const top = sorted.slice(0, DISPLAY_COUNT).map((x) => ({
      ...x,
      displayValue: conv(x.marketValue),
    }));

    return { totalValue, totalDayChange, dayChangePercent, top };
  })();

  if (!isAuthenticated || !holdings || holdings.length === 0) {
    return null;
  }

  if (isLoading || (holdings.length > 0 && !quotesData.data && quotesData.isLoading)) {
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
                  {formatCurrency(summary.totalValue, userCurrency)}
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
                  {summary.dayChangePercent.toFixed(2)}% today
                </p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </div>

          {summary.top.length > 0 && (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 -mx-1">
              {summary.top.map(({ holding, displayValue }) => (
                <div
                  key={holding.id}
                  className="flex shrink-0 items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5"
                >
                  <CompanyLogo
                    name={holding.company_name}
                    ticker={holding.symbol}
                    logoUrl={null}
                    size={24}
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate max-w-[4rem]">
                      {holding.symbol}
                    </p>
                    <p className="text-[10px] text-muted-foreground tabular-nums">
                      {formatCurrency(displayValue, userCurrency)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
