import { createServerClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/logger';
import { getStockQuotes } from '@/lib/twelvedata/twelvedata-client';
import { rget, rset } from '@/lib/cache/redis-cache';
import { tryReserveOrganicCredits } from '@/lib/twelvedata/credit-budget';
import type { ExchangeRates } from '@/lib/currency/currency-conversion';
import { getCachedStale } from '@/lib/cache/market-data-cache';
import { rowsToUsd, valuationFromStatements, type StatementFx, type StatementValuation } from '@/lib/currency/statement-fx';
import type { IncomeStatementPeriod, BalanceSheetPeriod } from '@/lib/twelvedata/twelvedata-client';

// Frankfurter is the ECB reference rate, fixed once a day around 16:00 CET, so
// every morning it still converts at yesterday's rate: 0.2% off Nordnet on
// 10-22. Today's values want the live rate, so the pairs a holding's value goes
// through (USD→base for USD listings, USD→EUR for EUR listings) come from a
// TwelveData quote at 1 credit each, shared by everyone for a minute. The rest
// of the table stays on the daily fix, and so does anything dated (purchase-date
// rates use /historical).
const LIVE_TTL_SECONDS = 60;

/** Live units of each code per 1 USD, e.g. { NOK: 9.3754, EUR: 0.8926 }; null when unavailable. */
async function liveUsdRates(base: string): Promise<Record<string, number> | null> {
  const codes = [...new Set([base, 'EUR'])].filter((c) => c !== 'USD').sort();
  const key = `fx:live:${codes.join(',')}`;
  const cached = await rget<Record<string, number>>(key);
  if (cached) return cached;
  if (!process.env.TWELVE_DATA_API_KEY || !(await tryReserveOrganicCredits(codes.length))) return null;
  try {
    const quotes = await getStockQuotes(codes.map((c) => `USD/${c}`));
    const out: Record<string, number> = {};
    for (const c of codes) {
      const q = quotes.get(`USD/${c}`);
      if (q && q.c > 0) out[c] = q.c;
    }
    if (Object.keys(out).length === 0) return null;
    void rset(key, out, LIVE_TTL_SECONDS);
    return out;
  } catch (err) {
    logger.warn('[currency-rates] live FX unavailable, using the daily fix', { error: err });
    return null;
  }
}

/** Overwrites the daily-fix rates (units per 1 `base`) with live ones where we have them. */
function withLive(base: string, rates: Record<string, number>, live: Record<string, number>): Record<string, number> {
  const basePerUsd = base === 'USD' ? 1 : live[base];
  if (!basePerUsd) return rates;
  const out = { ...rates };
  if (base !== 'USD') out.USD = 1 / basePerUsd;
  for (const [code, perUsd] of Object.entries(live)) {
    if (code !== base) out[code] = perUsd / basePerUsd;
  }
  return out;
}

// The ECB publishes once a business day around 16:00 CET, so Frankfurter's
// latest table only changes then. Cached by age, not date: its date is
// yesterday's every morning (Friday's on a weekend), so a lookup by today's date
// missed until 16:00 and called Frankfurter on every request, and could also
// hit rows /historical saved under today's date, then serve them all day.
const DAILY_TTL_SECONDS = 60 * 60;

interface DailyRates { base: string; date: string; rates: Record<string, number> }

export interface LatestRates extends ExchangeRates {
  /** Served from the hour-long daily-rate cache rather than a fresh Frankfurter call. */
  cached: boolean;
  /** USD/EUR pairs are live TwelveData quotes, not the daily fix. */
  live: boolean;
}

/**
 * Today's rates with `base` as the base (units per 1 base): the daily ECB table
 * from Frankfurter, with the USD and EUR pairs swapped for live quotes when
 * available. Server-side; the client reads it through /api/currency/rates.
 * `base` must already be a validated 3-letter code. Throws when Frankfurter fails.
 */
export async function getLatestRates(base: string): Promise<LatestRates> {
  const livePromise = liveUsdRates(base);

  const cacheKey = `fx:daily:${base}`;
  let daily = await rget<DailyRates>(cacheKey);
  const cached = !!daily;
  if (!daily) {
    const response = await fetch(`https://api.frankfurter.dev/v1/latest?base=${base}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`Frankfurter API error: ${response.statusText}`);
    }
    const data: DailyRates = await response.json();
    daily = { base: data.base, date: data.date, rates: data.rates };
    void rset(cacheKey, daily, DAILY_TTL_SECONDS);

    const { error: insertError } = await createServerClient()
      .from('currency_exchange_rates')
      .upsert(
        Object.entries(data.rates).map(([currency, rate]) => ({
          base_currency: base,
          target_currency: currency,
          rate: Number(rate),
          date: data.date,
        })),
        { onConflict: 'base_currency,target_currency,date' },
      );
    if (insertError) logger.error('Error caching exchange rates', insertError);
  }
  const live = await livePromise;

  return {
    base: daily.base,
    date: daily.date,
    rates: live ? withLive(base, daily.rates, live) : daily.rates,
    cached,
    live: !!live,
  };
}

// A statement is a quarter old by the time anyone reads it, so the rate it is
// converted at only needs to be fresh to the day. Kept a week so a failed
// refresh falls back to the last rate instead of leaving the card empty.
const STATEMENT_FX_FRESH_MS = 6 * 60 * 60 * 1000;
const STATEMENT_FX_KEEP_SECONDS = 7 * 24 * 60 * 60;

/** USD rate for converting a statement reported in `currency`; null when there is none to be had. */
async function statementFx(currency: string): Promise<StatementFx | null> {
  const key = `fx:statement:${currency}`;
  const cached = await rget<StatementFx & { at: number }>(key);
  const last = cached && { from: cached.from, rate: cached.rate, date: cached.date };
  if (cached && Date.now() - cached.at < STATEMENT_FX_FRESH_MS) return last;
  if (process.env.TWELVE_DATA_API_KEY && (await tryReserveOrganicCredits(1))) {
    try {
      const q = (await getStockQuotes([`USD/${currency}`])).get(`USD/${currency}`);
      if (q && q.c > 0) {
        const fx = { from: currency, rate: q.c, date: new Date().toISOString().slice(0, 10) };
        void rset(key, { ...fx, at: Date.now() }, STATEMENT_FX_KEEP_SECONDS);
        return fx;
      }
    } catch (err) {
      logger.warn('[statement-fx] USD rate unavailable', { currency, error: err });
    }
  }
  return last;
}

/**
 * Statement rows (income, balance or cash flow) in USD, for every caller that
 * shows them: the Financials card, Revenue Flow and Bull. The cache keeps the
 * rows as TwelveData sent them; conversion happens here, on the way out.
 *
 * `currency` is what the returned rows are in: USD, or the reporting currency
 * when no rate could be had (then `fx` is null and the rows are untouched).
 */
export async function statementsInUsd<T extends object>(
  symbol: string,
  rows: T[],
): Promise<{ rows: T[]; currency: string; fx: StatementFx | null }> {
  // Balance sheet and cash flow rows cached before they carried a currency
  // take it from the same company's income statement.
  const tagged = (rows as { reported_currency?: string | null }[]).find((r) => r.reported_currency)?.reported_currency;
  const currency = tagged
    ?? (await getCachedStale<{ reported_currency?: string | null }[]>(`financials:${symbol.toUpperCase()}:income:quarterly`))?.[0]?.reported_currency
    ?? 'USD';
  if (currency === 'USD' || rows.length === 0) return { rows, currency: 'USD', fx: null };
  const fx = await statementFx(currency);
  return fx ? { rows: rowsToUsd(rows, fx), currency: 'USD', fx } : { rows, currency, fx: null };
}

/**
 * Replaces TwelveData's P/S, P/B, EV and EV/EBITDA in a raw /statistics
 * `valuations_metrics` block with values built from the company's own
 * statements, for companies that report in a currency other than USD (see
 * valuationFromStatements). Every writer of statistics calls this before it
 * maps the block, so the stock page, screener, health score and Bull agree.
 * US filers, and rows cached before they carried a currency, are left alone.
 * Pass `statements` when the caller already holds the quarterly rows.
 */
export async function fixForeignValuation(
  symbol: string,
  v: (Partial<StatementValuation> & { market_capitalization?: number | null }) | undefined,
  statements?: { income: IncomeStatementPeriod[]; balance: BalanceSheetPeriod[] },
): Promise<void> {
  if (!v) return;
  const sym = symbol.toUpperCase();
  const income = statements?.income
    ?? (await getCachedStale<IncomeStatementPeriod[]>(`financials:${sym}:income:quarterly`)) ?? [];
  const currency = income.find((r) => r.reported_currency)?.reported_currency;
  if (!currency || currency === 'USD') return;
  const balance = statements?.balance
    ?? (await getCachedStale<BalanceSheetPeriod[]>(`financials:${sym}:balance:quarterly`)) ?? [];
  const fx = await statementFx(currency);
  // Without a rate the statements can't be set against a USD price, and no value beats a wrong one.
  Object.assign(v, fx
    ? valuationFromStatements(v.market_capitalization, rowsToUsd(income, fx), rowsToUsd(balance, fx))
    : { price_to_sales_ttm: null, price_to_book_mrq: null, enterprise_value: null, enterprise_to_ebitda: null });
}
