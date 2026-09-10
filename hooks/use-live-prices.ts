'use client';

import { useCallback, useSyncExternalStore } from 'react';

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
 * Connections are SHARED. Every caller asking for the same symbol set attaches
 * to one EventSource, ref-counted, and the stream closes once the last of them
 * unmounts. This used to open a fresh EventSource per call site, so a single
 * page could hold several connections to the same endpoint for the same
 * symbol: a deep dive report subscribes for its verdict bar while the price
 * panel inside it subscribes for the chart, and opening the advanced chart
 * over a stock page does the same thing. Each of those is a long-lived
 * serverless invocation, which is exactly the cost this app has already been
 * bitten by.
 *
 * Sharing is keyed on the whole symbol set, not per symbol. Two callers asking
 * for identical sets share; ["NVDA"] and ["NVDA","MSFT"] still get their own
 * streams. Splitting and merging subscriptions per symbol would dedupe those
 * too, at the cost of real bookkeeping, and the overlapping-set case is rare
 * next to the identical-set one this fixes.
 *
 * Reconnect strategy: a released channel is held open for a grace period
 * before closing, so a symbol change or a remount hands over without a gap in
 * ticks, and a re-subscribe inside that window reuses the warm stream.
 */

/** How long a channel with no listeners stays open before closing. */
const RELEASE_GRACE_MS = 250;

interface Channel {
  es: EventSource;
  /** Latest tick per symbol, so a late joiner isn't blank until the next one. */
  prices: LivePriceMap;
  listeners: Set<() => void>;
  closeTimer: ReturnType<typeof setTimeout> | null;
}

const channels = new Map<string, Channel>();

/** Stable identity so an unsubscribed caller doesn't re-render on every pass. */
const EMPTY: LivePriceMap = new Map();

function acquire(key: string, listener: () => void): Channel {
  const existing = channels.get(key);
  if (existing) {
    // Someone wants it again inside the grace window: keep the warm stream.
    if (existing.closeTimer) {
      clearTimeout(existing.closeTimer);
      existing.closeTimer = null;
    }
    existing.listeners.add(listener);
    return existing;
  }

  const es = new EventSource(`/api/market/prices/stream?symbols=${encodeURIComponent(key)}`);
  const channel: Channel = { es, prices: new Map(), listeners: new Set([listener]), closeTimer: null };

  es.onmessage = (e) => {
    try {
      const tick = JSON.parse(e.data) as LivePrice;
      if (!tick?.symbol) return;
      // New Map per tick. useSyncExternalStore compares snapshots by identity,
      // so mutating in place would never re-render.
      channel.prices = new Map(channel.prices).set(tick.symbol, tick);
      for (const l of channel.listeners) l();
    } catch {
      // ignore malformed frames
    }
  };

  // The browser reconnects an errored EventSource on its own.
  es.onerror = () => {};

  channels.set(key, channel);
  return channel;
}

function release(key: string, listener: () => void): void {
  const channel = channels.get(key);
  if (!channel) return;

  channel.listeners.delete(listener);
  if (channel.listeners.size > 0) return;

  channel.closeTimer = setTimeout(() => {
    // Re-check: a new subscriber may have arrived during the grace window.
    if (channel.listeners.size === 0) {
      channel.es.close();
      channels.delete(key);
    }
  }, RELEASE_GRACE_MS);
}

/**
 * useSyncExternalStore rather than useState plus an effect: the channel map IS
 * an external store, and this is the primitive built for reading one. It also
 * avoids the cascading render that calling setState in an effect body causes,
 * and gives a late joiner the channel's current prices on its very first
 * render instead of leaving it blank until the next tick.
 */
export function useLivePrices(symbols: string[]): LivePriceMap {
  // Stable key — avoids resubscribing on every render.
  const symbolsKey = [...symbols].sort().join(',');

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!symbolsKey) return () => {};
      acquire(symbolsKey, onStoreChange);
      return () => release(symbolsKey, onStoreChange);
    },
    [symbolsKey]
  );

  // Must return a stable reference between ticks or this re-renders forever:
  // channel.prices is only reassigned when a tick lands, and EMPTY is a
  // module-level constant.
  const getSnapshot = useCallback(
    () => (symbolsKey ? channels.get(symbolsKey)?.prices ?? EMPTY : EMPTY),
    [symbolsKey]
  );

  // The server has no channels, and no ticks to report.
  const getServerSnapshot = useCallback(() => EMPTY, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
