import { NextRequest, NextResponse } from 'next/server';
import { getStockQuote, TwelveDataRateLimitError } from '@/lib/market-data';
import { logger } from '@/lib/utils/logger';
import { slugToSymbol } from '@/lib/assets/asset-type';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ ticker: string }> }
) {
  try {
    const params = await context.params;
    const ticker = slugToSymbol(params.ticker ?? '').toUpperCase();

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
    if (error instanceof TwelveDataRateLimitError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }
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