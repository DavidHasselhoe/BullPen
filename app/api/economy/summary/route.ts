/**
 * GET /api/economy/summary?lang=en&hash=<facts hash>
 *
 * The shared AI summary for /tools/economy (lib/ai/economy-summary.ts). Public,
 * like the page: a hit is a Redis read, a miss writes one summary for every
 * visitor, bounded by a lock and a daily cap. No TwelveData credits.
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveEconomySummary } from '@/lib/ai/economy-summary';
import { isSupportedLanguage } from '@/lib/i18n/language-names';
import { checkRateLimit, getClientIdentifier } from '@/lib/security/rate-limiter';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const limit = await checkRateLimit(`economy-summary:${getClientIdentifier(request)}`, { windowMs: 60_000, maxRequests: 30 });
  if (!limit.allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const params = request.nextUrl.searchParams;
  const raw = params.get('lang') ?? 'en';
  const lang = isSupportedLanguage(raw) ? raw : 'en';
  const hash = /^[0-9a-f]{16}$/.test(params.get('hash') ?? '') ? params.get('hash') : null;

  const body = await resolveEconomySummary(hash, lang);
  return NextResponse.json(body, {
    // A ready answer for a given hash never changes; let the CDN keep it.
    headers: body.status === 'ready' && hash ? { 'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400' } : { 'Cache-Control': 'no-store' },
  });
}
