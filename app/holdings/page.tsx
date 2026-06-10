'use client';

import { useState, useMemo, useEffect } from 'react';
import { AuthGate } from '@/components/ui/AuthGate';
import { HoldingsTable } from '@/components/holdings/HoldingsTable';
import { AddHoldingModal } from '@/components/holdings/AddHoldingModal';
import { CSVImportModal } from '@/components/holdings/CSVImportModal';
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
import { Radio, Link2, RefreshCw, BarChart2, Briefcase } from 'lucide-react';
import type { HoldingWithPrice } from '@/components/holdings/types';
import { useBrokerageAccounts, useBrokerageConnect } from '@/hooks/use-brokerage';
import { convertCurrency, type CurrencyCode } from '@/lib/currency/currency-conversion';
import { useExchangeRates } from '@/hooks/use-exchange-rates';

type TradingSession = 'pre-market' | 'regular' | 'after-hours' | 'closed';

function getSessionState(): TradingSession {
  const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = nowET.getDay();
  if (day === 0 || day === 6) return 'closed';
  const etMins = nowET.getHours() * 60 + nowET.getMinutes();
  if (etMins >= 240 && etMins < 570) return 'pre-market';  // 4:00–9:30 AM ET
  if (etMins >= 570 && etMins < 960) return 'regular';     // 9:30 AM–4:00 PM ET
  if (etMins >= 960 && etMins < 1200) return 'after-hours'; // 4:00–8:00 PM ET
  return 'closed';
}

function useSessionState(): TradingSession {
  const [session, setSession] = useState<TradingSession>(getSessionState);
  useEffect(() => {
    const id = setInterval(() => setSession(getSessionState()), 60_000);
    return () => clearInterval(id);
  }, []);
  return session;
}

