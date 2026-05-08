import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';

/**
 * GET /api/currency/rates/historical?date=YYYY-MM-DD
 * Returns USD-base exchange rates for a historical date.
 * Checks the currency_exchange_rates cache first; falls back to Frankfurter.
 */
export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ success: false, error: 'date param required (YYYY-MM-DD)' }, { status: 400 });
  }

  // Don't allow future dates
  if (date > new Date().toISOString().slice(0, 10)) {
    return NextResponse.json({ success: false, error: 'date must not be in the future' }, { status: 400 });
  }

  try {
    const supabase = createServerClient();

    // Check cache for this date
    const { data: cached } = await supabase
      .from('currency_exchange_rates')
      .select('target_currency, rate')
      .eq('base_currency', 'USD')
      .eq('date', date);

    if (cached && cached.length > 0) {
      const rates: Record<string, number> = {};
      for (const row of cached) rates[row.target_currency] = Number(row.rate);
      return NextResponse.json({ success: true, base: 'USD', date, rates, cached: true });
    }

    // Fetch from Frankfurter historical API
    const res = await fetch(`https://api.frankfurter.dev/v1/${date}?base=USD`, {
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      return NextResponse.json({ success: false, error: 'Frankfurter API error' }, { status: 502 });
    }

    const data: { base: string; date: string; rates: Record<string, number> } = await res.json();

    // Cache asynchronously — don't block the response
    void supabase
      .from('currency_exchange_rates')
      .upsert(
        Object.entries(data.rates).map(([currency, rate]) => ({
          base_currency: 'USD',
          target_currency: currency,
          rate,
          date: data.date,
        })),
        { onConflict: 'base_currency,target_currency,date' }
      );

    return NextResponse.json({ success: true, base: 'USD', date: data.date, rates: data.rates, cached: false });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to fetch historical rates' }, { status: 500 });
  }
}
