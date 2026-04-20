'use client';

import { useEffect, useRef, useState } from 'react';

export interface LivePrice {
  symbol: string;
  price: number;
  change?: number;
  changePercent?: number;
  previousClose: number;
  dayVolume?: number;
}

export type LivePriceMap = Map<string, LivePrice>;

/**
 * Subscribe to real-time price ticks for a list of symbols via SSE backed by
 * the TwelveData WebSocket singleton (WsManager).
 *
 * Returns a Map<symbol, LivePrice> that updates in-place on every tick.
 * The hook re-subscribes automatically when the symbol list changes.
 */
export function useLivePrices(symbols: string[]): LivePriceMap {
  const [prices, setPrices] = useState<LivePriceMap>(new Map());
  const esRef = useRef<EventSource | null>(null);
  // Stable key — avoids reconnect on every render
  const symbolsKey = [...symbols].sort().join(',');

  useEffect(() => {
    if (!symbolsKey) return;

    // Close any previous connection
    esRef.current?.close();

    const url = `/api/market/prices/stream?symbols=${encodeURIComponent(symbolsKey)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const tick = JSON.parse(e.data) as LivePrice;
        if (!tick?.symbol) return;
        setPrices((prev) => {
          const next = new Map(prev);
          next.set(tick.symbol, tick);
          return next;
        });
      } catch {
        // ignore malformed frames
      }
    };

    // Browser auto-reconnects on error; nothing extra needed here
    es.onerror = () => {};

    return () => {
      es.close();
      esRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey]);

  return prices;
}
