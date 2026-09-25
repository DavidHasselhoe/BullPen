/**
 * GET /api/congress/overlap
 *
 * Tracked politicians' trades in stocks the user holds or watches, last 90
 * days. The cross-referencing is the Pro tool; free users get only how many
 * of their stocks were traded, as the upsell, never the trades themselves
 * behind a gate (those stay free on each stock and member page).
 *
 * Per-user, so never in a shared cache.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { getTier, isPro } from '@/lib/billing/tier';
import { getTradesForSymbols } from '@/lib/congress/insights';

const WINDOW_DAYS = 90;

async function handler(_request: NextRequest, _context: unknown, session: { userId: string }): Promise<NextResponse> {
  const supabase = createServerClient();
  const [holdings, watchlist, tier] = await Promise.all([
    supabase.from('user_holdings').select('symbol').eq('user_id', session.userId),
    supabase.from('user_watchlist').select('symbol').eq('user_id', session.userId),
    getTier(session.userId),
  ]);
  const held = new Set(((holdings.data ?? []) as { symbol: string }[]).map((r) => r.symbol.toUpperCase()));
  const watched = new Set(((watchlist.data ?? []) as { symbol: string }[]).map((r) => r.symbol.toUpperCase()));

  try {
    const trades = await getTradesForSymbols([...held, ...watched], WINDOW_DAYS);
    const symbols = [...new Set(trades.map((t) => t.symbol))];
    if (!isPro(tier)) {
      return addSecurityHeaders(NextResponse.json({ success: true, locked: true, symbolCount: symbols.length, windowDays: WINDOW_DAYS }));
    }
    return addSecurityHeaders(NextResponse.json({
      success: true,
      locked: false,
      symbolCount: symbols.length,
      windowDays: WINDOW_DAYS,
      held: symbols.filter((s) => held.has(s)),
      trades,
    }));
  } catch {
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'Failed to load' }, { status: 500 }));
  }
}

export const GET = withAuth(handler, { rateLimit: { windowMs: 60 * 1000, maxRequests: 30 } });
