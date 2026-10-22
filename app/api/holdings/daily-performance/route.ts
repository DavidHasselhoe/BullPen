import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { getMonthCloses, monthClosesKey, LOOKBACK_DAYS } from '@/lib/market-data/month-closes';
import { createServerClient } from '@/lib/supabase/client';
import { getExchangesForTickers } from '@/lib/market/ticker-exchange-map';
import { getClosedHolidays } from '@/lib/market/exchange-holidays';
import { getLatestRates } from '@/lib/currency/latest-rates';
import { listingToUsd } from '@/lib/currency/currency-conversion';
import { logger } from '@/lib/utils/logger';
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
      .select('symbol, company_name, quantity, date_purchased, created_at, trading_currency')
      .eq('user_id', session.userId),
    supabase
      .from('holding_sales')
      .select('symbol, sale_date, quantity_sold, trading_currency')
      .eq('user_id', session.userId),
  ]);

  // Closes come in each listing's own currency (EUR for a Frankfurt listing)
  // and the day sums run in USD. A surviving holding row wins over its sales.
  const listingCurrency = new Map<string, string>();
  for (const row of [...(saleRows ?? []), ...(holdingRows ?? [])] as { symbol: string; trading_currency: string | null }[]) {
    if (row.trading_currency) listingCurrency.set(row.symbol.toUpperCase(), row.trading_currency);
  }

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

  // Same exchange_holidays table and `type === 'closed'` rule the Market Hours
  // widget uses (see lib/market/market-status.ts), so a blank calendar cell and
  // "market closed" always agree. Fired alongside the price fetch below rather
  // than awaited here, since it's independent of it.
  const holidaysPromise = getClosedHolidays(getExchangesForTickers(symbolList), first, last);

  const closes: Record<string, SymbolCloses[]> = {};
  try {
    const result = await getMonthCloses(symbolList.map((symbol) => ({ symbol, month })));
    for (const symbol of symbolList) {
      const series = result.closes.get(monthClosesKey(symbol, month));
      if (series) closes[symbol] = series;
    }
    // Non-fatal: compute from whatever came back, so a single bad symbol
    // doesn't blank the whole month.
    if (result.incomplete && Object.keys(closes).length === 0) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'unavailable' }, { status: 200 })
      );
    }
  } catch (error) {
    if (error instanceof TwelveDataRateLimitError) {
      // Status 200 with a gated marker so the widget renders a plan-gated
      // message rather than an error state, and nothing retries into the limit.
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'plan_restricted' }, { status: 200 })
      );
    }
    throw error;
  }

  // Converted at today's rate, as the chart and the table do: each day's move
  // is the listing's own, not the currency's. Cached closes stay unconverted.
  if ([...listingCurrency.values()].some((c) => c !== 'USD')) {
    const rates = await getLatestRates('USD').catch((err) => {
      logger.warn('[daily-performance] no FX rates, non-USD listings summed as USD', { error: err });
      return null;
    });
    for (const [symbol, series] of Object.entries(closes)) {
      const fx = listingToUsd(listingCurrency.get(symbol), rates);
      if (fx !== 1) closes[symbol] = series.map((c) => ({ date: c.date, close: c.close * fx }));
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
