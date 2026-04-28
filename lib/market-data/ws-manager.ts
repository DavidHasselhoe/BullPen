/**
 * WsManager — global singleton that maintains ONE persistent TwelveData WebSocket
 * connection and fans price ticks out to all registered SSE listeners.
 *
 * TwelveData Venture plan allows:
 *   - 3 connections max across all environments (prod / stage / local)
 *   - No per-connection symbol limit (1 MB message cap per subscribe call)
 *   - 1 WS credit per subscribed symbol
 *
 * By keeping a single shared connection we never hit the 3-connection ceiling,
 * and subscribing to 500 symbols costs the same 1 round-trip as subscribing to 1.
 *
 * The instance lives in `globalThis` so it survives across warm Vercel invocations
 * on the same process / Node.js instance.
 */

import WebSocket from 'ws';

const WS_URL = 'wss://ws.twelvedata.com/v1/quotes/price';

// Heartbeat interval recommended by TwelveData docs to keep connection stable
const HEARTBEAT_MS = 10_000;
// Reconnect delay on unexpected close
const RECONNECT_DELAY_MS = 3_000;

export interface PriceTick {
  symbol: string;
  price: number;
  change?: number;
  changePercent?: number;
  previousClose: number;
  dayVolume?: number;
}

export interface WsListener {
  id: string;
  symbols: Set<string>;
  onTick: (tick: PriceTick) => void;
}

interface TwelveDataPriceEvent {
  event?: string;
  symbol?: string;
  price?: number;
  day_volume?: number;
  /** Legacy fields still sent by some instruments */
  close?: string;
  change?: string;
  percent_change?: string;
  previous_close?: string;
}

// ---- singleton state (survives warm restarts) ----

interface ManagerState {
  ws: WebSocket | null;
  listeners: Map<string, WsListener>;
  /** Current set of symbols the WS is subscribed to */
  subscribed: Set<string>;
  /** Previous-close map used to compute change when not provided */
  prevClose: Map<string, number>;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  destroyed: boolean;
}

declare global {
  // eslint-disable-next-line no-var
  var __wsManagerState: ManagerState | undefined;
}

function getState(): ManagerState {
  if (!global.__wsManagerState) {
    global.__wsManagerState = {
      ws: null,
      listeners: new Map(),
      subscribed: new Set(),
      prevClose: new Map(),
      heartbeatTimer: null,
      reconnectTimer: null,
      destroyed: false,
    };
  }
  return global.__wsManagerState;
}

// ---- helpers ----

function getApiKey(): string {
  const k = process.env.TWELVE_DATA_API_KEY;
  if (!k) throw new Error('TWELVE_DATA_API_KEY not set');
  return k;
}

function parseTick(raw: TwelveDataPriceEvent, state: ManagerState): PriceTick | null {
  if (!raw.symbol) return null;

  // Accept both `event:"price"` format and legacy close-field format
  const priceRaw = raw.price != null ? raw.price : parseFloat(raw.close ?? '');
  if (!priceRaw || isNaN(priceRaw) || priceRaw <= 0) return null;

  let pc = parseFloat(raw.previous_close ?? '');
  let hasPrevClose = pc > 0;
  if (!hasPrevClose) {
    const cached = state.prevClose.get(raw.symbol);
    if (cached != null && cached > 0) {
      pc = cached;
      hasPrevClose = true;
    } else {
      pc = priceRaw;
    }
  } else {
    state.prevClose.set(raw.symbol, pc);
  }

  const change =
    raw.change != null
      ? parseFloat(raw.change as string)
      : hasPrevClose
        ? priceRaw - pc
        : undefined;

  const pct =
    raw.percent_change != null
      ? parseFloat(raw.percent_change as string)
      : hasPrevClose && pc > 0
        ? ((priceRaw - pc) / pc) * 100
        : undefined;

  return {
    symbol: raw.symbol,
    price: priceRaw,
    change,
    changePercent: pct,
    previousClose: hasPrevClose ? pc : 0,
    dayVolume: raw.day_volume,
  };
}

