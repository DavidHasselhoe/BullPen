/**
 * GET /api/ai/why-today/preview?ticker=NVDA&pct=-3.1&lang=en
 *
 * The first reason of today's Why Today answer, for the free paywall dialog to
 * show before the lock. Cache only: it reads what a Pro reader (or Home's free
 * top mover) already paid for, and never generates, so it costs one Redis read.
 *
 * Returns { point: null } when there is nothing safe to show: no answer yet,
 * an answer written for a different move (isStale against the price on the
 * reader's screen), or a one-sentence answer, which would give the whole thing
 * away. Never a partial sentence: the point is the first whole sentence.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { rget } from '@/lib/cache/redis-cache';
import { isStale, whyTodayKey, whyTodayLanguage, whyTodayTeaser, type CachedWhyToday } from '@/lib/ai/why-today';

const NONE = { success: true, point: null, more: 0 };

async function get(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const ticker = (params.get('ticker') ?? '').toUpperCase().slice(0, 10);
  const pct = Number(params.get('pct'));
  if (!/^[A-Z0-9.\-/]+$/.test(ticker) || !Number.isFinite(pct)) {
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 }));
  }

  const language = whyTodayLanguage(params.get('lang'));
  const cached = await rget<CachedWhyToday>(whyTodayKey(ticker, language));
  if (!cached || isStale(cached, pct)) return addSecurityHeaders(NextResponse.json(NONE));
  const teaser = whyTodayTeaser(cached.text, language);
  if (!teaser) return addSecurityHeaders(NextResponse.json(NONE));
  return addSecurityHeaders(NextResponse.json({ success: true, ...teaser }));
}

export const GET = withAuth(get, { rateLimit: { windowMs: 60 * 1000, maxRequests: 30 } });
