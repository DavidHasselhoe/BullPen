import { NextRequest, NextResponse } from 'next/server';
import { WsManager, type PriceTick } from '@/lib/market-data/ws-manager';
import { getStockQuotes } from '@/lib/twelvedata/twelvedata-client';
import { withRateLimit } from '@/lib/security/api-security';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_SYMBOLS = 600;
const SESSION_TTL_MS = 5 * 60 * 1000;

/**
 * Fetch quotes for any symbols that don't yet have a seeded prevClose in
 * WsManager. Runs fire-and-forget when a new SSE session opens.
 * After the first call per server warm-start, WsManager caches prevClose
 * so subsequent sessions skip the API call entirely.
 */
async function seedInitialPrices(
  symbols: string[],
  safeEnqueue: (chunk: string) => void
): Promise<void> {
  const unseeded = symbols.filter((s) => !WsManager.hasPrevClose(s));
  if (unseeded.length === 0) return;

  try {
    const quotes = await getStockQuotes(unseeded);
    for (const [sym, quote] of quotes.entries()) {
      // StockQuote uses Finnhub-compat fields: c=close, d=change, dp=changePercent, pc=prevClose
      if (!quote || quote.c <= 0) continue;
      const prevClose = quote.pc > 0 ? quote.pc : quote.c;
      WsManager.seedPrevClose(sym, prevClose);
      const tick: PriceTick = {
        symbol: sym,
        price: quote.c,
        change: isFinite(quote.d) ? quote.d : undefined,
        changePercent: isFinite(quote.dp) ? quote.dp : undefined,
        previousClose: prevClose,
      };
      safeEnqueue(`data: ${JSON.stringify(tick)}\n\n`);
    }
  } catch {
    // Non-fatal — WS ticks will provide prices once market opens
  }
}

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

      const safeClose = () => {
        if (closed) return;
        closed = true;
        WsManager.removeListener(listenerId);
        try { controller.close(); } catch { /* already closed */ }
      };

      safeEnqueue(`event: connected\ndata: ${JSON.stringify({ symbols })}\n\n`);

      const listener = {
        id: listenerId,
        symbols: new Set(symbols),
        onTick(tick: PriceTick) {
          safeEnqueue(`data: ${JSON.stringify(tick)}\n\n`);
        },
      };

      WsManager.addListener(listener);
      request.signal.addEventListener('abort', safeClose);
      setTimeout(safeClose, SESSION_TTL_MS);

      // Seed prevClose and emit initial prices in the background so the client
      // sees prices + percentages immediately without waiting for WS ticks.
      void seedInitialPrices(symbols, safeEnqueue);
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
