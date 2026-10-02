/**
 * POST /api/ai/why-today/inline  { tickers: string[], language }
 *
 * The explanations Home shows under "Biggest moves", from the shared Why
 * Today cache (lib/ai/why-today.ts), generating what's missing.
 *
 * What bounds the spend (~$0.10 per generation):
 * - one explanation per stock per trading day per language, shared by everyone;
 * - only moves of WHY_TODAY_MIN_MOVE or more, priced by the server's own quote;
 * - only the caller's own holdings and watchlist, so it can't be used to fill
 *   the cache for arbitrary tickers;
 * - free accounts: their single biggest mover. Pro: up to five;
 * - a per-account daily cap on generations this account triggers (cache hits
 *   are free and uncapped), and a lock so two page loads never pay twice.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders, rejectIfTooLarge } from '@/lib/security/api-security';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { createServerClient } from '@/lib/supabase/client';
import { getTier, isPro } from '@/lib/billing/tier';
import { logAiCall } from '@/lib/billing/log-ai-call';
import { rdel, rget, rset, rsetnx } from '@/lib/cache/redis-cache';
import { getStockQuotes, isOutsideRegularSessionET, withRateLimitRetry } from '@/lib/twelvedata/twelvedata-client';
import {
  WHY_TODAY_CACHE_TTL,
  WHY_TODAY_MIN_MOVE,
  WHY_TODAY_MODEL,
  generateWhyToday,
  isStale,
  whyTodayKey,
  whyTodayLanguage,
  whyTodayLockKey,
  type CachedWhyToday,
  type InlineWhy,
} from '@/lib/ai/why-today';
import { listingMic } from '@/lib/assets/asset-type';

// A generation with web search takes 10-25 s.
export const maxDuration = 60;

const DAILY_GENERATIONS = { free: 2, pro: 20 };

const TICKER_RE = /^[A-Z0-9.\-/]{1,12}$/;

async function handler(request: NextRequest, _ctx: unknown, session: { userId: string }): Promise<NextResponse> {
  const tooLarge = rejectIfTooLarge(request, 4 * 1024);
  if (tooLarge) return tooLarge;

  const limit = await checkRateLimit(`why-today-inline:${session.userId}`, { windowMs: 60_000, maxRequests: 30 });
  if (!limit.allowed) {
    return addSecurityHeaders(NextResponse.json({ error: 'rate_limited' }, { status: 429 }));
  }

  let requested: string[];
  let language: string;
  try {
    const body = await request.json();
    requested = [...new Set((Array.isArray(body.tickers) ? body.tickers : []).map((t: unknown) => String(t).toUpperCase()))]
      .filter((t): t is string => TICKER_RE.test(t as string))
      .slice(0, 5) as string[];
    language = whyTodayLanguage(body.language);
  } catch {
    return addSecurityHeaders(NextResponse.json({ error: 'Invalid request body' }, { status: 400 }));
  }

  const supabase = createServerClient();
  const [tier, { data: holdings }, { data: watchlist }] = await Promise.all([
    getTier(session.userId),
    supabase.from('user_holdings').select('symbol, mic_code').eq('user_id', session.userId)
      .returns<Array<{ symbol: string; mic_code: string | null }>>(),
    supabase.from('user_watchlist').select('symbol').eq('user_id', session.userId)
      .returns<Array<{ symbol: string }>>(),
  ]);
  const pro = isPro(tier);

  const mics = new Map<string, string | null>();
  for (const w of watchlist ?? []) mics.set(w.symbol.toUpperCase(), null);
  for (const h of holdings ?? []) mics.set(h.symbol.toUpperCase(), h.mic_code);

  // The client sends movers biggest first, so a free account's one is the top.
  let tickers = requested.filter((t) => mics.has(t));
  if (!pro) tickers = tickers.slice(0, 1);

  const explanations: Record<string, InlineWhy> = {};
  for (const t of requested) explanations[t] = { status: 'skipped' };
  if (tickers.length === 0) return addSecurityHeaders(NextResponse.json({ explanations }));

  const micCodes: Record<string, string> = {};
  for (const t of tickers) { const mic = listingMic(mics.get(t)); if (mic) micCodes[t] = mic; }
  let quotes = new Map<string, { c: number; d: number; dp: number }>();
  try {
    quotes = await withRateLimitRetry(() => getStockQuotes(tickers, { prepost: isOutsideRegularSessionET(), micCodes }));
  } catch (err) {
    console.error('[why-today/inline] quotes failed:', err);
  }

  await Promise.all(
    tickers.map(async (ticker) => {
      const q = quotes.get(ticker);
      if (!q || !Number.isFinite(q.dp) || !(q.c > 0) || Math.abs(q.dp) < WHY_TODAY_MIN_MOVE) return;

      const key = whyTodayKey(ticker, language, mics.get(ticker));
      const cached = await rget<CachedWhyToday>(key);
      const ready = (c: CachedWhyToday): InlineWhy => ({ status: 'ready', text: c.text, changePct: c.changePct });
      if (cached && !isStale(cached, q.dp)) {
        explanations[ticker] = ready(cached);
        return;
      }

      const lock = whyTodayLockKey(key);
      if (!(await rsetnx(lock, 90))) {
        // Someone else is writing it right now; the client asks again shortly.
        explanations[ticker] = cached ? ready(cached) : { status: 'pending' };
        return;
      }
      try {
        const cap = await checkRateLimit(`why-today-gen:${session.userId}`, {
          windowMs: 24 * 60 * 60 * 1000,
          maxRequests: pro ? DAILY_GENERATIONS.pro : DAILY_GENERATIONS.free,
        });
        if (!cap.allowed) {
          if (cached) explanations[ticker] = ready(cached);
          return;
        }

        const move = { ticker, price: q.c, change: q.d, changePct: q.dp };
        const { text, inputTokens, outputTokens } = await generateWhyToday(move, language);
        void logAiCall({
          userId: session.userId,
          feature: 'why_today',
          model: WHY_TODAY_MODEL,
          inputTokens,
          outputTokens,
          metadata: { ticker, inline: true },
        });
        if (!text) return;
        const fresh: CachedWhyToday = { text, changePct: q.dp, generatedAt: new Date().toISOString() };
        await rset(key, fresh, WHY_TODAY_CACHE_TTL);
        explanations[ticker] = ready(fresh);
      } catch (err) {
        console.error('[why-today/inline] generation failed:', ticker, err);
        if (cached) explanations[ticker] = ready(cached);
      } finally {
        void rdel(lock);
      }
    }),
  );

  return addSecurityHeaders(NextResponse.json({ explanations }));
}

export const POST = withAuth(handler);
