import { NextRequest, NextResponse } from 'next/server';
import { getStockQuote } from '@/lib/finnhub/finnhub-client';
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

    const quote = await getStockQuote(ticker);

    return NextResponse.json({
      success: true,
      quote,
    });
  } catch (error) {
    logger.error('Error fetching stock quote', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}