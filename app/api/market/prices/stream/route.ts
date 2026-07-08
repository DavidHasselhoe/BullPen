import { NextRequest, NextResponse } from 'next/server';
import { WsManager, type PriceTick } from '@/lib/market-data/ws-manager';
import { getStockQuotes, isExtendedHoursET } from '@/lib/twelvedata/twelvedata-client';
import { withRateLimit } from '@/lib/security/api-security';
import { rget, rset } from '@/lib/cache/redis-cache';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_SYMBOLS = 600;
const SESSION_TTL_MS = 5 * 60 * 1000;

// TwelveData /batch caps at ~120 requests per call. Discover sends ~200 symbols
// in one go, which silently failed the whole batch and left every card showing
// a price skeleton (especially obvious when markets are closed and WS ticks
// can't fill the gap). Chunk to stay well under the limit.
const SEED_CHUNK = 100;

// Cached quote shape — only the fields needed to seed WsManager + emit a tick.
interface SeedQuote { c: number; d: number; dp: number; pc: number }

// 15 s: long enough for multiple cold-start instances to share the batch result,
// short enough that prices don't feel stale on the first render.
const SEED_TTL = 15;

function seedKey(sym: string) { return `seed:${sym}`; }

// previousClose is constant for the whole ET trading day (it only changes at the
// close), so we cache it separately with a TTL that expires at the next ET
// midnight. This lets a cold-start instance pre-seed WsManager's prevClose
// instantly from Redis — so the FIRST websocket tick computes changePercent
// correctly instead of emitting undefined/0% while the REST seed is in flight
// (or if it fails). The value can't go stale within a session, so this is safe.
function pcKey(sym: string) { return `pc:${sym}`; }

function secondsToEtMidnight(): number {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const next = new Date(et);
  next.setHours(24, 0, 0, 0);
  return Math.max(60, Math.round((next.getTime() - et.getTime()) / 1000));
}

/**
 * Seed WsManager with initial prices for any symbols it hasn't seen yet.
 *
 * Flow (two-level dedup):
 *   1. WsManager.hasPrevClose — in-process; zero cost on warm instances.
 *   2. Redis per-symbol cache — shared across serverless instances; avoids
 *      re-fetching on cold starts when another instance already paid the cost.
 *   3. TwelveData batch fetch — only for the true remainder.
 *
 * Each chunk's failure is isolated — one bad chunk won't blank the others.
 */
async function seedInitialPrices(
  symbols: string[],
  safeEnqueue: (chunk: string) => void
): Promise<void> {
  // Level 1: skip anything WsManager already knows (in-process, zero cost).
  const unseeded = symbols.filter((s) => !WsManager.hasPrevClose(s));
  if (unseeded.length === 0) return;

  // Level 2: pull what's available in Redis to avoid hitting TwelveData.
  const redisCached = await Promise.all(
    unseeded.map(async (sym) => ({ sym, q: await rget<SeedQuote>(seedKey(sym)) }))
  );

  const stillNeeded: string[] = [];
  for (const { sym, q } of redisCached) {
    if (q && q.c > 0) {
      const prevClose = q.pc > 0 ? q.pc : q.c;
      WsManager.seedPrevClose(sym, prevClose);
      safeEnqueue(`data: ${JSON.stringify({
        symbol: sym, price: q.c,
        change: isFinite(q.d) ? q.d : undefined,
        changePercent: isFinite(q.dp) ? q.dp : undefined,
        previousClose: prevClose,
      } satisfies PriceTick)}\n\n`);
    } else {
      stillNeeded.push(sym);
    }
  }

  if (stillNeeded.length === 0) return;

  // During pre-/post-market, request prepost data so `close` reflects the actual
  // extended-hours price instead of yesterday's regular close — otherwise the seed
  // (and every WS tick computed against it) shows 0% change until price happens to
  // move away from that stale value.
  const prepost = isExtendedHoursET();

  // Level 2.5: pre-seed prevClose from the day-stable pc: cache. Doesn't emit a
  // price (no fresh quote), but guarantees the next WS tick computes a correct
  // changePercent even before the REST seed below returns — or if it fails.
  const pcCached = await Promise.all(
    stillNeeded.map(async (sym) => ({ sym, pc: await rget<number>(pcKey(sym)) }))
  );
  for (const { sym, pc } of pcCached) {
    if (pc && pc > 0) WsManager.seedPrevClose(sym, pc);
  }

  // Level 3: fetch the true remainder from TwelveData in chunks.
  const chunks: string[][] = [];
  for (let i = 0; i < stillNeeded.length; i += SEED_CHUNK) {
    chunks.push(stillNeeded.slice(i, i + SEED_CHUNK));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const quotes = await getStockQuotes(chunk, { prepost });
        for (const [sym, quote] of quotes.entries()) {
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
          // Write to Redis so sibling instances skip this fetch for 15 s.
          void rset<SeedQuote>(seedKey(sym), { c: quote.c, d: quote.d, dp: quote.dp, pc: prevClose }, SEED_TTL);
          // Persist previousClose until ET midnight so cold starts pre-seed it instantly.
          void rset<number>(pcKey(sym), prevClose, secondsToEtMidnight());
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[prices/stream] seed chunk failed:', err instanceof Error ? err.message : err);
        }
        // Non-fatal — other chunks + WS ticks still deliver prices
      }
    })
  );
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
