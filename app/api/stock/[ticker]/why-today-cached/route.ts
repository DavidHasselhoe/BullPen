/**
 * GET /api/stock/[ticker]/why-today-cached?lang=en&pct=-3.4
 *
 * Today's Why Today explanation for one stock, only if someone already paid
 * for it: Home's inline explanations and the streamed Why? panel write the
 * same shared cache (lib/ai/why-today.ts). This route never generates, so it
 * costs nothing and needs no quota. A miss returns null and the stock page
 * keeps its Why? button as the way to ask.
 *
 * `pct` is the move the page is showing. It can only hide a stale answer
 * (the stock turned around or moved much further since it was written),
 * never cause a generation, so trusting the client's number here is safe.
 */
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { rget } from '@/lib/cache/redis-cache';
import { WHY_TODAY_MIN_MOVE } from '@/lib/ai/why-today-shared';
import { isStale, whyTodayKey, whyTodayLanguage, type CachedWhyToday } from '@/lib/ai/why-today';

const TICKER_RE = /^[A-Z0-9.\-/]{1,12}$/;

async function handler(request: NextRequest, context: unknown): Promise<NextResponse> {
  const { ticker: raw } = await (context as { params: Promise<{ ticker: string }> }).params;
  const ticker = raw.toUpperCase();
  const pct = Number(request.nextUrl.searchParams.get('pct'));
  if (!TICKER_RE.test(ticker) || !Number.isFinite(pct) || Math.abs(pct) < WHY_TODAY_MIN_MOVE) {
    return addSecurityHeaders(NextResponse.json({ why: null }));
  }

  const language = whyTodayLanguage(request.nextUrl.searchParams.get('lang'));
  const cached = await rget<CachedWhyToday>(whyTodayKey(ticker, language));
  const why = cached && !isStale(cached, pct) ? { text: cached.text, changePct: cached.changePct } : null;
  return addSecurityHeaders(NextResponse.json({ why }));
}

export const GET = withAuth(handler, { rateLimit: { windowMs: 60_000, maxRequests: 60 } });
