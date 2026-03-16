/**
 * Market movers via Twelve Data WebSocket, streamed as SSE.
 * Uses WebSocket credits instead of API credits (8 symbols = 8 WS credits on Basic).
 * Only enabled when TWELVE_DATA_API_KEY is set. Rate limited to protect WS quota.
 */

import { NextRequest } from 'next/server';
import { withRateLimit } from '@/lib/security/api-security';
import WebSocket from 'ws';
import { logger } from '@/lib/utils/logger';
import { getExchangesForTicker } from '@/lib/market/ticker-exchange-map';
import { getStorageLogoUrl } from '@/lib/logos/logos-storage';

const WS_BASE = 'wss://ws.twelvedata.com/v1';

// Basic tier: 8 WS credits = 8 symbols max
const MAX_WS_SYMBOLS = 8;

// Default symbols for "All markets" mode
const DEFAULT_SYMBOLS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'JPM',
].slice(0, MAX_WS_SYMBOLS);

interface WsQuoteMessage {
  event?: string;
  symbol?: string;
  name?: string;
  exchange?: string;
  currency?: string;
  datetime?: string;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  volume?: string;
  previous_close?: string;
  change?: string;
  percent_change?: string;
}

interface MoverUpdate {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
  logoUrl?: string;
}

function formatMoverUpdate(msg: WsQuoteMessage): MoverUpdate | null {
  if (msg.event !== 'price' || !msg.symbol || !msg.close) return null;
  const close = parseFloat(msg.close);
  const pc = parseFloat(msg.previous_close || msg.close) || close;
  const change = parseFloat(msg.change || '0');
  const pct = parseFloat(msg.percent_change || '0');
  if (isNaN(close) || close <= 0 || pc <= 0) return null;
  return {
    symbol: msg.symbol,
    price: close,
    change,
    changePercent: pct,
    previousClose: pc,
    logoUrl: getStorageLogoUrl(msg.symbol),
  };
}

function buildSubscribePayload(symbols: string[]) {
  return {
    action: 'subscribe',
    params: {
      symbols: symbols.map((s) => {
        const ex = getExchangesForTicker(s)[0] || 'NASDAQ';
        return { symbol: s, exchange: ex };
      }),
    },
  };
}

async function streamHandler(request: NextRequest) {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'WebSocket movers not configured (no TWELVE_DATA_API_KEY)' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const symbolsParam = request.nextUrl.searchParams.get('symbols');
  const symbols = symbolsParam
    ? symbolsParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, MAX_WS_SYMBOLS)
    : DEFAULT_SYMBOLS;

  if (symbols.length === 0) {
    return new Response(
      JSON.stringify({ error: 'No symbols provided' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const encoder = new TextEncoder();

  let wsRef: WebSocket | null = null;
  const stream = new ReadableStream({
    start(controller) {
      const wsUrl = `${WS_BASE}?apikey=${encodeURIComponent(apiKey)}`;
      let closed = false;
      const quoteMap = new Map<string, MoverUpdate>();

      const cleanup = () => {
        if (!closed) {
          closed = true;
          wsRef?.close();
          controller.close();
        }
      };

      try {
        wsRef = new WebSocket(wsUrl);
      } catch (err) {
        logger.error('[movers-stream] WebSocket create error', err);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'WebSocket failed' })}\n\n`));
        controller.close();
        return;
      }

      wsRef.on('open', () => {
        wsRef!.send(JSON.stringify(buildSubscribePayload(symbols)));
      });

      wsRef.on('message', (data: Buffer | string) => {
        if (closed) return;
        try {
          const raw = typeof data === 'string' ? data : data.toString('utf8');
          const msg = JSON.parse(raw) as WsQuoteMessage;
          if (msg.event === 'price' && msg.symbol) {
            const mover = formatMoverUpdate(msg);
            if (mover) {
              quoteMap.set(mover.symbol, mover);
              const gainers = [...quoteMap.values()]
                .filter((m) => m.changePercent > 0)
                .sort((a, b) => b.changePercent - a.changePercent)
                .slice(0, 5);
              const losers = [...quoteMap.values()]
                .filter((m) => m.changePercent < 0)
                .sort((a, b) => a.changePercent - b.changePercent)
                .slice(0, 5);
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ gainers, losers })}\n\n`
                )
              );
            }
          }
        } catch {
          // Ignore parse errors
        }
      });

      wsRef.on('error', (err) => {
        if (!closed) {
          logger.error('[movers-stream] WebSocket error', err);
          closed = true;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'WebSocket error' })}\n\n`));
          controller.close();
        }
      });

      wsRef.on('close', () => {
        if (!closed) {
          closed = true;
          controller.close();
        }
      });

      // Keep-alive ping (serverless may kill idle connections)
      const pingInterval = setInterval(() => {
        if (closed || wsRef?.readyState !== WebSocket.OPEN) {
          clearInterval(pingInterval);
          return;
        }
        controller.enqueue(encoder.encode(': ping\n\n'));
      }, 15000);

      // Close after ~50s to avoid serverless timeout
      const timeout = setTimeout(() => {
        if (!closed) {
          closed = true;
          clearInterval(pingInterval);
          wsRef?.close();
          controller.close();
        }
      }, 50000);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

/** Rate limited: 30/min to protect Twelve Data WebSocket quota */
export const GET = withRateLimit(streamHandler, { windowMs: 60 * 1000, maxRequests: 30 });
