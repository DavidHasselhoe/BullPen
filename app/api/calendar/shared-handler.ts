/**
 * Shared request handler for the four /api/calendar/* routes.
 *
 * All four had the same body (range cache-read → provider fetch → universe
 * filter → attachMarketCap → range cache-write). That per-range caching is
 * what let the /earnings_calendar truncation bug persist invisibly: a
 * truncated response was cached under the range key for 24h and served as if
 * complete. Everything now reads through lib/market-data/calendar-days.ts,
 * which caches per DAY, so week/month/list views share entries and a range
 * can never be stored as a single opaque blob again.
 */

import { NextRequest, NextResponse } from 'next/server';
import { TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { addSecurityHeaders } from '@/lib/security/api-security';
import { getCalendarRange, type CalendarKind, type CalendarRow } from '@/lib/market-data/calendar-days';
import { attachCalendarMeta } from '@/lib/market-data/calendar-market-cap';
import { getActiveUniverse } from '@/lib/market-data/screener-universe';
import { todayET } from '@/lib/dates/calendar-format';

/** Rows shown per day after ranking. Keeps a month payload bounded. */
const DEFAULT_PER_DAY = 60;
const MAX_PER_DAY = 200;

export interface CalendarRouteOptions {
  kind: CalendarKind;
  /**
   * Restrict to the actively-tracked screener universe (~1,200 tier-1
   * tickers). False only for IPOs, whose pre-listing tickers exist in no
   * universe by definition.
   */
  filterToUniverse: boolean;
  /** The row field that decides which day a row belongs to. */
  dateField: 'date' | 'ex_dividend_date';
}

function parsePerDay(raw: string | null): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PER_DAY;
  return Math.min(n, MAX_PER_DAY);
}

export async function handleCalendarRequest(
  request: NextRequest,
  opts: CalendarRouteOptions
): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const from = searchParams.get('from') ?? todayET();
  const to = searchParams.get('to') ?? from;
  const perDay = parsePerDay(searchParams.get('per_day'));

  try {
    const [{ byDate, missingDates, partial }, universe] = await Promise.all([
      getCalendarRange<CalendarRow>(opts.kind, from, to),
      opts.filterToUniverse ? getActiveUniverse() : Promise.resolve<string[]>([]),
    ]);

    const universeSet = opts.filterToUniverse ? new Set(universe) : null;

    // Enrich everything first: market cap is what we rank by, so it has to be
    // attached before the per-day cap is applied or the cap would keep an
    // arbitrary slice instead of the largest companies.
    const allRows: CalendarRow[] = [];
    for (const rows of byDate.values()) {
      for (const row of rows) {
        if (universeSet && !universeSet.has(row.symbol)) continue;
        allRows.push(row);
      }
    }

    const enriched = await attachCalendarMeta(allRows);

    // Rank by market cap desc (nulls last), symbol as a stable tiebreak.
    enriched.sort((a, b) => {
      const ac = a.market_cap ?? -1;
      const bc = b.market_cap ?? -1;
      if (ac !== bc) return bc - ac;
      return a.symbol.localeCompare(b.symbol);
    });

    // Cap per day, and report each day's true total so the UI's "+N more"
    // reflects reality rather than the truncated array length.
    //
    // Also collapses repeats of the same ticker on the same day. The dividends
    // feed lists preferred share classes under the parent's base ticker, so
    // Citigroup arrives as four separate "C" rows with different amounts —
    // which, ranked by the parent's market cap, filled the top of a day's cell
    // with the same logo four times and pushed out four genuinely different
    // companies. One row per company per day; the day dialog is where the
    // individual records belong.
    const dayTotals: Record<string, number> = {};
    const perDayCount: Record<string, number> = {};
    const seen = new Set<string>();
    const data: typeof enriched = [];

    for (const row of enriched) {
      const day = (row as unknown as Record<string, string>)[opts.dateField];
      if (!day) continue;
      const dedupeKey = row.symbol ? `${day}|${row.symbol}` : '';
      if (dedupeKey && seen.has(dedupeKey)) continue;
      if (dedupeKey) seen.add(dedupeKey);

      dayTotals[day] = (dayTotals[day] ?? 0) + 1;
      if ((perDayCount[day] ?? 0) >= perDay) continue;
      perDayCount[day] = (perDayCount[day] ?? 0) + 1;
      data.push(row);
    }

    return addSecurityHeaders(
      NextResponse.json(
        { success: true, data, day_totals: dayTotals, partial, missing_dates: missingDates },
        {
          headers: {
            // Short CDN window: the per-day Supabase cache is the real cache,
            // and a partial response must be revalidated quickly so progressive
            // fill-in actually converges.
            'Cache-Control': partial
              ? 'public, s-maxage=10, stale-while-revalidate=30'
              : 'public, s-maxage=900, stale-while-revalidate=3600',
          },
        }
      )
    );
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 })
      );
    }
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[calendar/${opts.kind}] ${from}..${to} failed:`, msg);
    return addSecurityHeaders(NextResponse.json({ success: false, error: msg }, { status: 500 }));
  }
}
