'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HoldingsTable } from '@/components/holdings/HoldingsTable';
import { AddHoldingModal } from '@/components/holdings/AddHoldingModal';
import { HoldingsPieChart } from '@/components/holdings/HoldingsPieChart';
import { useHoldings } from '@/hooks/use-holdings';
import { useAuth } from '@/hooks/use-auth';
import { useMemo } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';
import { useQuery } from '@tanstack/react-query';
import type { HoldingWithPrice } from '@/components/holdings/types';

export default function HoldingsPage() {
  const { user, isAuthenticated } = useAuth();
  const { data: holdings, isLoading } = useHoldings();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

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

  // Combine holdings with quotes and calculate derived values
  const holdingsWithPrices = useMemo((): HoldingWithPrice[] => {
    if (!holdings) return [];
    
    const quotesMap = quotesData.data?.quotes || {};
    const logosMap = quotesData.data?.logos || {};
    const totalMarketValue = holdings.reduce((sum, holding) => {
      const quote = quotesMap[holding.symbol];
      if (quote && holding.quantity) {
        return sum + quote.price * holding.quantity;
      }
      return sum;
    }, 0);

    return holdings.map((holding) => {
      const quote = quotesMap[holding.symbol];
      const logoUrl = logosMap[holding.symbol] || null;
      
      const currentPrice = quote?.price;
      const dayChange = quote?.change;
      const dayChangePercent = quote?.changePercent;
      
      const marketValue = currentPrice && holding.quantity
        ? currentPrice * holding.quantity
        : undefined;
      
      const unrealizedPL = currentPrice && holding.avg_price && holding.quantity
        ? (currentPrice - holding.avg_price) * holding.quantity
        : undefined;
      
      const unrealizedPLPercent = currentPrice && holding.avg_price
        ? ((currentPrice - holding.avg_price) / holding.avg_price) * 100
        : undefined;
      
      const allocation = marketValue && totalMarketValue > 0
        ? (marketValue / totalMarketValue) * 100
        : undefined;

      return {
        ...holding,
        currentPrice,
        dayChange,
        dayChangePercent,
        marketValue,
        unrealizedPL,
        unrealizedPLPercent,
        allocation,
        logoUrl,
      };
    });
  }, [holdings, quotesData.data]);

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

      {/* Chart */}
      {holdingsWithPrices.length > 0 && (
        <HoldingsPieChart holdings={holdingsWithPrices} />
      )}

      {/* Table */}
      <HoldingsTable onAddClick={() => setIsAddModalOpen(true)} />

      {/* Add Modal */}
      <AddHoldingModal open={isAddModalOpen} onOpenChange={setIsAddModalOpen} />
    </div>
  );
}
