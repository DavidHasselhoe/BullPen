import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { batchFetch, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { rget, rset } from '@/lib/cache/redis-cache';
import { createServerClient } from '@/lib/supabase/client';
import { getExchangesForTickers } from '@/lib/market/ticker-exchange-map';
import { getClosedHolidays } from '@/lib/market/exchange-holidays';
import {
  computeDailyPerformance,
  type HoldingInput,
  type SaleInput,
  type SymbolCloses,
} from '@/lib/holdings/daily-performance';
import {
  addDays,
  currentMonthKey,
  isValidMonthKey,
  monthRange,
  todayET,
} from '@/lib/dates/calendar-format';

interface TsValue { datetime: string; close: string }
interface TsResponse { values?: TsValue[]; status?: string }

/**
 * A completed month's daily closes never change again, split re-adjustment
 * aside — so they cache for a day. The current month gains a bar at each
 * close and its last bar moves intraday, hence the short TTL.
 */
const TTL_PAST_MONTH = 24 * 60 * 60;
const TTL_CURRENT_MONTH = 10 * 60;

/** TwelveData's /batch cap is ~120 requests; 100 matches the SEED_CHUNK used elsewhere. */
const BATCH_CHUNK = 100;

/**
 * Days of runway before the month starts, so day 1 has a previous close to
 * diff against. Seven covers a long weekend plus a holiday.
 */
const LOOKBACK_DAYS = 7;

async function handler(
  request: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const month = new URL(request.url).searchParams.get('month') ?? currentMonthKey();

  if (!isValidMonthKey(month)) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'invalid_month' }, { status: 400 })
    );
  }

  const { first, last } = monthRange(month);
  const today = todayET();
  const windowStart = addDays(first, -LOOKBACK_DAYS);
  const windowEnd = last < today ? last : today;

  // Month lies entirely in the future — nothing to price.
  if (windowEnd < windowStart) {
    return addSecurityHeaders(NextResponse.json({ success: true, month, days: [] }));
  }

  const supabase = createServerClient();

  const [{ data: holdingRows }, { data: saleRows }] = await Promise.all([
    supabase
      .from('user_holdings')
      .select('symbol, company_name, quantity, date_purchased, created_at')
      .eq('user_id', session.userId),
    supabase
      .from('holding_sales')
      .select('symbol, sale_date, quantity_sold')
      .eq('user_id', session.userId),
  ]);

  // Symbols are upper-cased once here so holdings, sales, cache keys and the
  // closes map all agree — the computation looks closes up by the holding's own
  // symbol, so a casing mismatch would silently price nothing.
  const holdings: HoldingInput[] = ((holdingRows ?? []) as HoldingInput[]).map((h) => ({
    ...h,
    symbol: h.symbol.toUpperCase(),
  }));
  const sales: SaleInput[] = ((saleRows ?? []) as SaleInput[]).map((s) => ({
    ...s,
    symbol: s.symbol.toUpperCase(),
  }));

  // A position sold to zero this month still has days worth showing before the
  // sale, and its user_holdings row may be gone entirely. Union the two sources
  // so those days don't silently vanish from the calendar.
  const symbols = new Set<string>();
  for (const h of holdings) {
    if ((h.quantity ?? 0) > 0) symbols.add(h.symbol);
  }
  const salesInWindow = new Map<string, SaleInput[]>();
  for (const s of sales) {
    if (s.sale_date >= windowStart) {
      symbols.add(s.symbol);
      const list = salesInWindow.get(s.symbol);
      if (list) list.push(s);
      else salesInWindow.set(s.symbol, [s]);
    }
  }

  if (symbols.size === 0) {
    return addSecurityHeaders(NextResponse.json({ success: true, month, days: [] }));
  }

  // Synthesise a zero-quantity holding for symbols that only survive in
  // holding_sales — the shares they held before the sale get reconstructed by
  // backing the sales out, exactly as for a surviving row.
  const known = new Set(holdings.map((h) => h.symbol));
  for (const [symbol, symbolSales] of salesInWindow) {
    if (known.has(symbol)) continue;
    const earliest = symbolSales.reduce((a, b) => (a.sale_date <= b.sale_date ? a : b));
    holdings.push({
      symbol,
      company_name: null,
      quantity: 0,
      date_purchased: null,
      created_at: `${earliest.sale_date}T00:00:00Z`,
    });
  }

  const symbolList = [...symbols];
  const ttl = month === currentMonthKey() ? TTL_CURRENT_MONTH : TTL_PAST_MONTH;

  // Same exchange_holidays table and `type === 'closed'` rule the Market Hours
  // widget uses (see lib/market/market-status.ts), so a blank calendar cell and
  // "market closed" always agree. Fired alongside the price fetch below rather
  // than awaited here, since it's independent of it.
  const holidaysPromise = getClosedHolidays(getExchangesForTickers(symbolList), first, last);

  const cacheHits = await Promise.all(
    symbolList.map(async (symbol) => ({
      symbol,
      cached: await rget<SymbolCloses[]>(`dailycloses:v2:${symbol}:${month}`),
    }))
  );

  const closes: Record<string, SymbolCloses[]> = {};
  const missing: string[] = [];
  for (const { symbol, cached } of cacheHits) {
    if (cached && cached.length > 0) closes[symbol] = cached;
    else missing.push(symbol);
  }

  if (missing.length > 0) {
    const apiKey = process.env.TWELVE_DATA_API_KEY ?? '';
    try {
      for (let i = 0; i < missing.length; i += BATCH_CHUNK) {
        const chunk = missing.slice(i, i + BATCH_CHUNK);
        const requests: Record<string, string> = {};
        for (const symbol of chunk) {
          // end_date is EXCLUSIVE for daily bars — verified against the API:
          // requesting end_date=2026-06-30 returns through 06-29 only. Passing
          // windowEnd directly silently drops the last day of every month.
          requests[symbol] =
            `/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day` +
            `&start_date=${windowStart}&end_date=${addDays(windowEnd, 1)}` +
            `&order=ASC&apikey=${apiKey}`;
        }

        const raw = await batchFetch<TsResponse>(requests);

        for (const [symbol, data] of Object.entries(raw)) {
          if (!Array.isArray(data?.values)) continue;
          const series: SymbolCloses[] = [];
          for (const v of data.values) {
            const close = parseFloat(v.close);
            // TwelveData returns daily datetimes as plain YYYY-MM-DD.
            if (!isNaN(close)) series.push({ date: v.datetime.slice(0, 10), close });
          }
          if (series.length === 0) continue;
          series.sort((a, b) => a.date.localeCompare(b.date));
          closes[symbol] = series;
          void rset(`dailycloses:v2:${symbol}:${month}`, series, ttl);
        }
      }
    } catch (error) {
      if (error instanceof TwelveDataRateLimitError) {
        // Status 200 with a gated marker so the widget renders a plan-gated
        // message rather than an error state, and nothing retries into the limit.
        return addSecurityHeaders(
          NextResponse.json({ success: false, error: 'plan_restricted' }, { status: 200 })
        );
      }
      // Non-fatal: fall through and compute from whatever the cache gave us, so
      // a single bad symbol doesn't blank the whole month.
      if (Object.keys(closes).length === 0) {
        return addSecurityHeaders(
          NextResponse.json({ success: false, error: 'unavailable' }, { status: 200 })
        );
      }
    }
  }

  const days = computeDailyPerformance(holdings, sales, closes, {
    from: first,
    to: windowEnd,
  });
  const holidays = await holidaysPromise;

  return addSecurityHeaders(
    NextResponse.json(
      { success: true, month, days, holidays },
      { headers: { 'Cache-Control': 'private, max-age=60' } }
    )
  );
}

export const GET = withAuth(handler, { rateLimit: { windowMs: 60_000, maxRequests: 60 } });
