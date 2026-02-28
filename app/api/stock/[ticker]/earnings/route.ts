import { NextRequest, NextResponse } from 'next/server';
import { getCompanyEarnings } from '@/lib/finnhub/finnhub-client';

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

    const earnings = await getCompanyEarnings(ticker, 8);

    return NextResponse.json({
      success: true,
      earnings,
    });
  } catch (error) {
    console.error('Error fetching company earnings:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
