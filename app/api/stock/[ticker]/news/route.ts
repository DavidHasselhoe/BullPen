import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { getCompanyNews } from '@/lib/market-data';

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

    // Get date range (last 30 days)
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 30);

    const fromStr = from.toISOString().split('T')[0];
    const toStr = to.toISOString().split('T')[0];

    const news = await getCompanyNews(ticker, fromStr, toStr);

    return NextResponse.json({
      success: true,
      news: news.slice(0, 20), // Limit to 20 most recent
    });
  } catch (error) {
    logger.error('Error fetching company news', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
