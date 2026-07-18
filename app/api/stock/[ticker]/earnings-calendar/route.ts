import { NextRequest, NextResponse } from 'next/server';
import { getEarningsCalendar, TwelveDataRateLimitError } from '@/lib/market-data';
import { logger } from '@/lib/utils/logger';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ ticker: string }> }
) {
  const params = await context.params;
  const ticker = params.ticker?.toUpperCase();

  if (!ticker) {
    return NextResponse.json(
      { success: false, error: 'Ticker parameter required' },
      { status: 400 }
    );
  }

  try {
    // Honor caller-supplied range (e.g. EarningsCalendar requests ~15 months
    // back for its "Recent Reports" history); default to today → +90d.
    const fromParam = request.nextUrl.searchParams.get('from');
    const toParam = request.nextUrl.searchParams.get('to');

    const defaultTo = new Date();
    defaultTo.setDate(defaultTo.getDate() + 90);

    const fromStr = fromParam || new Date().toISOString().split('T')[0];
    const toStr = toParam || defaultTo.toISOString().split('T')[0];

    const earnings = await getEarningsCalendar(fromStr, toStr, ticker);

    return NextResponse.json({
      success: true,
      earnings,
    });
  } catch (error) {
    if (error instanceof TwelveDataRateLimitError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }
    // Other provider failures: return empty so UI can still show SEC-reported dates
    logger.warn(`[earnings-calendar] Failed for ${ticker}`, { error });
    return NextResponse.json({ success: true, earnings: [] });
  }
}
