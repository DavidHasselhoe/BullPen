import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/logger';
import { getStockQuotes } from '@/lib/twelvedata/twelvedata-client';
import { rget, rset } from '@/lib/cache/redis-cache';
import { tryReserveOrganicCredits } from '@/lib/twelvedata/credit-budget';

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

/**
 * GET /api/currency/rates
 * Daily rates from Frankfurter (cached an hour in Redis, kept in Supabase under
 * their real date for /historical), with the USD and EUR pairs swapped for live
 * TwelveData quotes when available.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const base = (searchParams.get('base') || 'USD').toUpperCase();
    // It ends up in a Redis key, a TwelveData symbol and the Frankfurter URL.
    if (!/^[A-Z]{3}$/.test(base)) {
      return NextResponse.json({ success: false, error: 'Invalid base currency' }, { status: 400 });
    }
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

    return NextResponse.json({
      success: true,
      base: daily.base,
      date: daily.date,
      rates: live ? withLive(base, daily.rates, live) : daily.rates,
      cached,
      live: !!live,
    });
  } catch (error) {
    logger.error('Error fetching exchange rates', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
