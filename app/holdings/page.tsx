'use client';

import { useState, useMemo, useEffect, Suspense } from 'react';
import { AuthGate } from '@/components/ui/AuthGate';
import { HoldingsTable } from '@/components/holdings/HoldingsTable';
import { AddHoldingModal } from '@/components/holdings/AddHoldingModal';
import { CSVImportModal } from '@/components/holdings/CSVImportModal';
import { HoldingsPieChart } from '@/components/holdings/HoldingsPieChart';
import { PortfolioDashboard } from '@/components/holdings/PortfolioDashboard';
import { PortfolioRiskAnalysis } from '@/components/holdings/PortfolioRiskAnalysis';
import { PortfolioPerformanceChart } from '@/components/holdings/PortfolioPerformanceChart';
import { PerformanceCalendarCard } from '@/components/holdings/performance-calendar/PerformanceCalendarCard';
import { useHoldings } from '@/hooks/use-holdings';
import { useAuth } from '@/hooks/use-auth';
import { useLivePrices } from '@/hooks/use-live-prices';
import { useThrottle } from '@/hooks/use-throttle';
import { createBrowserClient } from '@/lib/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Radio, Link2, RefreshCw, BarChart2, Briefcase } from 'lucide-react';
import type { HoldingWithPrice } from '@/components/holdings/types';
import { useBrokerageAccounts, useBrokerageConnect } from '@/hooks/use-brokerage';
import { BrokerageConnect } from '@/components/brokerage/BrokerageConnect';
import { useEntitlements } from '@/hooks/use-entitlements';
import { UpgradeCTA } from '@/components/billing/UpgradeCTA';
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
  const { data: allHoldings, isLoading: holdingsLoading } = useHoldings();

  // Selling down to 0 shares zeroes out quantity rather than deleting the row
  // (see holdings-db.ts sellHolding) so undo and historical chart reconstruction
  // still work — but a fully-sold position shouldn't linger in the active table.
  // A never-set quantity (manually-tracked position with no share count) is kept.
  const holdings = useMemo(
    () => (allHoldings ?? []).filter((h) => h.quantity == null || h.quantity > 1e-9),
    [allHoldings]
  );
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [hoveredSector, setHoveredSector] = useState<string | null>(null);
  const session = useSessionState();
  const isPreMarket = session === 'pre-market';
  // Broader than isPreMarket: covers pre-market, after-hours, AND the fully-closed
  // overnight/weekend gap. TwelveData only returns the extended-hours print (the
  // actual last trade) when prepost=true is requested — without it, the batch quote
  // falls back to the plain regular-session close and misses any after-hours move,
  // which is exactly the gap the stock detail page's live-price seed (isOutsideRegularSessionET
  // in lib/twelvedata/twelvedata-client.ts) was built to avoid. Mirrors that same logic
  // here so My Holdings' day change matches the stock detail page at all hours.
  const wantsExtendedPricing = session !== 'regular';

  // Brokerage connect — used for the compact header button
  const { data: brokerageData } = useBrokerageAccounts();
  const connectMutation = useBrokerageConnect();
  const isBrokerageConnected = (brokerageData?.accounts ?? []).some((a) => a.is_active);
  const brokerageConfigured = brokerageData?.configured !== false;
  const canConnectBrokerage = useEntitlements().can('brokerage');

  // Resolve the user's preferred display currency
  const userCurrency = useMemo((): CurrencyCode => {
    const settings = (user?.settings as Record<string, unknown>) ?? {};
    const c = settings.default_currency as string | undefined;
    if (!c || c === 'exchange') return 'USD';
    return c as CurrencyCode;
  }, [user]);

  const exchangeRates = useExchangeRates(userCurrency);

  // Scalar rate: 1 USD = X userCurrency at today's rates (1 when USD). Hoisted out of
  // holdingsWithPrices so PortfolioPerformanceChart can convert its own USD-denominated
  // candle-derived P/L the same way, without duplicating the exchangeRates fetch.
  const currentFxRate = useMemo(
    () =>
      userCurrency === 'USD' || !exchangeRates.data
        ? 1
        : convertCurrency(1, 'USD', userCurrency, exchangeRates.data),
    [userCurrency, exchangeRates.data]
  );

  // Live price stream — updates prices in real time via WsManager SSE.
  // Holdings pinned to a specific listing (mic_code set) are excluded: the WS
  // tick stream has no mic_code concept and would key off the bare symbol,
  // silently overwriting a correctly mic_code-pinned REST price (from the
  // quotesData query below) with a price for the wrong listing.
  const holdingSymbols = useMemo(
    () => (holdings ?? []).filter((h) => !h.mic_code).map((h) => h.symbol),
    [holdings]
  );
  const livePrices = useLivePrices(holdingSymbols);
  // Throttle the live price Map so the holdingsWithPrices memo (and every downstream
  // component) re-renders at most once every 3 s instead of on every WS tick.
  const throttledLivePrices = useThrottle(livePrices, 3000);

  // Fetch quotes and sectors for all holdings (shared cache with HoldingsTable).
  // Logos are NOT fetched here — they arrive already attached on `holdings` from
  // getHoldings() (lib/holdings/holdings-db.ts), so they render on the first paint
  // instead of waiting on this second, holdings-gated query.
  const quotesData = useQuery({
    queryKey: ['holdings-quotes', holdings?.map((h) => h.symbol), wantsExtendedPricing],
    queryFn: async () => {
      if (!holdings || holdings.length === 0) return { quotes: {}, sectors: {} };

      const supabase = createBrowserClient();
      const quoteMap: Record<string, { price: number; change: number; changePercent: number; stale?: boolean }> = {};
      const sectorMap: Record<string, string | null> = {};

      const tickers = holdings.map((h) => h.symbol);

      // Pin the exact listing for any holding resolved against a specific
      // mic_code (e.g. an import that verified Kongsberg Gruppen on XSTU) so
      // the batch quote fetch doesn't re-guess from the bare symbol.
      const micCodes: Record<string, string> = {};
      for (const h of holdings) {
        if (h.mic_code) micCodes[h.symbol] = h.mic_code;
      }

      // Fetch cached sectors + companies (for sector fallback) in parallel
      const [{ data: companiesData }, { data: cachedSectors }] = await Promise.all([
        supabase.from('companies').select('ticker, sector').in('ticker', tickers),
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
      }

      // Batch quotes — pass prepost:true outside regular market hours so extended
      // (pre-market/after-hours) prices are returned instead of the stale regular close.
      const batchRes = await fetch('/api/quotes/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbols: tickers,
          prepost: wantsExtendedPricing,
          ...(Object.keys(micCodes).length > 0 ? { micCodes } : {}),
        }),
      });
      const batchData = await batchRes.json();
      if (batchRes.status === 429) {
        throw new Error(batchData.error || 'Market data rate limit exceeded. Please try again in a minute.');
      }
      if (batchData.success && batchData.quotes) {
        Object.assign(quoteMap, batchData.quotes);
      }

      return { quotes: quoteMap, sectors: sectorMap };
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
    const sectorsMap = quotesData.data?.sectors || {};

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
      const logoUrl = holding.logo_url ?? null;
      const sector = sectorsMap[holding.symbol] ?? null;

      const currentPriceUSD = liveQuote?.price ?? batchQuote?.price;

      // batchQuote.stale means the REST fetch missed this symbol and it came
      // from the shared last-price cache instead — only worth flagging when
      // there's also no live tick (a live tick always wins in currentPriceUSD
      // above, so the row is truly showing a fresh price either way).
      const isPriceStale = !liveQuote && !!batchQuote?.stale;

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
        currentPriceUSD,
        dayChange: dayChangeUSD !== undefined ? conv(dayChangeUSD) : undefined,
        dayChangePercent,
        marketValue: marketValueUSD !== undefined ? conv(marketValueUSD) : undefined,
        unrealizedPL,
        unrealizedPLPercent,
        allocation,
        logoUrl,
        sector,
        isPriceStale,
      };
    });
  }, [holdings, quotesData.data, currentFxRate, throttledLivePrices]);

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
          canConnectBrokerage ? (
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
          ) : (
            <UpgradeCTA label="Connect Brokerage (Pro)" variant="outline" />
          )
        )}
      </div>

      {/* Connected brokerage — manage, sync, or disconnect (only shown once connected) */}
      {brokerageConfigured && isBrokerageConnected && <BrokerageConnect />}

      {/* Stats row — 4 cards */}
      <PortfolioDashboard holdings={throttledHoldings} currency={userCurrency} isLoading={statsLoading} />

      {/* Performance chart + Allocation side-by-side */}
      {(statsLoading || throttledHoldings.length > 0) && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-stretch">
          <div className="xl:col-span-2 flex flex-col">
            <PortfolioPerformanceChart holdings={throttledHoldings} currency={userCurrency} fxRate={currentFxRate} isLoading={statsLoading} />
          </div>
          <div className="flex flex-col">
            <HoldingsPieChart holdings={throttledHoldings} currency={userCurrency} onSectorHover={setHoveredSector} isLoading={statsLoading} />
          </div>
        </div>
      )}

      {/* Day-by-day performance calendar */}
      {throttledHoldings.length > 0 && (
        <PerformanceCalendarCard currency={userCurrency} fxRate={currentFxRate} />
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
        <Suspense fallback={null}>
          <PortfolioRiskAnalysis holdings={throttledHoldings} />
        </Suspense>
      )}

      {/* Add Modal */}
      <AddHoldingModal open={isAddModalOpen} onOpenChange={setIsAddModalOpen} />
      {/* Import Modal */}
      <CSVImportModal open={isImportModalOpen} onOpenChange={setIsImportModalOpen} />
    </div>
  );
}
