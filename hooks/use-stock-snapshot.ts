/**
 * useStockSnapshot — fires ONE batch request (/api/stock/[ticker]/snapshot)
 * that hits TwelveData /batch for quote + statistics + earnings in a single
 * round-trip, then seeds each component's individual query cache so they
 * render immediately without making their own API calls. The earnings in the
 * response are not seeded: the earnings card has its own route, and the server
 * fetches them to fill the cache the watchlist and Deep Dive read.
 */

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { StockQuote } from '@/lib/finnhub/finnhub-client';
import type { CompanyStatistics } from '@/lib/twelvedata/twelvedata-client';

interface SnapshotResponse {
  success: boolean;
  symbol: string;
  quote: {
    price: number; change: number; changePercent: number;
    high: number; low: number; open: number; previousClose: number;
  } | null;
  /** True only when Twelve Data positively confirmed this symbol doesn't exist. */
  quoteConfirmedInvalid?: boolean;
  statistics: CompanyStatistics | null;
  statsFetchedAt: string | null;
  instrumentType: string | null;
}

export function useStockSnapshot(ticker: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery<SnapshotResponse>({
    queryKey: ['stock-snapshot', ticker],
    queryFn: async () => {
      const res = await fetch(`/api/stock/${ticker}/snapshot`);
      return res.json();
    },
    enabled: !!ticker,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Seed individual component caches so they skip their own requests
  useEffect(() => {
    if (!query.data?.success || !ticker) return;
    const { quote, statistics, statsFetchedAt } = query.data;

    // StockQuoteCard — useStockQuote uses ['stock-quote', ticker]
    if (quote) {
      const mapped: StockQuote = {
        c: quote.price,
        d: quote.change,
        dp: quote.changePercent,
        h: quote.high,
        l: quote.low,
        o: quote.open,
        pc: quote.previousClose,
        t: Math.floor(Date.now() / 1000),
      };
      queryClient.setQueryData<StockQuote>(['stock-quote', ticker], (old) => old ?? mapped);
    }

    // StatisticsGrid — uses ['stock-statistics', ticker]
    if (statistics) {
      queryClient.setQueryData(
        ['stock-statistics', ticker],
        (old: unknown) => old ?? { success: true, stats: statistics, fetchedAt: statsFetchedAt }
      );
    }

  }, [query.data, ticker, queryClient]);

  return query;
}
