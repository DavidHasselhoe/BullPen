/**
 * Earnings Upcoming Alert Cron Job
 * GET /api/cron/check-earnings-upcoming
 *
 * Runs daily at 8:00 AM UTC.
 * For every user who has upcoming_earnings notifications enabled:
 *   1. Collects their tracked symbols (watchlist + holdings, alerts_enabled = true)
 *   2. Fetches the Finnhub earnings calendar for the next 7 days (one call for all users)
 *   3. Creates a grouped notification for any user whose tracked stocks have earnings soon
 *
 * Credit cost: 0 (Finnhub free tier, one API call for everyone).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getEarningsCalendar } from '@/lib/finnhub/finnhub-client';
import {
  createEarningsUpcomingNotification,
  type EarningsItem,
} from '@/lib/notifications/notification-creators';

export const maxDuration = 120;

export async function GET(request: NextRequest): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  const summary = {
    usersChecked: 0,
    usersNotified: 0,
    earningsFound: 0,
    errors: [] as string[],
  };

  try {
    // ── 1. Fetch all users with upcoming_earnings enabled ──────────────────
    // upcoming_earnings defaults to true when not set
    const { data: users, error: usersErr } = await (supabase as any)
      .from('users')
      .select('id, settings')
      .or('settings->notifications->upcoming_earnings.is.null,settings->notifications->upcoming_earnings.eq.true') as
      { data: Array<{ id: string; settings: Record<string, any> | null }> | null; error: unknown };

    if (usersErr || !users?.length) {
      return NextResponse.json({ ...summary, message: 'No eligible users' });
    }

    // ── 2. Collect tracked symbols per user ────────────────────────────────
    const eligibleUserIds = new Set(users.map((u) => u.id));

    const [watchlistRes, holdingsRes] = await Promise.all([
      (supabase as any)
        .from('user_watchlist')
        .select('user_id, symbol, company_name')
        .eq('alerts_enabled', true) as Promise<{ data: Array<{ user_id: string; symbol: string; company_name: string }> | null }>,
      (supabase as any)
        .from('user_holdings')
        .select('user_id, symbol, company_name')
        .eq('alerts_enabled', true) as Promise<{ data: Array<{ user_id: string; symbol: string; company_name: string }> | null }>,
    ]);

    const userSymbols = new Map<string, Map<string, string>>(); // userId → (symbol → companyName)

    for (const row of [...(watchlistRes.data ?? []), ...(holdingsRes.data ?? [])]) {
      if (!eligibleUserIds.has(row.user_id)) continue;
      if (!userSymbols.has(row.user_id)) userSymbols.set(row.user_id, new Map());
      if (!userSymbols.get(row.user_id)!.has(row.symbol)) {
        userSymbols.get(row.user_id)!.set(row.symbol, row.company_name || row.symbol);
      }
    }

    if (userSymbols.size === 0) {
      return NextResponse.json({ ...summary, message: 'No tracked symbols with alerts enabled' });
    }

    // ── 3. Fetch earnings calendar for next 7 days (ONE call for all users) ─
    const today = new Date();
    const in7Days = new Date(today);
    in7Days.setDate(today.getDate() + 7);

    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    let earningsEvents: Array<{ symbol: string; date: string }> = [];

    try {
      const calendar = await getEarningsCalendar(fmt(today), fmt(in7Days));
      earningsEvents = calendar.map((e) => ({ symbol: e.symbol, date: e.date }));
      summary.earningsFound = earningsEvents.length;
    } catch (e) {
      summary.errors.push(`Finnhub earnings calendar failed: ${String(e)}`);
      return NextResponse.json(summary);
    }

    if (earningsEvents.length === 0) {
      return NextResponse.json({ ...summary, message: 'No earnings in next 7 days' });
    }

    // Build lookup: symbol → date
    const earningsMap = new Map<string, string>();
    for (const e of earningsEvents) {
      if (!earningsMap.has(e.symbol)) earningsMap.set(e.symbol, e.date);
    }

    // ── 4. For each user — find their stocks with upcoming earnings ─────────
    summary.usersChecked = userSymbols.size;

    for (const [userId, symbolMap] of userSymbols.entries()) {
      const upcoming: EarningsItem[] = [];

      for (const [symbol, companyName] of symbolMap.entries()) {
        const date = earningsMap.get(symbol);
        if (date) upcoming.push({ symbol, companyName, date });
      }

      if (upcoming.length === 0) continue;

      const created = await createEarningsUpcomingNotification(userId, upcoming);
      if (created) summary.usersNotified++;
    }
  } catch (err) {
    summary.errors.push(String(err));
  }

  return NextResponse.json(summary);
}
