import { NextRequest, NextResponse } from 'next/server';
import { WsManager, type PriceTick } from '@/lib/market-data/ws-manager';
import { seedPrices } from '@/lib/market-data/seed-prices';
import { withRateLimit } from '@/lib/security/api-security';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Without this, an unset maxDuration let Vercel kill the function at 60s,
// forcing constant client reconnects.
export const maxDuration = 300;

const MAX_SYMBOLS = 600;
// Deliberately under maxDuration. At exactly 300s the platform's kill won the
// race against this self-close every time, logging "Task timed out after 300
// seconds" per session (228 in production). Closing first ends the response
// cleanly and EventSource reconnects on its own.
const SESSION_TTL_MS = 290 * 1000;
const TICK_FLUSH_MS = 1000;

async function streamHandler(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const symbolsParam = sp.get('symbols') ?? '';
  const symbols = symbolsParam
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, MAX_SYMBOLS);

  if (symbols.length === 0) {
    return NextResponse.json({ error: 'symbols parameter required' }, { status: 400 });
  }

  const listenerId = crypto.randomUUID();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const enc = new TextEncoder();

      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try { controller.enqueue(enc.encode(chunk)); } catch { /* already closed */ }
      };

      // Liquid names tick several times a second and every tick used to go
      // straight out. The client only publishes every 100ms anyway, so keep the
      // latest tick per symbol and flush once a second, skipping symbols whose
      // price and volume haven't moved since the last one sent. Bytes sent
      // here bill as Vercel Fast Origin Transfer.
      const pending = new Map<string, PriceTick>();
      const lastSent = new Map<string, string>();
      const flush = () => {
        for (const tick of pending.values()) {
          // change/previousClose included: a tick that first gains its previous
          // close at an unchanged price must still go out, or the % stays blank.
          const sig = `${tick.price}|${tick.dayVolume ?? ''}|${tick.changePercent ?? ''}|${tick.previousClose}`;
          if (lastSent.get(tick.symbol) === sig) continue;
          lastSent.set(tick.symbol, sig);
          safeEnqueue(`data: ${JSON.stringify(tick)}\n\n`);
        }
        pending.clear();
      };
      const flushInterval = setInterval(flush, TICK_FLUSH_MS);

      const safeClose = () => {
        if (closed) return;
        closed = true;
        clearInterval(flushInterval);
        WsManager.removeListener(listenerId);
        try { controller.close(); } catch { /* already closed */ }
      };

      safeEnqueue(`event: connected\ndata: ${JSON.stringify({ symbols })}\n\n`);

      const listener = {
        id: listenerId,
        symbols: new Set(symbols),
        onTick(tick: PriceTick) {
          pending.set(tick.symbol, tick);
        },
      };

      WsManager.addListener(listener);
      request.signal.addEventListener('abort', safeClose);
      setTimeout(safeClose, SESSION_TTL_MS);

      // Seed prevClose and emit initial prices in the background so the client
      // sees prices + percentages immediately without waiting for WS ticks.
      void seedPrices(symbols, (symbol, quote) => {
        safeEnqueue(`data: ${JSON.stringify({ symbol, ...quote } satisfies PriceTick)}\n\n`);
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    },
  });
}

export const GET = withRateLimit(streamHandler, { windowMs: 60_000, maxRequests: 60 });
