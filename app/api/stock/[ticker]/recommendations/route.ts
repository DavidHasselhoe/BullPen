import { NextRequest, NextResponse } from 'next/server';
import { getRecommendationTrends, TwelveDataRateLimitError } from '@/lib/market-data';

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

    const trends = await getRecommendationTrends(ticker);

    return NextResponse.json({
      success: true,
      trends,
    });
  } catch (error) {
    if (error instanceof TwelveDataRateLimitError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }
    console.error('Error fetching recommendation trends:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
