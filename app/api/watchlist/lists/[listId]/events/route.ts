import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { getTier, isPro } from '@/lib/billing/tier';
import { getTradesForSymbols } from '@/lib/congress/insights';
import { getRecentIndexEvents, INDEX_IDS, type IndexChangeEvent } from '@/lib/market-data/index-events';
import { addDays, todayET } from '@/lib/dates/calendar-format';

interface RouteContext {
  params: Promise<{ listId: string }>;
}

/** "This week": the last 7 days, today included. */
const DAYS = 7;
/**
 * Trades are filed up to 45 days after they happen, so look back far enough
 * by trade date to catch everything that became public this week.
 */
const TRADE_LOOKBACK_DAYS = 60;

export interface ListCongressTrade {
  symbol: string;
  slug: string;
  displayName: string;
  tradeType: string;
  disclosureDate: string;
}

/**
 * GET /api/watchlist/lists/[listId]/events
 *
 * What happened this week to the stocks in one list, beside the upcoming
 * earnings and ex-dividend dates the page reads from /api/calendar/*:
 * S&P 500, Nasdaq-100 and Dow joins and exits, and congress trades that
 * became public. Who traded what is Pro, as in /api/congress/overlap; a free
 * account gets the count. Database only, no market-data credits.
 */
async function handler(
  _req: NextRequest,
  ctx: RouteContext,
  session: { userId: string }
): Promise<NextResponse> {
  const { listId } = await ctx.params;
  const supabase = createServerClient();

  const [{ data: list }, { data: rows }, tier] = await Promise.all([
    supabase.from('watchlist_lists').select('id').eq('id', listId).eq('user_id', session.userId).maybeSingle(),
    supabase.from('user_watchlist').select('symbol').eq('user_id', session.userId).eq('list_id', listId),
    getTier(session.userId),
  ]);
  if (!list) {
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'List not found' }, { status: 404 }));
  }

  const symbols = new Set(((rows ?? []) as { symbol: string }[]).map((r) => r.symbol.toUpperCase()));
  if (symbols.size === 0) {
    return addSecurityHeaders(NextResponse.json({ success: true, index: [], congress: [], congressLocked: 0 }));
  }

  const since = addDays(todayET(), -(DAYS - 1));
  try {
    const [indexEvents, trades] = await Promise.all([
      Promise.all(INDEX_IDS.map((id) => getRecentIndexEvents(id, DAYS))),
      getTradesForSymbols([...symbols], TRADE_LOOKBACK_DAYS, 1000),
    ]);
    const index: IndexChangeEvent[] = indexEvents.flat().filter((e) => symbols.has(e.ticker));
    const disclosed = trades.filter((t) => t.disclosureDate && t.disclosureDate >= since);
    const pro = isPro(tier);

    return addSecurityHeaders(NextResponse.json({
      success: true,
      index,
      congress: pro
        ? disclosed.map((t): ListCongressTrade => ({
            symbol: t.symbol,
            slug: t.slug,
            displayName: t.displayName,
            tradeType: t.tradeType,
            disclosureDate: t.disclosureDate!,
          }))
        : [],
      congressLocked: pro ? 0 : disclosed.length,
    }));
  } catch (err) {
    console.error('[watchlist/events] failed:', err instanceof Error ? err.message : err);
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'Failed to load' }, { status: 500 }));
  }
}

export const GET = withAuth(handler, { rateLimit: { windowMs: 60_000, maxRequests: 30 } });
