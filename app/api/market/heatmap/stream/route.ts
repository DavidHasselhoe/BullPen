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
import { SP500_TICKERS } from '@/lib/market-data/sp500';
import { getStockQuotes } from '@/lib/twelvedata/twelvedata-client';

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

  // Seed with a REST snapshot for initial prices. We batch in groups of 20
  // to stay within TwelveData request limits; do this async so the SSE
  // connection opens immediately.
  const priceMap = new Map<string, HeatmapPriceEntry>();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let lastEmitAt = 0;

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
      }

      // Pre-seed prevClose + initial price map via REST so the first WS ticks
      // can compute day change and tiles immediately show prices.
      const BATCH_SIZE = 20;
      const seedBatches: string[][] = [];
      for (let i = 0; i < SP500_TICKERS.length; i += BATCH_SIZE) {
        seedBatches.push(SP500_TICKERS.slice(i, i + BATCH_SIZE));
      }

      // Fire batches in parallel (TwelveData Venture plan allows this)
      try {
        const session = getCurrentSession();
        const usePrepost = session === 'pre' || session === 'post';
        const batchResults = await Promise.allSettled(
          seedBatches.map((batch) => getStockQuotes(batch, { prepost: usePrepost }))
        );
        for (const result of batchResults) {
          if (result.status !== 'fulfilled') continue;
          for (const [sym, q] of result.value.entries()) {
            if (!q || q.c <= 0) continue;
            WsManager.seedPrevClose(sym, q.pc);
            priceMap.set(sym, {
              price: q.c,
              change: q.d ?? 0,
              changePercent: q.dp ?? 0,
              previousClose: q.pc,
              ...(q.volume ? { volume: q.volume } : {}),
            });
          }
        }
        // Emit initial snapshot immediately so the client renders on connect
        emitPrices();
        lastEmitAt = Date.now();
      } catch {
        // Non-fatal — stream still works from WS ticks alone
      }

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
          lastEmitAt = now;
          emitPrices();
        },
      };

      WsManager.addListener(listener);

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