export default function HoldingsPage() {
  const { user, isAuthenticated } = useAuth();
  const { data: holdings, isLoading: holdingsLoading } = useHoldings();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [hoveredSector, setHoveredSector] = useState<string | null>(null);
  const session = useSessionState();
  const isPreMarket = session === 'pre-market';

  // Brokerage connect — used for the compact header button
  const { data: brokerageData } = useBrokerageAccounts();
  const connectMutation = useBrokerageConnect();
  const isBrokerageConnected = (brokerageData?.accounts ?? []).some((a) => a.is_active);
  const brokerageConfigured = brokerageData?.configured !== false;

  // Resolve the user's preferred display currency
  const userCurrency = useMemo((): CurrencyCode => {
    const settings = (user?.settings as Record<string, unknown>) ?? {};
    const c = settings.default_currency as string | undefined;
    if (!c || c === 'exchange') return 'USD';
    return c as CurrencyCode;
  }, [user]);

  const exchangeRates = useExchangeRates(userCurrency);

  // Live price stream — updates prices in real time via WsManager SSE
  const holdingSymbols = useMemo(() => (holdings ?? []).map((h) => h.symbol), [holdings]);
  const livePrices = useLivePrices(holdingSymbols);
  // Throttle the live price Map so the holdingsWithPrices memo (and every downstream
  // component) re-renders at most once every 3 s instead of on every WS tick.
  const throttledLivePrices = useThrottle(livePrices, 3000);

  // Fetch quotes and logos for all holdings (shared cache with HoldingsTable)
  const quotesData = useQuery({
    queryKey: ['holdings-quotes', holdings?.map((h) => h.symbol), isPreMarket],
    queryFn: async () => {
      if (!holdings || holdings.length === 0) return { quotes: {}, logos: {}, sectors: {} };

      const supabase = createBrowserClient();
      const quoteMap: Record<string, { price: number; change: number; changePercent: number }> = {};
      const logoMap: Record<string, string | null> = {};
      const sectorMap: Record<string, string | null> = {};

      const tickers = holdings.map((h) => h.symbol);

      // Fetch companies + cached sectors in parallel
      const [{ data: companiesData }, { data: cachedSectors }] = await Promise.all([
        supabase.from('companies').select('ticker, logo_url, sector').in('ticker', tickers),
        supabase.from('ticker_sectors').select('ticker, sector').in('ticker', tickers),
      ]);

      const dbCompanyMap = new Map(
        (companiesData || []).map((c) => [c.ticker, c])
      );

      // Pre-populate sectorMap from ticker_sectors cache (covers tickers absent from companies)
      for (const row of cachedSectors || []) {
        sectorMap[row.ticker] = row.sector;
      }

      // Only enrich tickers with no sector in either source
      const nullSectorTickers = tickers.filter(
        (t) => !dbCompanyMap.get(t)?.sector && !(t in sectorMap)
      );
      if (nullSectorTickers.length > 0) {
        try {
          const enrichRes = await fetch('/api/companies/enrich-sectors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tickers: nullSectorTickers }),
          });
          if (enrichRes.ok) {
            const enrichData = await enrichRes.json();
            Object.assign(sectorMap, enrichData.sectors ?? {});
          }
        } catch {
          // Non-critical — sectors will show as 'Other' this load and retry next time
        }
      }

      for (const ticker of tickers) {
        const company = dbCompanyMap.get(ticker);
        if (!(ticker in sectorMap)) sectorMap[ticker] = company?.sector ?? null;
        const dbLogo = company?.logo_url ?? null;
        if (dbLogo) {
          logoMap[ticker] = dbLogo;
        } else {
          const { data: urlData } = supabase.storage
            .from('company-logos')
            .getPublicUrl(`${ticker.toLowerCase()}.jpg`);
          logoMap[ticker] = urlData?.publicUrl || null;
        }
      }

      // Batch quotes — pass prepost:true during pre-market so extended prices
      // are returned and previousClose is anchored to yesterday's regular close.
      const batchRes = await fetch('/api/quotes/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: tickers, prepost: isPreMarket }),
      });
      const batchData = await batchRes.json();
      if (batchRes.status === 429) {
        throw new Error(batchData.error || 'Market data rate limit exceeded. Please try again in a minute.');
      }
      if (batchData.success && batchData.quotes) {
        Object.assign(quoteMap, batchData.quotes);
      }

      return { quotes: quoteMap, logos: logoMap, sectors: sectorMap };
    },
    enabled: !!holdings && holdings.length > 0,
    // During pre-market, re-anchor previousClose every 90 s so drift doesn't accumulate.
    // Regular session: 3-minute cache is fine (WebSocket handles real-time).
    // After-hours / closed: 10-minute cache — we just want today's close, no rushing.
    staleTime: isPreMarket ? 90 * 1000 : session === 'regular' ? 3 * 60 * 1000 : 10 * 60 * 1000,
    refetchInterval: isPreMarket ? 90 * 1000 : false,
    gcTime: 5 * 60 * 1000,
  });

  // Combine holdings with quotes, apply currency conversion, and calculate derived values
  const holdingsWithPrices = useMemo((): HoldingWithPrice[] => {
    if (!holdings) return [];

    const quotesMap = quotesData.data?.quotes || {};
    const logosMap = quotesData.data?.logos || {};
    const sectorsMap = quotesData.data?.sectors || {};
    const rates = exchangeRates.data ?? null;

    // Scalar rate: 1 USD = X userCurrency at today's rates (1 when USD)
    const currentFxRate =
      userCurrency === 'USD' || !rates
        ? 1
        : convertCurrency(1, 'USD', userCurrency, rates);

    const conv = (usd: number) => usd * currentFxRate;

    // Allocation — use live price where available so the percentages stay current.
    const totalMarketValueUSD = holdings.reduce((sum, holding) => {
      const lp = throttledLivePrices.get(holding.symbol);
      const bq = quotesMap[holding.symbol];
      const price = lp?.price ?? bq?.price;
      return price && holding.quantity ? sum + price * holding.quantity : sum;
    }, 0);

    return holdings.map((holding) => {
      const liveQuote = throttledLivePrices.get(holding.symbol);
      const batchQuote = quotesMap[holding.symbol];
      const logoUrl = logosMap[holding.symbol] || null;
      const sector = sectorsMap[holding.symbol] ?? null;

      const currentPriceUSD = liveQuote?.price ?? batchQuote?.price;

      // previousClose anchor — lets us recompute dayChange live as the price moves.
      // Prefer the batch REST quote (price − change); fall back to the live SSE
      // tick's previousClose, which the stream seeds within ~0.5s of page load.
      // (Previously this used only the batch quote, so the column showed 0%/blank
      //  for any symbol the batch missed until it eventually arrived.)
      const previousCloseUSD =
        batchQuote && batchQuote.price > 0 && batchQuote.change !== undefined
          ? batchQuote.price - batchQuote.change
          : liveQuote && liveQuote.previousClose > 0
            ? liveQuote.previousClose
            : undefined;

      // Recompute change from live price whenever we have a previous close anchor,
      // else fall back to whatever change the batch or live tick already carries.
      const dayChangeUSD =
        currentPriceUSD !== undefined && previousCloseUSD !== undefined
          ? currentPriceUSD - previousCloseUSD
          : batchQuote?.change ?? liveQuote?.change;

      const dayChangePercent =
        currentPriceUSD !== undefined && previousCloseUSD && previousCloseUSD > 0
          ? ((currentPriceUSD - previousCloseUSD) / previousCloseUSD) * 100
          : batchQuote?.changePercent ?? liveQuote?.changePercent;

      const marketValueUSD =
        currentPriceUSD && holding.quantity ? currentPriceUSD * holding.quantity : undefined;

      // FX-aware P&L: cost basis uses the rate at purchase, current value uses today's rate.
      // For holdings without a stored purchase rate (pre-migration or USD users), fall back to
      // currentFxRate — this collapses to the plain USD calculation, the same as before.
      const purchaseFxRate = holding.purchase_fx_rate ?? currentFxRate;

      const costBasisHome =
        holding.avg_price != null && holding.quantity != null
          ? holding.avg_price * holding.quantity * purchaseFxRate
          : undefined;

      const currentValueHome =
        currentPriceUSD !== undefined && holding.quantity != null
          ? currentPriceUSD * holding.quantity * currentFxRate
          : undefined;

      const unrealizedPL =
        currentValueHome !== undefined && costBasisHome !== undefined
          ? currentValueHome - costBasisHome
          : undefined;

      const unrealizedPLPercent =
        unrealizedPL !== undefined && costBasisHome && costBasisHome > 0
          ? (unrealizedPL / costBasisHome) * 100
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
        unrealizedPL,
        unrealizedPLPercent,
        allocation,
        logoUrl,
        sector,
      };
    });
  }, [holdings, quotesData.data, exchangeRates.data, userCurrency, throttledLivePrices]);

  // Throttle at 3 s so live WebSocket ticks don't thrash the entire UI on every price event.
  // The portfolio value widget updates instantly (it reads livePrices directly via the memo),
  // but the table rows and dashboard stats re-render at most once every 3 seconds.
  const throttledHoldings = useThrottle(holdingsWithPrices, 3000);
  const hasPricedHoldings = throttledHoldings.some((h) => h.currentPrice !== undefined);
  const statsLoading = holdingsLoading || quotesData.isLoading || (!!holdings?.length && !hasPricedHoldings);

  if (!isAuthenticated) {
    return (
      <AuthGate
        icon={<BarChart2 className="h-7 w-7" />}
        title="Sign in to view your holdings"
        description="Track positions, performance, and risk across your whole portfolio in real time."
      />
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Briefcase className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 mb-0.5">
              <h1 className="text-2xl font-bold tracking-tight">My Holdings</h1>
              {isPreMarket ? (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-full px-2.5 py-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Pre-Market
                </span>
              ) : session === 'regular' && livePrices.size > 0 ? (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-1">
                  <Radio className="h-3 w-3 animate-pulse" />
                  LIVE
                </span>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {isPreMarket
                ? 'Showing pre-market prices · Updates every 3s'
                : 'Track your positions, performance, and risk in real time.'}
            </p>
          </div>
        </div>

        {/* Compact brokerage connect button — only when configured and not yet connected */}
        {brokerageConfigured && !isBrokerageConnected && (
          <button
            onClick={() => connectMutation.mutate()}
            disabled={connectMutation.isPending}
            className="shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-lg border border-border/60 bg-card text-sm font-medium text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/40 transition-all duration-150 disabled:opacity-50"
          >
            {connectMutation.isPending ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Link2 className="h-3.5 w-3.5" />
            )}
            Connect Brokerage
          </button>
        )}
      </div>

      {/* Stats row — 4 cards */}
      <PortfolioDashboard holdings={throttledHoldings} currency={userCurrency} isLoading={statsLoading} />

      {/* Performance chart + Allocation side-by-side */}
      {(statsLoading || throttledHoldings.length > 0) && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-stretch">
          <div className="xl:col-span-2 flex flex-col">
            <PortfolioPerformanceChart holdings={throttledHoldings} currency={userCurrency} isLoading={statsLoading} />
          </div>
          <div className="flex flex-col">
            <HoldingsPieChart holdings={throttledHoldings} currency={userCurrency} onSectorHover={setHoveredSector} isLoading={statsLoading} />
          </div>
        </div>
      )}

      {/* Holdings table */}
      <HoldingsTable
        holdingsWithPrices={holdingsWithPrices}
        isPricesLoading={quotesData.isLoading}
        onAddClick={() => setIsAddModalOpen(true)}
        onImportClick={() => setIsImportModalOpen(true)}
        hoveredSector={hoveredSector}
      />

      {/* AI risk analysis */}
      {throttledHoldings.length > 0 && (
        <PortfolioRiskAnalysis holdings={throttledHoldings} />
      )}

      {/* Add Modal */}
      <AddHoldingModal open={isAddModalOpen} onOpenChange={setIsAddModalOpen} />
      {/* Import Modal */}
      <CSVImportModal open={isImportModalOpen} onOpenChange={setIsImportModalOpen} />
    </div>
  );
}
