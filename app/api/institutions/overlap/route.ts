/**
 * /api/institutions/overlap
 *
 * GET: what the tracked funds did, in their latest 13F against the one before,
 * in stocks the user owns or watches (lib/institutions/fund-overlap.ts). The
 * cross-reference is Pro, like Washington Trading's: free users get which of
 * their stocks moved and which funds, not who did what.
 *
 * Per-user, so never in a shared cache.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { getTier, isPro } from '@/lib/billing/tier';
import { getFundMovesForSymbols } from '@/lib/institutions/fund-overlap';
import { OPEN_POSITION_FILTER } from '@/lib/holdings/open-position';

async function get(_request: NextRequest, _context: unknown, session: { userId: string }): Promise<NextResponse> {
  const supabase = createServerClient();
  const [holdings, watchlist, tier] = await Promise.all([
    supabase.from('user_holdings').select('symbol').eq('user_id', session.userId).or(OPEN_POSITION_FILTER),
    supabase.from('user_watchlist').select('symbol').eq('user_id', session.userId),
    getTier(session.userId),
  ]);
  const held = new Set(((holdings.data ?? []) as { symbol: string }[]).map((r) => r.symbol.toUpperCase()));
  const watched = new Set(((watchlist.data ?? []) as { symbol: string }[]).map((r) => r.symbol.toUpperCase()));

  try {
    const moves = await getFundMovesForSymbols([...held, ...watched]);
    const symbols = [...new Set(moves.map((m) => m.symbol))];
    const { data: rows } = symbols.length
      ? await supabase.from('search_index').select('ticker, name').in('ticker', symbols)
      : { data: [] };
    const names = Object.fromEntries(((rows ?? []) as { ticker: string; name: string }[]).map((r) => [r.ticker, r.name]));
    const base = { success: true, symbolCount: symbols.length, held: symbols.filter((s) => held.has(s)), names };

    if (!isPro(tier)) {
      const funds = [...new Map(moves.map((m) => [m.fund.slug, m.fund])).values()];
      return addSecurityHeaders(NextResponse.json({ ...base, locked: true, symbols, funds }));
    }
    return addSecurityHeaders(NextResponse.json({ ...base, locked: false, moves }));
  } catch (err) {
    console.error('[institutions/overlap] failed:', err instanceof Error ? err.message : err);
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'Failed to load' }, { status: 500 }));
  }
}

export const GET = withAuth(get, { rateLimit: { windowMs: 60 * 1000, maxRequests: 30 } });
