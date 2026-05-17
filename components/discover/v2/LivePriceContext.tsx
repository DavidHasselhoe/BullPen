'use client';

import { createContext, useContext } from 'react';
import type { LivePriceMap } from '@/hooks/use-live-prices';

/**
 * One SSE connection feeds prices to every TickerCard on the discover page.
 * DiscoverClient subscribes once, then publishes the LivePriceMap via this
 * context so each card can read its own symbol without re-subscribing.
 */
export const LivePriceContext = createContext<LivePriceMap>(new Map());

export function useLivePrice(symbol: string) {
  const map = useContext(LivePriceContext);
  return map.get(symbol);
}
