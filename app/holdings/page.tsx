'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HoldingsTable } from '@/components/holdings/HoldingsTable';
import { AddHoldingModal } from '@/components/holdings/AddHoldingModal';
import { HoldingsPieChart } from '@/components/holdings/HoldingsPieChart';
import { PortfolioDashboard } from '@/components/holdings/PortfolioDashboard';
import { PortfolioRiskAnalysis } from '@/components/holdings/PortfolioRiskAnalysis';
import { PortfolioPerformanceChart } from '@/components/holdings/PortfolioPerformanceChart';
import { useHoldings } from '@/hooks/use-holdings';
import { useAuth } from '@/hooks/use-auth';
import { useLivePrices } from '@/hooks/use-live-prices';
import { useThrottle } from '@/hooks/use-throttle';
import { createBrowserClient } from '@/lib/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Radio } from 'lucide-react';
import type { HoldingWithPrice } from '@/components/holdings/types';
import {
  getExchangeRates,
  convertCurrency,
  type CurrencyCode,
} from '@/lib/currency/currency-conversion';

export default function HoldingsPage() {
  const { user, isAuthenticated } = useAuth();
  const { data: holdings, isLoading } = useHoldings();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Resolve the user's preferred display currency
  const userCurrency = useMemo((): CurrencyCode => {
    const settings = (user?.settings as any) ?? {};
    const c = settings.default_currency;
    if (!c || c === 'exchange') return 'USD';
    return c as CurrencyCode;
  }, [user]);

  // Exchange rates — only fetched when the user wants a non-USD currency
  const exchangeRates = useQuery({
    queryKey: ['exchange-rates', userCurrency],
    queryFn: () => getExchangeRates('USD'),
    enabled: userCurrency !== 'USD',
    staleTime: 60 * 60 * 1000,  // rates update once daily
    gcTime: 24 * 60 * 60 * 1000,
  });

  // Live price stream — updates prices in real time via WsManager SSE
  const holdingSymbols = useMemo(() => (holdings ?? []).map((h) => h.symbol), [holdings]);
  const livePrices = useLivePrices(holdingSymbols);

  // Fetch quotes and logos for all holdings (shared cache with HoldingsTable)
  const quotesData = useQuery({
    queryKey: ['holdings-quotes', holdings?.map((h) => h.symbol)],
    queryFn: async () => {
      if (!holdings || holdings.length === 0) return { quotes: {}, logos: {} };
      
      const supabase = createBrowserClient();
      const quoteMap: Record<string, { price: number; change: number; changePercent: number }> = {};
      const logoMap: Record<string, string | null> = {};

      const tickers = holdings.map((h) => h.symbol);

      // Single batched logo query for ALL holdings — replaces N individual queries
      const { data: companiesData } = await supabase
        .from('companies')
        .select('ticker, logo_url')
        .in('ticker', tickers);

      const dbLogoMap = new Map<string, string | null>(
        (companiesData || []).map((c) => [c.ticker, c.logo_url])
      );

      // Pre-fill logoMap; fall back to storage bucket URL where DB has no entry
      for (const ticker of tickers) {
        const dbLogo = dbLogoMap.get(ticker) ?? null;
        if (dbLogo) {
          logoMap[ticker] = dbLogo;
        } else {
          const { data: urlData } = supabase.storage
            .from('company-logos')
            .getPublicUrl(`${ticker.toLowerCase()}.jpg`);
          logoMap[ticker] = urlData?.publicUrl || null;
        }
      }

      // Batch quotes (throttled server-side to avoid Twelve Data rate limits)
      const batchRes = await fetch('/api/quotes/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: tickers }),
      });
      const batchData = await batchRes.json();
      if (batchRes.status === 429) {
        throw new Error(batchData.error || 'Market data rate limit exceeded. Please try again in a minute.');
      }
      if (batchData.success && batchData.quotes) {
        Object.assign(quoteMap, batchData.quotes);
      }

      return { quotes: quoteMap, logos: logoMap };
    },
    enabled: !!holdings && holdings.length > 0,
    staleTime: 3 * 60 * 1000, // 3 minutes (shared cache with HoldingsTable)
    gcTime: 10 * 60 * 1000,
  });

  // Combine holdings with quotes, apply currency conversion, and calculate derived values
  const holdingsWithPrices = useMemo((): HoldingWithPrice[] => {
    if (!holdings) return [];

    const quotesMap = quotesData.data?.quotes || {};
    const logosMap = quotesData.data?.logos || {};
    const rates = exchangeRates.data ?? null;

    // Allocation — use live price where available so the percentages stay current.
    const totalMarketValueUSD = holdings.reduce((sum, holding) => {
      const lp = livePrices.get(holding.symbol);
      const bq = quotesMap[holding.symbol];
      const price = lp?.price ?? bq?.price;
      return price && holding.quantity ? sum + price * holding.quantity : sum;
    }, 0);

    const conv = (usd: number) =>
      userCurrency === 'USD' ? usd : convertCurrency(usd, 'USD', userCurrency, rates);

    return holdings.map((holding) => {
      const liveQuote = livePrices.get(holding.symbol);
      const batchQuote = quotesMap[holding.symbol];
      const logoUrl = logosMap[holding.symbol] || null;

      // The live WebSocket tick gives us the current price but not reliable change data.
      // Derive previousClose from the batch REST quote (batchPrice − batchChange = previous_close)
      // so we can recompute dayChange live as the price moves throughout the session.
      const currentPriceUSD = liveQuote?.price ?? batchQuote?.price;

      const previousCloseUSD =
        batchQuote && batchQuote.price > 0
          ? batchQuote.price - batchQuote.change
          : undefined;

      // Recompute change from live price whenever we have a previous close anchor.
      const dayChangeUSD =
        currentPriceUSD !== undefined && previousCloseUSD !== undefined
          ? currentPriceUSD - previousCloseUSD
          : batchQuote?.change;

      const dayChangePercent =
        currentPriceUSD !== undefined && previousCloseUSD && previousCloseUSD > 0
          ? ((currentPriceUSD - previousCloseUSD) / previousCloseUSD) * 100
          : batchQuote?.changePercent;

      const marketValueUSD =
        currentPriceUSD && holding.quantity ? currentPriceUSD * holding.quantity : undefined;

      const unrealizedPLUSD =
        currentPriceUSD && holding.avg_price && holding.quantity
          ? (currentPriceUSD - holding.avg_price) * holding.quantity
          : undefined;

      const unrealizedPLPercent =
        currentPriceUSD && holding.avg_price
          ? ((currentPriceUSD - holding.avg_price) / holding.avg_price) * 100
          : undefined;

      const allocation =
        marketValueUSD && totalMarketValueUSD > 0
          ? (marketValueUSD / totalMarketValueUSD) * 100
          : undefined;

      return {
        ...holding,
        currentPrice: currentPriceUSD !== undefined ? conv(currentPriceUSD) : undefined,
        dayChange: dayChangeUSD !== undefined ? conv(dayChangeUSD) : undefined,
        dayChangePercent,
        marketValue: marketValueUSD !== undefined ? conv(marketValueUSD) : undefined,
        unrealizedPL: unrealizedPLUSD !== undefined ? conv(unrealizedPLUSD) : undefined,
        unrealizedPLPercent,
        allocation,
        logoUrl,
      };
    });
  }, [holdings, quotesData.data, exchangeRates.data, userCurrency, livePrices]);

  // Throttle at 3 s so live WebSocket ticks don't thrash the entire UI on every price event.
  // The portfolio value widget updates instantly (it reads livePrices directly via the memo),
  // but the table rows and dashboard stats re-render at most once every 3 seconds.
  const throttledHoldings = useThrottle(holdingsWithPrices, 3000);

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <h2 className="text-2xl font-semibold mb-2">Authentication Required</h2>
              <p className="text-muted-foreground">
                Please sign in to view your holdings.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">My Holdings</h1>
          {livePrices.size > 0 && (
            <span className="flex items-center gap-1 text-sm text-emerald-500 font-medium">
              <Radio className="h-3.5 w-3.5 animate-pulse" />
              Live
            </span>
          )}
        </div>
        <p className="text-muted-foreground mt-1">
          Track your stock portfolio and performance
        </p>
      </div>

      {/* Today's performance dashboard */}
      {throttledHoldings.length > 0 && (
        <PortfolioDashboard holdings={throttledHoldings} currency={userCurrency} />
      )}

      {/* Unrealized P/L performance chart */}
      {throttledHoldings.length > 0 && (
        <PortfolioPerformanceChart holdings={throttledHoldings} currency={userCurrency} />
      )}

      {/* Sector allocation donut */}
      {throttledHoldings.length > 0 && (
        <HoldingsPieChart holdings={throttledHoldings} currency={userCurrency} />
      )}

      {/* Holdings table — receives unthrottled holdingsWithPrices so Current Price,
          Market Value, and Unrealized P/L update immediately on every live tick.
          Aggregate widgets above use throttledHoldings to avoid excessive re-renders. */}
      <HoldingsTable
        holdingsWithPrices={holdingsWithPrices}
        onAddClick={() => setIsAddModalOpen(true)}
      />

      {/* AI risk analysis — deeper insight, lives below the core data */}
      {throttledHoldings.length > 0 && (
        <PortfolioRiskAnalysis holdings={throttledHoldings} />
      )}

      {/* Add Modal */}
      <AddHoldingModal open={isAddModalOpen} onOpenChange={setIsAddModalOpen} />
    </div>
  );
}
