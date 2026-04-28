/**
 * Market movers — real-time SSE endpoint.
 *
 * All SSE clients share ONE persistent TwelveData WebSocket connection via
 * WsManager (lib/market-data/ws-manager.ts). The manager subscribes to the
 * union of all listener symbol sets and fans price ticks to each client.
 *
 * Venture plan limits:
 *   - 3 WebSocket connections max (we use exactly 1)
 *   - No per-connection symbol limit (1 MB message cap per subscribe call)
 *   - 1 WS credit per subscribed symbol
 */

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/security/api-security';
import { WsManager } from '@/lib/market-data/ws-manager';
import { getStorageLogoUrl } from '@/lib/logos/logos-storage';
import { createServerClient } from '@/lib/supabase/client';
import type { PriceTick } from '@/lib/market-data/ws-manager';
import { SP500_TICKERS } from '@/lib/market-data/sp500';

// Per-client symbol cap for custom ?symbols= requests
const MAX_CLIENT_SYMBOLS = 500;

// Default: full S&P 500 — all stream on the one shared WS connection
const DEFAULT_SYMBOLS = SP500_TICKERS;

// Module-level name cache — populated once from Supabase, reused across SSE connections
const _nameCache = new Map<string, string>();
let _nameCacheReady = false;

async function ensureNameCache(): Promise<Map<string, string>> {
  if (_nameCacheReady) return _nameCache;
  try {
    const supabase = createServerClient();
    const { data } = await supabase.from('companies').select('ticker, name').limit(5000);
    (data ?? []).forEach((c: { ticker: string; name: string }) => _nameCache.set(c.ticker, c.name));
    _nameCacheReady = true;
  } catch {
    // Non-fatal — stream still works, company names just won't appear for stream movers
  }
  return _nameCache;
}

interface MoverUpdate {
  symbol: string;
  name?: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
  logoUrl?: string;
}

/** Avoid ERR_INVALID_STATE when the SSE stream is already closed. */
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

function safeCloseController(controller: ReadableStreamDefaultController): void {
  try {
    controller.close();
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err?.code === 'ERR_INVALID_STATE' || err?.message?.includes('already closed')) return;
    throw e;
  }
}

async function streamHandler(request: NextRequest) {
  if (!process.env.TWELVE_DATA_API_KEY) {
    return NextResponse.json(
      { error: 'WebSocket movers not configured (no TWELVE_DATA_API_KEY)' },
      { status: 503 }
    );
  }

  const symbolsParam = request.nextUrl.searchParams.get('symbols');
  const symbols = symbolsParam
    ? symbolsParam
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
        .slice(0, MAX_CLIENT_SYMBOLS)
    : DEFAULT_SYMBOLS;

  if (symbols.length === 0) {
    return NextResponse.json({ error: 'No symbols provided' }, { status: 400 });
  }

  const nameMap = await ensureNameCache();

  const encoder = new TextEncoder();
  const listenerId = crypto.randomUUID();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const quoteMap = new Map<string, MoverUpdate>();

      const listener = {
        id: listenerId,
        symbols: new Set(symbols),
        onTick(tick: PriceTick) {
          if (closed) return;

          quoteMap.set(tick.symbol, {
            symbol: tick.symbol,
            name: nameMap.get(tick.symbol),
            price: tick.price,
            change: tick.change,
            changePercent: tick.changePercent,
            previousClose: tick.previousClose,
            logoUrl: getStorageLogoUrl(tick.symbol),
          });

          const all = [...quoteMap.values()].filter((m) => !isNaN(m.changePercent));
          const gainers = all
            .filter((m) => m.changePercent > 0)
            .sort((a, b) => b.changePercent - a.changePercent)
            .slice(0, 5);
          const losers = all
            .filter((m) => m.changePercent < 0)
            .sort((a, b) => a.changePercent - b.changePercent)
            .slice(0, 5);

          safeEnqueue(
            controller,
            encoder.encode(`data: ${JSON.stringify({ gainers, losers })}\n\n`),
            () => closed
          );
        },
      };

      // Register with the shared singleton — opens WS if not already open
      WsManager.addListener(listener);

      // Keep-alive ping every 15s so the browser doesn't time out the SSE connection
      const pingInterval = setInterval(() => {
        if (closed) {
          clearInterval(pingInterval);
          return;
        }
        safeEnqueue(controller, encoder.encode(': ping\n\n'), () => closed);
      }, 15_000);

      // Clean up when the browser disconnects
      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(pingInterval);
        WsManager.removeListener(listenerId);
        safeCloseController(controller);
      };

      request.signal.addEventListener('abort', cleanup);

      // Safety valve: close this SSE stream after 4.5 min; browser auto-reconnects.
      // 55s was too aggressive — caused constant WS reconnect noise in logs.
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

/** Rate limited: 30/min to protect TwelveData WebSocket quota */
export const GET = withRateLimit(streamHandler, { windowMs: 60 * 1000, maxRequests: 30 });
