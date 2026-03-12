import { NextRequest, NextResponse } from 'next/server';
import { getCompanyByTicker } from '@/lib/metrics/metrics-ui';
import { logger } from '@/lib/utils/logger';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const ticker = searchParams.get('ticker');

  if (!ticker) {
    return NextResponse.json(
      { success: false, error: 'Ticker parameter required' },
      { status: 400 }
    );
  }

  try {
    const company = await getCompanyByTicker(ticker);

    if (!company || !company.id) {
      return NextResponse.json(
        { success: false, error: `Company ${ticker} not found` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      companyId: company.id,
      companyName: company.name,
      ticker: company.ticker,
    });
  } catch (error) {
    logger.error('Error fetching company', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
