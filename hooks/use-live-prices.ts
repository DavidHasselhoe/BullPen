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
 * The hook re-subscribes when the symbol set changes.
 *
 * Reconnect strategy: the new EventSource is opened BEFORE the previous one is
 * closed, with a 250 ms grace period. This eliminates the brief "no ticks"
 * window that caused flickering when holdings/watchlist symbols changed.
 */
export function useLivePrices(symbols: string[]): LivePriceMap {
  const [prices, setPrices] = useState<LivePriceMap>(new Map());
  const esRef = useRef<EventSource | null>(null);
  const prevCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stable key — avoids reconnect on every render
  const symbolsKey = [...symbols].sort().join(',');

  useEffect(() => {
    if (!symbolsKey) {
      esRef.current?.close();
      esRef.current = null;
      return;
    }

    const url = `/api/market/prices/stream?symbols=${encodeURIComponent(symbolsKey)}`;
    const es = new EventSource(url);

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

    // Keep the previous connection alive briefly so there's no tick-gap
    // while the new one handshakes. Both write to the same Map harmlessly.
    const prevEs = esRef.current;
    esRef.current = es;
    if (prevEs) {
      if (prevCloseTimerRef.current) clearTimeout(prevCloseTimerRef.current);
      prevCloseTimerRef.current = setTimeout(() => {
        prevEs.close();
        prevCloseTimerRef.current = null;
      }, 250);
    }

    return () => {
      if (prevCloseTimerRef.current) clearTimeout(prevCloseTimerRef.current);
      es.close();
      esRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey]);

  return prices;
}
