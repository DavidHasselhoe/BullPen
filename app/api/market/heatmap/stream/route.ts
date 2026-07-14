/**
 * S&P 500 Heatmap — real-time SSE price stream.
 *
 * Shares the global WsManager WebSocket connection with movers/stream.
 * Emits a full price map for all ~505 S&P 500 tickers every 5s.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/security/api-security';
import { WsManager } from '@/lib/market-data/ws-manager';
import type { PriceTick } from '@/lib/market-data/ws-manager';
import { seedPrices } from '@/lib/market-data/seed-prices';
import { SP500_TICKERS } from '@/lib/market-data/sp500';

export type Session = 'pre' | 'regular' | 'post' | 'closed';

export interface HeatmapPriceEntry {
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
  volume?: number;
}

function getCurrentSession(): Session {
  const etStr = new Date().toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
  });
  const [h, m] = etStr.split(':').map(Number);
  const etMins = h * 60 + m;
  const day = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })
  ).getDay();

  if (day === 0 || day === 6) return 'closed';
  if (etMins >= 240 && etMins < 570) return 'pre';   // 04:00–09:30
  if (etMins >= 570 && etMins < 960) return 'regular'; // 09:30–16:00
  if (etMins >= 960 && etMins < 1200) return 'post';  // 16:00–20:00
  return 'closed';
}

function safeEnqueue(
  controller: ReadableStreamDefaultController,
  chunk: Uint8Array,
  isClosed: () => boolean
): void {
  if (isClosed()) return;
  try {
    controller.enqueue(chunk);
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err?.code === 'ERR_INVALID_STATE' || err?.message?.includes('already closed')) return;
    throw e;
  }
}

async function streamHandler(request: NextRequest) {
  if (!process.env.TWELVE_DATA_API_KEY) {
    return NextResponse.json(
      { error: 'Heatmap stream not configured (no TWELVE_DATA_API_KEY)' },
      { status: 503 }
    );
  }

  const encoder = new TextEncoder();
  const listenerId = crypto.randomUUID();
  const EMIT_INTERVAL_MS = 5_000;

  const priceMap = new Map<string, HeatmapPriceEntry>();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let lastEmitAt = 0;
      let flushScheduled = false;

      function emitPrices() {
        if (closed || priceMap.size === 0) return;
        const session = getCurrentSession();
        safeEnqueue(
          controller,
          encoder.encode(
            `data: ${JSON.stringify({ prices: Object.fromEntries(priceMap), session, ts: Date.now() })}\n\n`
          ),
          () => closed
        );
        lastEmitAt = Date.now();
      }

      // Coalesces synchronous onSeed calls within the same resolved chunk into
      // a single emit, while still letting each chunk (or Redis-cache batch)
      // flush the moment IT lands — instead of blocking every symbol on the
      // single slowest chunk like a single Promise.allSettled(...) would.
      function scheduleFlush() {
        if (flushScheduled) return;
        flushScheduled = true;
        queueMicrotask(() => {
          flushScheduled = false;
          emitPrices();
        });
      }

      // Register the WS listener FIRST so live ticks aren't dropped while the
      // REST seed (below) is still in flight — a tick for a symbol can arrive
      // and populate the board before its own REST seed chunk even resolves.
      const listener = {
        id: listenerId,
        symbols: new Set(SP500_TICKERS),
        onTick(tick: PriceTick) {
          if (closed) return;
          if (tick.change == null || tick.changePercent == null) return;

          // Preserve existing volume when this tick doesn't carry day_volume —
          // TwelveData only includes day_volume periodically, not on every tick.
          const prevVolume = priceMap.get(tick.symbol)?.volume;
          priceMap.set(tick.symbol, {
            price: tick.price,
            change: tick.change,
            changePercent: tick.changePercent,
            previousClose: tick.previousClose,
            volume: tick.dayVolume ?? prevVolume,
          });

          const now = Date.now();
          if (now - lastEmitAt < EMIT_INTERVAL_MS) return;
          emitPrices();
        },
      };

      WsManager.addListener(listener);

      // Seed initial prices in the background (WsManager/Redis first, TwelveData
      // for the remainder) — each symbol/chunk flushes to the client as soon as
      // it resolves rather than waiting for every symbol to be ready.
      void seedPrices(SP500_TICKERS, (sym, q) => {
        if (closed) return;
        priceMap.set(sym, {
          price: q.price,
          change: q.change ?? 0,
          changePercent: q.changePercent ?? 0,
          previousClose: q.previousClose,
          ...(q.volume ? { volume: q.volume } : {}),
        });
        scheduleFlush();
      });

      // Keep-alive ping every 15s
      const pingInterval = setInterval(() => {
        if (closed) {
          clearInterval(pingInterval);
          return;
        }
        safeEnqueue(controller, encoder.encode(': ping\n\n'), () => closed);
      }, 15_000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(pingInterval);
        WsManager.removeListener(listenerId);
        try { controller.close(); } catch { /* already closed */ }
      };

      request.signal.addEventListener('abort', cleanup);
      // 4.5-min TTL; browser auto-reconnects
      setTimeout(cleanup, 4.5 * 60 * 1000);
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

export const GET = withRateLimit(streamHandler, { windowMs: 60_000, maxRequests: 20 });
