import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { getLatestRates } from '@/lib/currency/latest-rates';
import { CURRENCY_CODES } from '@/lib/currency/currency-conversion';

/**
 * GET /api/currency/rates?base=NOK
 * Today's rates (daily ECB table, live USD/EUR pairs): see getLatestRates.
 */
export async function GET(request: NextRequest) {
  try {
    const base = (request.nextUrl.searchParams.get('base') || 'USD').toUpperCase();
    // Only the currencies the app offers: this route is public, and each new
    // base costs live TwelveData credits, so any 3 letters let a script spend
    // the shared budget base by base. It also reaches a Redis key and a URL.
    if (!(CURRENCY_CODES as readonly string[]).includes(base)) {
      return NextResponse.json({ success: false, error: 'Invalid base currency' }, { status: 400 });
    }
    return NextResponse.json({ success: true, ...(await getLatestRates(base)) });
  } catch (error) {
    logger.error('Error fetching exchange rates', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
