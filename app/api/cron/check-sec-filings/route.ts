/**
 * SEC filing watcher: new quarters straight from the 10-Q/10-K
 * GET /api/cron/check-sec-filings[?dryRun=1]
 *
 * QStash, every 15 minutes. For Nasdaq-100 companies that reported in the
 * last 10 days and whose stored statements (TwelveData or SEC) don't include
 * the reported quarter yet, looks for the 10-Q/10-K on EDGAR and, once it is
 * there, stores the quarter from SEC's XBRL API and lays it into the cached
 * statements (lib/edgar/sec-statements.ts). A 10-Q reached EDGAR a median
 * 4.1h after the release for the Nasdaq-100's Q3 2026; TwelveData took days.
 *
 * Free: EDGAR only, no TwelveData credits, no AI. Nothing due costs three
 * cache reads. Each due company is one ~25KB submissions request until its
 * filing lands, then one companyfacts request. Requests are sequential and
 * paced well under SEC's 10/s limit.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withCronReport } from '@/lib/cron/report';
import { logSecurityEvent } from '@/lib/security/security-events';
import { getCalendarRange } from '@/lib/market-data/calendar-days';
import { getCachedManyStale } from '@/lib/cache/market-data-cache';
import { addDays, todayET } from '@/lib/dates/calendar-format';
import { NASDAQ100_TICKERS } from '@/lib/market-data/nasdaq100';
import { findPeriodicFiling, storeSecStatements, secStatementsKey, type SecStatements } from '@/lib/edgar/sec-statements';
import type { EarningsCalendarItem, IncomeStatementPeriod } from '@/lib/twelvedata/twelvedata-client';
import { sleep } from '@/lib/utils';

export const maxDuration = 60;

const LOOKBACK_DAYS = 10;
/** A quarter ending this close before a report is the one it reported; the quarter before ends 100+ days back. */
const REPORTED_WITHIN_DAYS = 100;
const BUDGET_MS = 45_000;

const daysBefore = (end: string, date: string) => (Date.parse(date) - Date.parse(end)) / 86_400_000;
const covers = (end: string | undefined, date: string) => end != null && daysBefore(end, date) >= -31 && daysBefore(end, date) < REPORTED_WITHIN_DAYS;

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/check-sec-filings' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const dryRun = new URL(request.url).searchParams.get('dryRun') === '1';
  const started = Date.now();

  // Newest report date per company in the universe.
  const today = todayET();
  const universe = new Set(NASDAQ100_TICKERS);
  const { byDate } = await getCalendarRange<EarningsCalendarItem>('earnings', addDays(today, -LOOKBACK_DAYS), today, { allowFetch: false });
  const reported = new Map<string, string>();
  for (const rows of byDate.values()) {
    for (const r of rows) {
      const sym = r.symbol?.toUpperCase();
      if (sym && universe.has(sym) && r.date > (reported.get(sym) ?? '')) reported.set(sym, r.date);
    }
  }

  const symbols = [...reported.keys()];
  const [sec, td] = await Promise.all([
    getCachedManyStale<SecStatements>(symbols.map(secStatementsKey)),
    getCachedManyStale<IncomeStatementPeriod[]>(symbols.map((s) => `financials:${s}:income:quarterly`)),
  ]);
  const due = symbols.filter((s) => {
    const date = reported.get(s)!;
    const tdNewest = td.get(`financials:${s}:income:quarterly`)?.find((r) => r.source !== 'sec' && r.revenue != null)?.fiscal_date;
    return !covers(sec.get(secStatementsKey(s))?.periodEnd, date) && !covers(tdNewest, date);
  });

  const stored: string[] = [];
  const waiting: string[] = [];
  const found: Record<string, string> = {};
  const errors: string[] = [];
  for (const sym of due) {
    if (Date.now() - started > BUDGET_MS) break;
    try {
      // A 10-Q filed the morning before a pre-market release still counts.
      const filing = await findPeriodicFiling(sym, addDays(reported.get(sym)!, -1));
      await sleep(150);
      if (!filing) { waiting.push(sym); continue; }
      found[sym] = `${filing.filing.form} ${filing.filing.reportDate} ${filing.filing.accessionNumber}`;
      if (dryRun) continue;
      if (await storeSecStatements(sym, filing)) stored.push(sym);
      else waiting.push(sym);
      await sleep(150);
    } catch (err) {
      errors.push(`${sym}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (errors.length) console.error('[check-sec-filings]', errors);
  // withCronReport turns each array into a `<key>_count` property.
  return NextResponse.json({ reported: symbols.length, due: due.length, ...(dryRun && { dryRun: true }), stored, waiting, found, errors });
}

export const GET = withCronReport('check-sec-filings', handleGET);
