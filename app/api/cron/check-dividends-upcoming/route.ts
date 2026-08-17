/**
 * Ex-Dividend Reminder Cron Job
 * GET /api/cron/check-dividends-upcoming
 *
 * Runs daily at 08:00 UTC.
 * For every user who has dividend_reminder notifications enabled:
 *   1. Collects their tracked symbols (watchlist + holdings, alerts_enabled = true)
 *   2. Fetches the Twelve Data dividends calendar for REMINDER_DAYS_AHEAD days
 *      from today (one call, cached — normally the day the 04:00
 *      prefetch-calendar cron already warmed)
 *   3. Creates a grouped notification for any user whose tracked stocks go
 *      ex-dividend that day
 *
 * `/dividends_calendar` is a global feed with no country scoping (thousands
 * of rows/day across every exchange — see CLAUDE.md's golden rules), so this
 * only ever asks for ONE day at a time via the shared per-day cache, then
 * filters down to tracked symbols client-side — same shape as
 * check-earnings-upcoming, just targeting a future day instead of today.
 *
 * Credit cost: 40 credits per run if the target day isn't already cached
 * (Twelve Data /dividends_calendar, Venture+); normally free.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logSecurityEvent } from '@/lib/security/security-events';
import { createServerClient } from '@/lib/supabase/client';
import type { DividendsCalendarItem } from '@/lib/twelvedata/twelvedata-client';
import { getCalendarDay } from '@/lib/market-data/calendar-days';
import { todayET, addDays } from '@/lib/dates/calendar-format';
import {
  createDividendReminderNotification,
  type DividendItem,
} from '@/lib/notifications/notification-creators';

export const maxDuration = 120;

/** Lead time before the ex-dividend date — enough to act on, not so far out it's noise. */
const REMINDER_DAYS_AHEAD = 3;

export async function GET(request: NextRequest): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/check-dividends-upcoming' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  const summary = {
    usersChecked: 0,
    usersNotified: 0,
    dividendsFound: 0,
    errors: [] as string[],
  };

  try {
    // ── 1. Fetch all users with dividend_reminder enabled ──────────────────
    // dividend_reminder defaults to true when not set
    const { data: users, error: usersErr } = await supabase
      .from('users')
      .select('id, settings')
      .or('settings->notifications->dividend_reminder.is.null,settings->notifications->dividend_reminder.eq.true') as unknown as
      { data: Array<{ id: string; settings: Record<string, unknown> | null }> | null; error: unknown };

    if (usersErr || !users?.length) {
      return NextResponse.json({ ...summary, message: 'No eligible users' });
    }

    // ── 2. Collect tracked symbols per user ────────────────────────────────
    const eligibleUserIds = new Set(users.map((u) => u.id));

    const [watchlistRes, holdingsRes] = await Promise.all([
      supabase
        .from('user_watchlist')
        .select('user_id, symbol, company_name')
        .eq('alerts_enabled', true) as unknown as Promise<{ data: Array<{ user_id: string; symbol: string; company_name: string }> | null }>,
      supabase
        .from('user_holdings')
        .select('user_id, symbol, company_name')
        .eq('alerts_enabled', true) as unknown as Promise<{ data: Array<{ user_id: string; symbol: string; company_name: string }> | null }>,
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

    // ── 3. Fetch the dividends calendar for the target day (ONE call) ──────
    const targetDate = addDays(todayET(), REMINDER_DAYS_AHEAD);

    // `[]` means the day genuinely has no ex-dividend events; `null` means it
    // could not be filled (fetch failed, or the credit budget was exhausted).
    // Collapsing those two would turn an outage into a silent "nothing today"
    // and skip everyone with no error recorded — same reasoning as the
    // earnings-upcoming cron.
    const calendar = await getCalendarDay<DividendsCalendarItem>('dividends', targetDate);
    if (!calendar) {
      summary.errors.push(`Dividends calendar unavailable for ${targetDate} (fetch failed or budget exhausted)`);
      return NextResponse.json(summary);
    }
    summary.dividendsFound = calendar.length;

    if (calendar.length === 0) {
      return NextResponse.json({ ...summary, message: `No ex-dividend events on ${targetDate}` });
    }

    // Build lookup: symbol → ex-date. This global-feed Map is never iterated,
    // only looked up against each user's own (small) tracked-symbol set below.
    const dividendMap = new Map<string, string>();
    for (const d of calendar) {
      if (!dividendMap.has(d.symbol)) dividendMap.set(d.symbol, d.ex_dividend_date);
    }

    // ── 4. For each user — find their stocks going ex-dividend ─────────────
    summary.usersChecked = userSymbols.size;

    for (const [userId, symbolMap] of userSymbols.entries()) {
      const upcoming: DividendItem[] = [];

      for (const [symbol, companyName] of symbolMap.entries()) {
        const exDate = dividendMap.get(symbol);
        if (exDate) upcoming.push({ symbol, companyName, exDate });
      }

      if (upcoming.length === 0) continue;

      const created = await createDividendReminderNotification(userId, upcoming);
      if (created) summary.usersNotified++;
    }
  } catch (err) {
    summary.errors.push(String(err));
  }

  return NextResponse.json(summary);
}
