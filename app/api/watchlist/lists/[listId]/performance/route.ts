import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { getTier, isPro } from '@/lib/billing/tier';
import { TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { getMonthCloses, monthClosesKey } from '@/lib/market-data/month-closes';
import { currentMonthKey, monthKeyOf, shiftMonth } from '@/lib/dates/calendar-format';
import { etDate, scoreHistory, type DayClose, type HistoryPick } from '@/lib/watchlist/scorecard';

interface RouteContext {
  params: Promise<{ listId: string }>;
}

const BENCHMARK = 'SPY';

/** Bounds a cold fetch at symbols x 36 credits. A pick older than that has no start close and drops out. */
const MAX_MONTHS = 36;

/**
 * GET /api/watchlist/lists/[listId]/performance — Pro
 *
 * The list scorecard over time: the strip's "since you added them" number vs
 * the S&P 500 (SPY), as it read at every close since the first pick. Removed
 * picks (watchlist_removals) stay in, frozen at their exit close. Built from
 * the shared dailycloses cache, so warm months cost nothing.
 */
async function handler(
  _req: NextRequest,
  ctx: RouteContext,
  session: { userId: string }
): Promise<NextResponse> {
  const { listId } = await ctx.params;
  const supabase = createServerClient();

  const [tier, { data: list }] = await Promise.all([
    getTier(session.userId),
    supabase.from('watchlist_lists').select('id').eq('id', listId).eq('user_id', session.userId).maybeSingle(),
  ]);
  if (!list) {
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'List not found' }, { status: 404 }));
  }
  if (!isPro(tier)) {
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'pro_required' }, { status: 403 }));
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

  const picks: HistoryPick[] = [
    ...(rows ?? []).map((r) => ({ symbol: r.symbol as string, start: etDate(r.added_at as string) })),
    ...(removals ?? []).map((r) => ({
      symbol: r.symbol as string,
      start: etDate(r.added_at as string),
      end: etDate(r.removed_at as string),
    })),
  ];
  if (picks.length === 0) {
    return addSecurityHeaders(NextResponse.json({ success: true, points: [] }));
  }

  // Every month from the first pick's (less a week of runway the cache already
  // carries) to now, for every symbol and SPY.
  const current = currentMonthKey();
  const firstPick = monthKeyOf(picks.reduce((m, p) => (p.start < m ? p.start : m), picks[0].start));
  const oldest = shiftMonth(current, -(MAX_MONTHS - 1));
  const months: string[] = [];
  for (let m = firstPick > oldest ? firstPick : oldest; m <= current; m = shiftMonth(m, 1)) months.push(m);
  const symbols = [...new Set([...picks.map((p) => p.symbol), BENCHMARK])];

  let result: Awaited<ReturnType<typeof getMonthCloses>>;
  try {
    result = await getMonthCloses(symbols.flatMap((symbol) => months.map((month) => ({ symbol, month }))));
  } catch (error) {
    if (error instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(NextResponse.json({ success: false, error: 'plan_restricted' }, { status: 200 }));
    }
    throw error;
  }

  // Months overlap by the week of runway each carries; keep one bar per date.
  const series = new Map<string, DayClose[]>();
  for (const symbol of symbols) {
    const byDate = new Map<string, number>();
    for (const month of months) {
      for (const c of result.closes.get(monthClosesKey(symbol, month)) ?? []) byDate.set(c.date, c.close);
    }
    series.set(symbol, [...byDate].map(([date, close]) => ({ date, close })).sort((a, b) => a.date.localeCompare(b.date)));
  }

  const points = scoreHistory(picks, (s) => series.get(s), series.get(BENCHMARK) ?? []);

  return addSecurityHeaders(
    NextResponse.json({ success: true, incomplete: result.incomplete, points })
  );
}

export const GET = withAuth(handler, { rateLimit: { windowMs: 60_000, maxRequests: 30 } });
