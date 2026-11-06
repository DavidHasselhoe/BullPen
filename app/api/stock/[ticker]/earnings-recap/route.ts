/**
 * GET /api/stock/[ticker]/earnings-recap
 *
 * The latest results recap for a stock (lib/ai/earnings-recap.ts), written by
 * the check-sec-filings cron. Read only, never generates. Pro gets the
 * bullets; everyone else, signed in or not, only learns that one exists, for
 * the locked cue on the earnings card.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withOptionalAuth, addSecurityHeaders, validateTickerParam } from '@/lib/security/api-security';
import { getTier, isPro } from '@/lib/billing/tier';
import { readRecap } from '@/lib/ai/earnings-recap';

async function get(_request: NextRequest, context: unknown, session: { userId: string } | null): Promise<NextResponse> {
  const { ticker } = await (context as { params: Promise<{ ticker: string }> }).params;
  const check = validateTickerParam(ticker);
  if (!check.valid || !check.normalized) {
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'Invalid ticker' }, { status: 400 }));
  }
  const recap = await readRecap(check.normalized);
  // Tier-dependent: a browser-cached free answer would keep the lock on for someone who just upgraded.
  const headers = { 'Cache-Control': 'private, no-cache' };
  if (!recap?.bullets) return addSecurityHeaders(NextResponse.json({ success: true, recap: null }, { headers }));
  if (session && isPro(await getTier(session.userId))) {
    const { reportDate, bullets, sourceUrl } = recap;
    return addSecurityHeaders(NextResponse.json({ success: true, recap: { reportDate, bullets, sourceUrl } }, { headers }));
  }
  return addSecurityHeaders(NextResponse.json({ success: true, recap: null, locked: { reportDate: recap.reportDate } }, { headers }));
}

export const GET = withOptionalAuth(get, { rateLimit: { windowMs: 60 * 1000, maxRequests: 60 } });
