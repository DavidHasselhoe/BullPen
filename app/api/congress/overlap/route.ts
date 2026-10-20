/**
 * /api/congress/overlap
 *
 * GET: tracked politicians' trades in stocks the user holds or watches, last
 * 90 days. The cross-referencing is the Pro tool. Free users get which of
 * their stocks were traded and by whom, but not who traded what, when or how
 * much (the trades themselves stay free on each stock and member page).
 *
 * POST: records a visit (migration 170). The panel sends it once it has been
 * on screen; a GET never moves the line, because on Discover the panel sits
 * below the fold and a page load is not the same as having seen it.
 *
 * Per-user, so never in a shared cache.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { getTier, isPro } from '@/lib/billing/tier';
import { getTradesForSymbols } from '@/lib/congress/insights';
import { isNewTrade, overlapVisit } from '@/lib/congress/overlap-groups';
import { OPEN_POSITION_FILTER } from '@/lib/holdings/open-position';

const WINDOW_DAYS = 90;
/**
 * ponytail: one paged query, bounded. Real portfolios are far below it (14
 * stocks gave 66 trades); getTradesForSymbols logs when it is reached.
 */
const MAX_TRADES = 5000;

type VisitRow = { congress_overlap_seen_at: string | null; congress_overlap_since: string | null } | null;

async function readVisit(userId: string): Promise<VisitRow> {
  const { data } = await createServerClient()
    .from('users')
    .select('congress_overlap_seen_at, congress_overlap_since')
    .eq('id', userId)
    .maybeSingle();
  return data as VisitRow;
}

async function get(_request: NextRequest, _context: unknown, session: { userId: string }): Promise<NextResponse> {
  const supabase = createServerClient();
  const [holdings, watchlist, tier, visit] = await Promise.all([
    supabase.from('user_holdings').select('symbol').eq('user_id', session.userId).or(OPEN_POSITION_FILTER),
    supabase.from('user_watchlist').select('symbol').eq('user_id', session.userId),
    getTier(session.userId),
    readVisit(session.userId),
  ]);
  const held = new Set(((holdings.data ?? []) as { symbol: string }[]).map((r) => r.symbol.toUpperCase()));
  const watched = new Set(((watchlist.data ?? []) as { symbol: string }[]).map((r) => r.symbol.toUpperCase()));

  try {
    const trades = await getTradesForSymbols([...held, ...watched], WINDOW_DAYS, MAX_TRADES);
    // The line this visit would use, read only: the POST is what moves it.
    const newSince = overlapVisit(visit?.congress_overlap_seen_at ?? null, visit?.congress_overlap_since ?? null, new Date()).newSince;
    const newSymbols = new Set(trades.filter((t) => isNewTrade(t, newSince)).map((t) => t.symbol));
    // Stocks with news first, then by their newest trade.
    const byDate = [...new Set(trades.map((t) => t.symbol))];
    const symbols = [...byDate.filter((s) => newSymbols.has(s)), ...byDate.filter((s) => !newSymbols.has(s))];
    // Readable names from our catalogue: the panel leads with "Microsoft", not "MSFT".
    const { data: rows } = symbols.length
      ? await supabase.from('search_index').select('ticker, name').in('ticker', symbols)
      : { data: [] };
    const names = Object.fromEntries(((rows ?? []) as { ticker: string; name: string }[]).map((r) => [r.ticker, r.name]));
    const base = { success: true, symbolCount: symbols.length, windowDays: WINDOW_DAYS, held: symbols.filter((s) => held.has(s)), names, newSince };

    if (!isPro(tier)) {
      const people = [...new Map(trades.map((t) => [t.slug, { slug: t.slug, displayName: t.displayName }])).values()];
      // How many of their stocks have news, not which: that is the Pro view.
      return addSecurityHeaders(NextResponse.json({ ...base, locked: true, symbols, people, newStocks: newSymbols.size }));
    }
    return addSecurityHeaders(NextResponse.json({ ...base, locked: false, trades }));
  } catch {
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'Failed to load' }, { status: 500 }));
  }
}

async function post(_request: NextRequest, _context: unknown, session: { userId: string }): Promise<NextResponse> {
  const visit = await readVisit(session.userId);
  const next = overlapVisit(visit?.congress_overlap_seen_at ?? null, visit?.congress_overlap_since ?? null, new Date());
  // Migration 170's columns are newer than the generated Database type.
  const { error } = await createServerClient().from('users').update(next.store as never).eq('id', session.userId);
  if (error) {
    console.error('[congress/overlap] could not record the visit:', error.message);
    return addSecurityHeaders(NextResponse.json({ success: false }, { status: 500 }));
  }
  return addSecurityHeaders(NextResponse.json({ success: true }));
}

export const GET = withAuth(get, { rateLimit: { windowMs: 60 * 1000, maxRequests: 30 } });
export const POST = withAuth(post, { rateLimit: { windowMs: 60 * 1000, maxRequests: 10 } });
