import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { getMonthCloses, monthClosesKey } from '@/lib/market-data/month-closes';
import { monthKeyOf, todayET } from '@/lib/dates/calendar-format';
import { closeOnOrBefore, etDate, type SinceAddedEntry } from '@/lib/watchlist/scorecard';

interface RouteContext {
  params: Promise<{ listId: string }>;
}

/** The S&P 500 stand-in. SPY's split-adjusted closes track the index. */
const BENCHMARK = 'SPY';

/**
 * GET /api/watchlist/lists/[listId]/since-added
 *
 * The anchors for the list scorecard: each pick's close on the day it was
 * added, and SPY's on the same day. The client measures from there to the live
 * price, so the numbers tick with the cards. Removed picks (watchlist_removals)
 * come with their exit closes too, so dropping a loser doesn't flatter the list.
 *
 * Only the add date is stored, never a price: closes are split-adjusted, so a
 * stored price would be wrong after the next split. Reads the shared
 * dailycloses cache, about 1 credit per cold (symbol, month).
 */
async function handler(
  _req: NextRequest,
  ctx: RouteContext,
  session: { userId: string }
): Promise<NextResponse> {
  const { listId } = await ctx.params;
  const supabase = createServerClient();

  const { data: list } = await supabase
    .from('watchlist_lists')
    .select('id')
    .eq('id', listId)
    .eq('user_id', session.userId)
    .maybeSingle();
  if (!list) {
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'List not found' }, { status: 404 }));
  }

  const [{ data: rows }, { data: removals }] = await Promise.all([
    supabase.from('user_watchlist').select('symbol, added_at').eq('user_id', session.userId).eq('list_id', listId),
    supabase
      .from('watchlist_removals')
      .select('symbol, added_at, removed_at')
      .eq('user_id', session.userId)
      .eq('list_id', listId)
      .order('removed_at', { ascending: false })
      .limit(500),
  ]);

  const today = todayET();
  const picks = [
    ...(rows ?? []).map((r) => ({ symbol: r.symbol as string, addedAt: r.added_at as string, removedAt: undefined as string | undefined })),
    ...(removals ?? []).map((r) => ({ symbol: r.symbol as string, addedAt: r.added_at as string, removedAt: r.removed_at as string })),
  ];

  // Every (symbol, month) a start or exit close falls in, for the pick and for SPY.
  const pairs: { symbol: string; month: string }[] = [];
  for (const p of picks) {
    // Added today: no close to measure from yet.
    if (etDate(p.addedAt) >= today) continue;
    for (const date of [etDate(p.addedAt), p.removedAt && etDate(p.removedAt)]) {
      if (date) pairs.push({ symbol: p.symbol, month: monthKeyOf(date) }, { symbol: BENCHMARK, month: monthKeyOf(date) });
    }
  }

  let closes: Awaited<ReturnType<typeof getMonthCloses>>['closes'];
  try {
    ({ closes } = await getMonthCloses(pairs));
  } catch (error) {
    if (error instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(NextResponse.json({ success: false, error: 'plan_restricted' }, { status: 200 }));
    }
    throw error;
  }

  const closeAt = (symbol: string, date: string) =>
    closeOnOrBefore(closes.get(monthClosesKey(symbol, monthKeyOf(date))), date);

  const entries: SinceAddedEntry[] = picks.map((p) => {
    const start = etDate(p.addedAt);
    const isNew = start >= today;
    const entry: SinceAddedEntry = {
      symbol: p.symbol,
      addedAt: p.addedAt,
      startClose: isNew ? null : closeAt(p.symbol, start),
      benchStart: isNew ? null : closeAt(BENCHMARK, start),
    };
    if (p.removedAt) {
      // Left today: the in-progress daily bar stands in for today's close.
      const end = etDate(p.removedAt);
      entry.removedAt = p.removedAt;
      entry.endClose = isNew ? null : closeAt(p.symbol, end);
      entry.benchEnd = isNew ? null : closeAt(BENCHMARK, end);
    }
    return entry;
  });

  // No browser caching: an add, remove or Undo refetches this and must see the change.
  return addSecurityHeaders(NextResponse.json({ success: true, benchmark: BENCHMARK, entries }));
}

export const GET = withAuth(handler, { rateLimit: { windowMs: 60_000, maxRequests: 60 } });
