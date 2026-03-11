'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HoldingsTable } from '@/components/holdings/HoldingsTable';
import { AddHoldingModal } from '@/components/holdings/AddHoldingModal';
import { HoldingsPieChart } from '@/components/holdings/HoldingsPieChart';
import { PortfolioDashboard } from '@/components/holdings/PortfolioDashboard';
import { PortfolioRiskAnalysis } from '@/components/holdings/PortfolioRiskAnalysis';
import { useHoldings } from '@/hooks/use-holdings';
import { useAuth } from '@/hooks/use-auth';
import { createBrowserClient } from '@/lib/supabase/client';
import { useQuery } from '@tanstack/react-query';
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

  // Fetch quotes and logos for all holdings
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

      // Fetch live quotes in parallel (external API — not Supabase)
      await Promise.all(
        holdings.map(async (holding) => {
          const quoteResult = await fetch(`/api/stock/${holding.symbol}/quote`)
            .then((res) => res.json())
            .catch(() => ({ success: false }));

          if (quoteResult.success && quoteResult.quote && quoteResult.quote.c > 0) {
            quoteMap[holding.symbol] = {
              price: quoteResult.quote.c,
              change: quoteResult.quote.d,
              changePercent: quoteResult.quote.dp,
            };
          }
        })
      );
      
      return { quotes: quoteMap, logos: logoMap };
    },
    enabled: !!holdings && holdings.length > 0,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000,
  });

  // Combine holdings with quotes, apply currency conversion, and calculate derived values
  const holdingsWithPrices = useMemo((): HoldingWithPrice[] => {
    if (!holdings) return [];

    const quotesMap = quotesData.data?.quotes || {};
    const logosMap = quotesData.data?.logos || {};
    const rates = exchangeRates.data ?? null;

    // Allocation is calculated from raw USD values so the ratio is unaffected by conversion
    const totalMarketValueUSD = holdings.reduce((sum, holding) => {
      const quote = quotesMap[holding.symbol];
      return quote && holding.quantity ? sum + quote.price * holding.quantity : sum;
    }, 0);

    const conv = (usd: number) =>
      userCurrency === 'USD' ? usd : convertCurrency(usd, 'USD', userCurrency, rates);

    return holdings.map((holding) => {
      const quote = quotesMap[holding.symbol];
      const logoUrl = logosMap[holding.symbol] || null;

      const currentPriceUSD = quote?.price;
      const dayChangeUSD = quote?.change;
      const dayChangePercent = quote?.changePercent;

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
  }, [holdings, quotesData.data, exchangeRates.data, userCurrency]);

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
        <h1 className="text-3xl font-bold">My Holdings</h1>
        <p className="text-muted-foreground mt-1">
          Track your stock portfolio and performance
        </p>
      </div>

      {/* Today's performance dashboard */}
      {holdingsWithPrices.length > 0 && (
        <PortfolioDashboard holdings={holdingsWithPrices} currency={userCurrency} />
      )}

      {/* Sector allocation donut */}
      {holdingsWithPrices.length > 0 && (
        <HoldingsPieChart holdings={holdingsWithPrices} currency={userCurrency} />
      )}

      {/* Holdings table (with search) */}
      <HoldingsTable onAddClick={() => setIsAddModalOpen(true)} />

      {/* AI risk analysis — deeper insight, lives below the core data */}
      {holdingsWithPrices.length > 0 && (
        <PortfolioRiskAnalysis holdings={holdingsWithPrices} />
      )}

      {/* Add Modal */}
      <AddHoldingModal open={isAddModalOpen} onOpenChange={setIsAddModalOpen} />
    </div>
  );
}
