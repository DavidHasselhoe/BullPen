'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { useHoldings } from '@/hooks/use-holdings';
import { isOpenPosition } from '@/lib/holdings/open-position';
import { useWatchlist } from '@/hooks/use-watchlist';
import { useExchangeRates } from '@/hooks/use-exchange-rates';
import { useCashValue } from '@/hooks/use-cash-value';
import { useTradingSession, type TradingSession } from '@/hooks/use-trading-session';
import { convertCurrency, listingToUsd, type CurrencyCode } from '@/lib/currency/currency-conversion';
import { fetchHoldingQuotes } from '@/lib/holdings/holding-quotes';

export interface HomeMover {
  symbol: string;
  name: string;
  logoUrl: string | null;
  held: boolean;
  price: number;
  change: number;
  changePercent: number;
}

/**
 * Everything Home knows about the person's own money, from one quote request
 * over holdings and watchlist together. The numbers use the same request and
 * the same rules as My Holdings (fetchHoldingQuotes, useCashValue), so the
 * total on Home is the total on Holdings.
 *
 * `todayPct` is on invested value, as on Holdings: cash has no day change.
 */
export function useHomePortfolio() {
  const { user, isAuthenticated } = useAuth();
  const { data: allHoldings, isLoading: holdingsLoading } = useHoldings();
  const { data: watchlist, isLoading: watchlistLoading } = useWatchlist();
  const session = useTradingSession();

  const currency: CurrencyCode = (() => {
    const c = (user?.settings as Record<string, unknown> | null)?.default_currency as string | undefined;
    return !c || c === 'exchange' ? 'USD' : (c as CurrencyCode);
  })();
  // Fully sold positions keep a zero-quantity row for undo and chart history.
  const holdings = useMemo(
    () => (allHoldings ?? []).filter(isOpenPosition),
    [allHoldings],
  );

  // A EUR listing needs EUR→USD even for a USD user, as on My Holdings.
  const rates = useExchangeRates(currency, holdings.some((h) => (h.trading_currency ?? 'USD') !== 'USD'));
  const usdRate = currency === 'USD' || !rates.data ? 1 : convertCurrency(1, 'USD', currency, rates.data);
  const cashValue = useCashValue(currency, usdRate, !!rates.data);

  const symbols = useMemo(() => {
    const set = new Set<string>();
    for (const h of holdings) set.add(h.symbol);
    for (const w of watchlist ?? []) set.add(w.symbol);
    return [...set].sort();
  }, [holdings, watchlist]);

  const prepost = session !== 'regular';
  const quotesQuery = useQuery({
    queryKey: ['home-quotes', symbols, prepost],
    queryFn: () => fetchHoldingQuotes(symbols, holdings, prepost),
    enabled: isAuthenticated && symbols.length > 0,
    staleTime: session === 'pre-market' ? 90 * 1000 : 3 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
  const quotes = quotesQuery.data;

  const portfolio = useMemo(() => {
    if (!quotes || holdings.length === 0) return null;
    let valueUSD = 0;
    let changeUSD = 0;
    let priced = 0;
    for (const h of holdings) {
      const q = quotes[h.symbol];
      if (!q || !h.quantity) continue;
      const fx = listingToUsd(h.trading_currency, rates.data);
      valueUSD += q.price * h.quantity * fx;
      changeUSD += (q.change ?? 0) * h.quantity * fx;
      priced++;
    }
    if (priced === 0) return null;
    const prevUSD = valueUSD - changeUSD;
    return {
      value: valueUSD * usdRate + cashValue,
      todayChange: changeUSD * usdRate,
      todayPct: prevUSD > 0 ? (changeUSD / prevUSD) * 100 : 0,
    };
  }, [quotes, holdings, rates.data, usdRate, cashValue]);

  const movers = useMemo((): HomeMover[] => {
    if (!quotes) return [];
    const meta = new Map<string, { name: string; logoUrl: string | null; held: boolean }>();
    for (const w of watchlist ?? []) meta.set(w.symbol, { name: w.company_name || w.symbol, logoUrl: null, held: false });
    for (const h of holdings) meta.set(h.symbol, { name: h.company_name || h.symbol, logoUrl: h.logo_url ?? null, held: true });
    return symbols
      .filter((s) => quotes[s] && Number.isFinite(quotes[s].changePercent))
      .map((s) => ({ symbol: s, ...meta.get(s)!, ...quotes[s] }))
      .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
      .slice(0, 5);
  }, [quotes, symbols, holdings, watchlist]);

  return {
    currency,
    /** 1 USD in `currency`, for converting USD-denominated series. */
    usdRate,
    /** 1 unit of a holding's listing currency in USD; quotes arrive in that currency. */
    toUsd: (h: { trading_currency: string | null }) => listingToUsd(h.trading_currency, rates.data),
    session: session as TradingSession,
    holdings,
    symbols,
    hasHoldings: holdings.length > 0,
    hasWatchlist: (watchlist?.length ?? 0) > 0,
    /** Nothing tracked yet: the new-user state. Only true once both lists have loaded. */
    isNew: !holdingsLoading && !watchlistLoading && holdings.length === 0 && (watchlist?.length ?? 0) === 0,
    isLoading: holdingsLoading || watchlistLoading || (symbols.length > 0 && quotesQuery.isLoading),
    pricesFailed: quotesQuery.isError || (!!quotes && symbols.length > 0 && Object.keys(quotes).length === 0),
    portfolio,
    movers,
    /** Raw quotes (USD), keyed by symbol. */
    quotes,
  };
}
