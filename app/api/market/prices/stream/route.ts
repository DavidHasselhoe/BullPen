import { NextRequest, NextResponse } from 'next/server';
import { WsManager, type PriceTick } from '@/lib/market-data/ws-manager';
import { withRateLimit } from '@/lib/security/api-security';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_SYMBOLS = 600;
// Keep SSE open for up to 5 minutes then let the client reconnect
const SESSION_TTL_MS = 5 * 60 * 1000;

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
        try {
          controller.enqueue(enc.encode(chunk));
        } catch {
          // controller already closed
        }
      };

      const safeClose = () => {
        if (closed) return;
        closed = true;
        WsManager.removeListener(listenerId);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      // Send an initial "connected" ping so the client knows the stream is live
      safeEnqueue(`event: connected\ndata: ${JSON.stringify({ symbols })}\n\n`);

      const listener = {
        id: listenerId,
        symbols: new Set(symbols),
        onTick(tick: PriceTick) {
          safeEnqueue(`data: ${JSON.stringify(tick)}\n\n`);
        },
      };

      WsManager.addListener(listener);

      // Clean up when client disconnects
      request.signal.addEventListener('abort', safeClose);

      // Safety valve — reconnect cycle keeps prices fresh
      setTimeout(safeClose, SESSION_TTL_MS);
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

// 60 connections per minute per IP — generous for real-time use
export const GET = withRateLimit(streamHandler, { windowMs: 60_000, maxRequests: 60 });
