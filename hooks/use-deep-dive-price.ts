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

import { useStockQuote } from '@/hooks/use-stock-price';
import { useLivePrices } from '@/hooks/use-live-prices';
import { isLivePriceCovered } from '@/lib/market-data/ws-coverage';

export interface DeepDivePrice {
  price: number | null;
  changePct: number | null;
  /** True only when this figure came off the live websocket feed. */
  isLive: boolean;
}

export function useDeepDivePrice(ticker: string): DeepDivePrice {
  const covered = isLivePriceCovered(ticker);
  const { data: quote } = useStockQuote(ticker);

  // Empty list means no EventSource at all — useLivePrices closes/skips on an
  // empty symbol key, so an uncovered ticker costs nothing.
  const live = useLivePrices(covered ? [ticker] : []).get(ticker);

  const prevClose = quote?.pc ?? 0;
  const price = live?.price ?? quote?.c ?? null;

  // Derived from prevClose rather than taken from whichever source supplied the
  // price, so the percentage can never describe a different price than the one
  // rendered beside it.
  const changePct =
    price != null && prevClose > 0
      ? ((price - prevClose) / prevClose) * 100
      : (quote?.dp ?? null);

  return { price, changePct, isLive: live?.price != null };
}