function send(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function computeWantedSymbols(state: ManagerState): Set<string> {
  const all = new Set<string>();
  for (const listener of state.listeners.values()) {
    for (const sym of listener.symbols) all.add(sym);
  }
  return all;
}

function syncSubscriptions(state: ManagerState): void {
  const ws = state.ws;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  const wanted = computeWantedSymbols(state);

  // New symbols to subscribe
  const toAdd = [...wanted].filter((s) => !state.subscribed.has(s));
  if (toAdd.length > 0) {
    send(ws, { action: 'subscribe', params: { symbols: toAdd.join(',') } });
    for (const s of toAdd) state.subscribed.add(s);
  }

  // Symbols to drop
  const toDrop = [...state.subscribed].filter((s) => !wanted.has(s));
  if (toDrop.length > 0) {
    send(ws, { action: 'unsubscribe', params: { symbols: toDrop.join(',') } });
    for (const s of toDrop) state.subscribed.delete(s);
  }
}

// ---- connection management ----

function connect(state: ManagerState): void {
  if (state.destroyed) return;

  let apiKey: string;
  try {
    apiKey = getApiKey();
  } catch {
    console.error('[WsManager] Cannot connect — TWELVE_DATA_API_KEY not set');
    return;
  }

  const ws = new WebSocket(`${WS_URL}?apikey=${encodeURIComponent(apiKey)}`);
  state.ws = ws;

  ws.on('open', () => {
    console.log('[WsManager] Connected to TwelveData WebSocket');

    // Subscribe to all currently-wanted symbols
    const wanted = computeWantedSymbols(state);
    if (wanted.size > 0) {
      send(ws, { action: 'subscribe', params: { symbols: [...wanted].join(',') } });
      state.subscribed = new Set(wanted);
    }

    // Heartbeat — TwelveData docs recommend every ~10s
    if (state.heartbeatTimer) clearInterval(state.heartbeatTimer);
    state.heartbeatTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        send(ws, { action: 'heartbeat' });
      }
    }, HEARTBEAT_MS);
  });

  ws.on('message', (data: Buffer | string) => {
    try {
      const raw = JSON.parse(typeof data === 'string' ? data : data.toString('utf8')) as TwelveDataPriceEvent;
      // Only forward actual price events
      if (!raw.symbol || raw.event === 'subscribe-status' || raw.event === 'unsubscribe-status') return;

      const tick = parseTick(raw, state);
      if (!tick) return;

      // Fan out to every listener that requested this symbol
      for (const listener of state.listeners.values()) {
        if (listener.symbols.has(tick.symbol)) {
          try {
            listener.onTick(tick);
          } catch {
            // Listener may have closed — harmless
          }
        }
      }
    } catch {
      // Ignore malformed frames
    }
  });

  ws.on('error', (err) => {
    console.error('[WsManager] WebSocket error', err);
  });

  ws.on('close', (code, reason) => {
    console.warn(`[WsManager] Connection closed (${code} ${reason.toString()})`);
    if (state.heartbeatTimer) {
      clearInterval(state.heartbeatTimer);
      state.heartbeatTimer = null;
    }
    state.ws = null;
    state.subscribed.clear();

    // Reconnect if there are still listeners
    if (!state.destroyed && state.listeners.size > 0) {
      console.log(`[WsManager] Reconnecting in ${RECONNECT_DELAY_MS}ms…`);
      state.reconnectTimer = setTimeout(() => connect(state), RECONNECT_DELAY_MS);
    }
  });
}

function ensureConnected(state: ManagerState): void {
  if (
    state.ws &&
    (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
  connect(state);
}

// ---- public API ----

export const WsManager = {
  /**
   * Register an SSE listener. The manager opens (or reuses) the shared WS
   * connection and subscribes to the listener's symbols.
   */
  addListener(listener: WsListener): void {
    const state = getState();
    state.listeners.set(listener.id, listener);
    ensureConnected(state);
    syncSubscriptions(state);
  },

  /**
   * Deregister a listener. Unsubscribes any symbols no longer needed by other listeners.
   * Closes the WS connection when the last listener leaves.
   */
  removeListener(id: string): void {
    const state = getState();
    state.listeners.delete(id);

    if (state.listeners.size === 0) {
      // No more clients — close cleanly
      if (state.heartbeatTimer) {
        clearInterval(state.heartbeatTimer);
        state.heartbeatTimer = null;
      }
      if (state.reconnectTimer) {
        clearTimeout(state.reconnectTimer);
        state.reconnectTimer = null;
      }
      state.ws?.close();
      state.ws = null;
      state.subscribed.clear();
    } else {
      // Unsubscribe symbols no longer needed
      syncSubscriptions(state);
    }
  },

  /** Current number of registered SSE listeners (useful for debugging). */
  get listenerCount(): number {
    return getState().listeners.size;
  },

  /** Current number of subscribed symbols. */
  get subscribedCount(): number {
    return getState().subscribed.size;
  },

  /**
   * Seed a previous-close price so parseTick can compute change/changePercent
   * on the first WebSocket tick for this symbol (TwelveData WS never sends prevClose).
   * Only sets the value if one isn't already cached.
   */
  seedPrevClose(symbol: string, prevClose: number): void {
    if (prevClose > 0) {
      const state = getState();
      if (!state.prevClose.has(symbol)) {
        state.prevClose.set(symbol, prevClose);
      }
    }
  },
};
