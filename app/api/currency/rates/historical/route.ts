import { NextRequest, NextResponse } from 'next/server';
import { getHistoricalRates } from '@/lib/currency/historical-rates';

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
  if (date > new Date().toISOString().slice(0, 10)) {
    return NextResponse.json({ success: false, error: 'date must not be in the future' }, { status: 400 });
  }

  const rates = await getHistoricalRates(date);
  if (!rates) {
    return NextResponse.json({ success: false, error: 'Failed to fetch historical rates' }, { status: 502 });
  }
  return NextResponse.json({ success: true, base: 'USD', date, rates });
}
