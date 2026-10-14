/**
 * GET /api/congress/overlap
 *
 * Tracked politicians' trades in stocks the user holds or watches, last 90
 * days. The cross-referencing is the Pro tool. Free users get which of their
 * stocks were traded and by whom, but not who traded what, when or how much
 * (the trades themselves stay free on each stock and member page).
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
    // Newest trade first, so both views lead with what moved most recently.
    const symbols = [...new Set(trades.map((t) => t.symbol))];
    // Readable names from our catalogue: the panel leads with "Microsoft", not "MSFT".
    const { data: rows } = symbols.length
      ? await supabase.from('search_index').select('ticker, name').in('ticker', symbols)
      : { data: [] };
    const names = Object.fromEntries(((rows ?? []) as { ticker: string; name: string }[]).map((r) => [r.ticker, r.name]));
    const base = { success: true, symbolCount: symbols.length, windowDays: WINDOW_DAYS, held: symbols.filter((s) => held.has(s)), names };

    if (!isPro(tier)) {
      const people = [...new Map(trades.map((t) => [t.slug, { slug: t.slug, displayName: t.displayName }])).values()];
      return addSecurityHeaders(NextResponse.json({ ...base, locked: true, symbols, people }));
    }
    return addSecurityHeaders(NextResponse.json({ ...base, locked: false, trades }));
  } catch {
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'Failed to load' }, { status: 500 }));
  }
}

export const GET = withAuth(handler, { rateLimit: { windowMs: 60 * 1000, maxRequests: 30 } });
