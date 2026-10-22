import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { getLatestRates } from '@/lib/currency/latest-rates';

/**
 * GET /api/currency/rates?base=NOK
 * Today's rates (daily ECB table, live USD/EUR pairs): see getLatestRates.
 */
export async function GET(request: NextRequest) {
  try {
    const base = (request.nextUrl.searchParams.get('base') || 'USD').toUpperCase();
    // It ends up in a Redis key, a TwelveData symbol and the Frankfurter URL.
    if (!/^[A-Z]{3}$/.test(base)) {
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
