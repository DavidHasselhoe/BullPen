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
import { getLogoManifest, logoUrlFromManifest, type LogoManifest } from '@/lib/logos/logo-manifest';
import { createServerClient } from '@/lib/supabase/client';
import type { PriceTick } from '@/lib/market-data/ws-manager';
import { SP500_TICKERS } from '@/lib/market-data/sp500';
import { getMarketMovers } from '@/lib/twelvedata/twelvedata-client';

// Matches the 4.5-min self-close below — without this, an unset maxDuration
// was letting Vercel kill the function before that self-close ran, forcing
// constant client reconnects (see the repeated "Task timed out after 60
// seconds" errors on this route in production).
export const maxDuration = 300;

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
  dayVolume: number;
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

  // Seed WsManager prevClose, company names, and initial quote snapshot before
  // the WebSocket starts receiving ticks. This ensures:
  //   1. parseTick can compute day change from the very first WS event
  //   2. The stream sends company names so clients don't need a separate batch fetch
  //   3. quoteMap is pre-populated, preventing the sparse-list flash on reconnect
  // getMarketMovers is cached (5 min), so this is nearly free on warm requests.
  const seedNameMap = new Map<string, string>();
  const initialQuotes = new Map<string, MoverUpdate>();
  // Fetched once per connection (memoized/cached, see logo-manifest.ts) and
  // closed over below — onTick fires many times per second per symbol, so it
  // must stay synchronous rather than awaiting the manifest per tick.
  let logoManifest: LogoManifest = new Map();
  try {
    const [{ gainers: seedGainers, losers: seedLosers }, manifest] = await Promise.all([
      getMarketMovers('stocks', 50),
      getLogoManifest(),
    ]);
    logoManifest = manifest;
    for (const m of [...seedGainers, ...seedLosers]) {
      WsManager.seedPrevClose(m.symbol, m.previousClose);
      if (m.name) seedNameMap.set(m.symbol, m.name);
      initialQuotes.set(m.symbol, {
        symbol: m.symbol,
        name: m.name,
        price: m.price,
        change: m.change,
        changePercent: m.changePercent,
        previousClose: m.previousClose,
        dayVolume: 0,
        logoUrl: logoUrlFromManifest(logoManifest, m.symbol) ?? undefined,
      });
    }
  } catch {
    // Non-critical — stream degrades gracefully, REST fallback still works
  }

  if (symbols.length === 0) {
    return NextResponse.json({ error: 'No symbols provided' }, { status: 400 });
  }

  const nameMap = await ensureNameCache();

  const encoder = new TextEncoder();
  const listenerId = crypto.randomUUID();

  // Minimum interval between SSE emissions (5 s).
  // WebSocket ticks can arrive many times per second; throttling prevents rapid
  // re-renders on the client and reduces CPU usage for sorting large quote maps.
  const EMIT_INTERVAL_MS = 5_000;

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      // Pre-seed with REST snapshot so the first real WS tick produces full lists
      const quoteMap = new Map<string, MoverUpdate>(initialQuotes);
      let lastEmitAt = 0;

      const weight = (m: MoverUpdate) =>
        Math.abs(m.changePercent) * (m.dayVolume > 0 ? m.price * m.dayVolume : 1);

      function emitSnapshot() {
        if (closed) return;
        const all = [...quoteMap.values()].filter((m) => !isNaN(m.changePercent));
        const gainers = all
          .filter((m) => m.changePercent > 0)
          .sort((a, b) => weight(b) - weight(a))
          .slice(0, 5);
        const losers = all
          .filter((m) => m.changePercent < 0)
          .sort((a, b) => weight(b) - weight(a))
          .slice(0, 5);
        // Only emit when both lists are populated to prevent sparse-list flash
        if (gainers.length === 0 || losers.length === 0) return;
        safeEnqueue(
          controller,
          encoder.encode(`data: ${JSON.stringify({ gainers, losers })}\n\n`),
          () => closed
        );
      }

      const listener = {
        id: listenerId,
        symbols: new Set(symbols),
        onTick(tick: PriceTick) {
          if (closed) return;
          if (tick.change == null || tick.changePercent == null) return;

          quoteMap.set(tick.symbol, {
            symbol: tick.symbol,
            name: nameMap.get(tick.symbol),
            price: tick.price,
            change: tick.change,
            changePercent: tick.changePercent,
            previousClose: tick.previousClose,
            dayVolume: tick.dayVolume ?? 0,
            logoUrl: logoUrlFromManifest(logoManifest, tick.symbol) ?? undefined,
          });

          // Throttle: emit at most once per EMIT_INTERVAL_MS (leading — first tick
          // fires immediately so the client gets a quick initial update, subsequent
          // ticks are rate-limited so the UI doesn't flash on every price change).
          const now = Date.now();
          if (now - lastEmitAt < EMIT_INTERVAL_MS) return;
          lastEmitAt = now;
          emitSnapshot();
        },
      };

      // Register with the shared singleton — opens WS if not already open
      WsManager.addListener(listener);

      // Emit the REST-seeded snapshot immediately rather than waiting for the
      // first WS tick. onTick only fires on real trade activity, so during a
      // quiet stretch (overnight, or the first minutes of a session most
      // symbols haven't traded yet) a client could go long past this stream's
      // own 4.5-min reconnect cycle without ever receiving an update — stuck
      // showing the previous session's movers until the page was manually
      // reloaded (which resets client state and re-triggers the REST
      // fallback). initialQuotes was just re-fetched with the CURRENT
      // session's prepost flag above, so this snapshot is already
      // session-correct on every reconnect, tick or no tick.
      lastEmitAt = Date.now();
      emitSnapshot();

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
