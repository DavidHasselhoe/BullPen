import { NextRequest, NextResponse } from 'next/server';
import { getEarningsCalendar } from '@/lib/finnhub/finnhub-client';
import { logger } from '@/lib/utils/logger';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ ticker: string }> }
) {
  try {
    const params = await context.params;
    const ticker = params.ticker?.toUpperCase();

    if (!ticker) {
      return NextResponse.json(
        { success: false, error: 'Ticker parameter required' },
        { status: 400 }
      );
    }

    // Get date range (next 90 days)
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + 90);

    const fromStr = from.toISOString().split('T')[0];
    const toStr = to.toISOString().split('T')[0];

    const earnings = await getEarningsCalendar(fromStr, toStr, ticker);

    return NextResponse.json({
      success: true,
      earnings,
    });
  } catch (error) {
    // Finnhub may fail (rate limit, etc.). Return empty so UI can still show SEC-reported dates.
    logger.warn(`[earnings-calendar] Finnhub failed for ${params?.ticker ?? 'unknown'}`, { error });
    return NextResponse.json({
      success: true,
      earnings: [],
    });
  }
}
