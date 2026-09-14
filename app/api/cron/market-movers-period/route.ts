/**
 * Instagram Weekly + Monthly Market Movers
 * GET /api/cron/market-movers-period
 *
 * Runs every weekday at 21:40 UTC (vercel.json), ten minutes after
 * market-movers-daily so the two don't queue on the same cron credit budget.
 * Most runs exit before spending anything: it only generates on the last
 * trading day of a week (Friday, or Thursday when Friday is a closure) and/or
 * of a month (whatever weekday that falls on, e.g. Fri Feb 27 2026 or Mon Aug
 * 31 2026). One closes fetch serves both editions when a day ends a week and a
 * month.
 *
 * Same carousel and pipeline as the daily post otherwise: stage in
 * instagram_posts, preview in Discord, publish immediately.
 *
 * Manual runs: ?period=week|month forces that edition regardless of the date,
 * ?date=YYYY-MM-DD overrides today (within the ~40 sessions of closes fetched),
 * ?dryRun=true stages under a "-dryrun" key with no Discord and no publish.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logSecurityEvent } from '@/lib/security/security-events';
import { createServerClient } from '@/lib/supabase/client';
import { getClosedHolidays } from '@/lib/market/exchange-holidays';
import { fmtMonthLabel, monthKeyOf, todayET } from '@/lib/dates/calendar-format';
import { SIGNIFICANT_TICKERS } from '@/lib/market-data/significant-tickers';
import { fetchDailyCloses, generateMarketMoversContent } from '@/lib/instagram/content/market-movers';
import { formatWeekLabel } from '@/lib/instagram/content/shared';
import { isoWeekKey } from '@/lib/instagram/period-key';
import { stageAndPublishMovers } from '@/lib/instagram/movers-stage';
import { isLastTradingDayOf, periodEnd, periodMoves, periodStart, type MoversPeriod } from '@/lib/instagram/movers-period';

// Same budget as market-movers-daily: the closes fetch is ~518 credits against
// the shared cron credit share, so it spans more than a minute on its own.
export const maxDuration = 300;

const CONTENT_TYPE: Record<MoversPeriod, string> = {
  week: 'market_movers_weekly',
  month: 'market_movers_monthly',
};

/** A ranking over a fraction of the index would name the wrong movers, e.g.
 *  when today's bars haven't landed yet for most tickers. */
const MIN_RANKED = Math.floor(SIGNIFICANT_TICKERS.size / 2);

function periodKeyFor(period: MoversPeriod, date: string): string {
  return period === 'week' ? isoWeekKey(new Date(`${date}T12:00:00Z`)) : monthKeyOf(date);
}

function dateLabelFor(period: MoversPeriod, date: string): string {
  return period === 'week' ? formatWeekLabel(periodStart('week', date), date) : fmtMonthLabel(monthKeyOf(date));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/market-movers-period' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const forced = sp.get('period');
  const date = sp.get('date') ?? todayET();
  const dryRun = sp.get('dryRun') === 'true';
  if ((forced && forced !== 'week' && forced !== 'month') || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ success: false, error: 'invalid_params' }, { status: 400 });
  }

  // ── Which editions end today ─────────────────────────────────────────────
  // A week can run into the next month (Thu Apr 30 2026), so the closure
  // lookup spans whichever period ends later.
  const lookupEnd = [periodEnd('week', date), periodEnd('month', date)].sort()[1];
  const holidays = await getClosedHolidays(['NYSE', 'NASDAQ'], date, lookupEnd);
  const closed = new Set(holidays.map((h) => h.date));
  const periods: MoversPeriod[] = forced
    ? [forced as MoversPeriod]
    : (['week', 'month'] as const).filter((p) => isLastTradingDayOf(p, date, closed));

  if (periods.length === 0) {
    return NextResponse.json({ success: true, skipped: true, date, reason: 'not_period_end' });
  }

  // ── Idempotency, before paying for data ──────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServerClient() as any; // instagram_posts isn't in the generated Database type yet
  const results: Record<string, unknown>[] = [];
  const todo: { period: MoversPeriod; periodKey: string }[] = [];
  for (const period of periods) {
    // A dry run stages under its own key so it can never block the real post.
    const periodKey = periodKeyFor(period, date) + (dryRun ? '-dryrun' : '');
    const { data: existing } = await db
      .from('instagram_posts')
      .select('id, status')
      .eq('content_type', CONTENT_TYPE[period])
      .eq('period_key', periodKey)
      .maybeSingle();
    if (existing) {
      results.push({ period, periodKey, skipped: true, reason: 'already_exists', status: existing.status });
    } else {
      todo.push({ period, periodKey });
    }
  }
  if (todo.length === 0) return NextResponse.json({ success: true, date, results });

  // ── One closes fetch for every edition due today ─────────────────────────
  const closes = await fetchDailyCloses();

  for (const { period, periodKey } of todo) {
    const moves = periodMoves(closes, period, date);
    if (moves.length < MIN_RANKED) {
      results.push({ period, periodKey, error: 'insufficient_data', ranked: moves.length });
      continue;
    }
    try {
      const content = await generateMarketMoversContent(date, {
        period: { kind: period, moves, dateLabel: dateLabelFor(period, date) },
      });
      const staged = await stageAndPublishMovers({ contentType: CONTENT_TYPE[period], periodKey, content, dryRun });
      const top = content.winners[0];
      const bottom = content.losers[0];
      results.push({
        period,
        periodKey,
        postId: staged.postId,
        dateLabel: content.dateLabel,
        ranked: moves.length,
        topGainer: `${top.symbol} +${top.changePercent.toFixed(2)}%`,
        topLoser: `${bottom.symbol} ${bottom.changePercent.toFixed(2)}%`,
        previewLinks: staged.previewLinks,
        publish: staged.publish,
      });
    } catch (err) {
      console.error(`[market-movers-period] ${period} failed:`, err);
      results.push({ period, periodKey, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const failed = results.some((r) => 'error' in r);
  return NextResponse.json({ success: !failed, date, results }, { status: failed ? 500 : 200 });
}
