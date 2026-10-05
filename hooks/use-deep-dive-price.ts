'use client';

/**
 * The one current price for a Deep Dive report.
 *
 * Resolve this ONCE per page and pass the result down. Everything on the
 * report that shows a current price (the verdict bar, the analyst price-target
 * range) has to show the same number: two figures for one fact on one screen
 * reads as a bug and costs trust in every other number on the page.
 *
 * Live ticks only for symbols the websocket actually covers
 * (lib/market-data/ws-coverage.ts). For anything else this doesn't subscribe at
 * all, since that stream would never tick, and reports the delayed REST quote
 * with `isLive` false so the caller can label it honestly.
 */

import { useQuery } from '@tanstack/react-query';
import { useStockQuote } from '@/hooks/use-stock-price';
import { useLivePrices } from '@/hooks/use-live-prices';
import { isLivePriceCovered } from '@/lib/market-data/ws-coverage';
import type { ExtendedHoursQuote } from '@/lib/twelvedata/twelvedata-client';

export interface DeepDivePrice {
  price: number | null;
  changePct: number | null;
  /** True only when this figure came off the live websocket feed. */
  isLive: boolean;
  /** Set outside regular hours: the change is then measured from the last close. */
  session: 'pre' | 'post' | null;
}

export function useDeepDivePrice(ticker: string): DeepDivePrice {
  const covered = isLivePriceCovered(ticker);
  const { data: quote } = useStockQuote(ticker);

  // Same key and shape as StockPricePanel's query, which sits on the same
  // page, so this reads its cache instead of making a second request.
  const { data: ext } = useQuery<{ success: boolean; data: ExtendedHoursQuote | null }>({
    queryKey: ['extended-hours', ticker],
    queryFn: async () => (await fetch(`/api/stock/${ticker}/extended-hours`)).json(),
    enabled: !!ticker,
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });
  const session = ext?.data?.pre_or_post ?? null;

  // Empty list means no EventSource at all — useLivePrices closes/skips on an
  // empty symbol key, so an uncovered ticker costs nothing.
  const live = useLivePrices(covered ? [ticker] : []).get(ticker);

  const price = live?.price ?? (session ? ext?.data?.price : undefined) ?? quote?.c ?? null;
  // Before the open, quote.c is the last session's close and quote.pc the one
  // before it. Measuring a pre-market price from pc counted the whole last
  // session as "today" (+1.97% shown beside the price panel's +0.62%).
  const reference = (session ? quote?.c : quote?.pc) ?? 0;

  // Derived from the reference rather than taken from whichever source
  // supplied the price, so the percentage always describes the price beside it.
  const changePct =
    price != null && reference > 0
      ? ((price - reference) / reference) * 100
      : (quote?.dp ?? null);

  return { price, changePct, isLive: live?.price != null, session };
}
