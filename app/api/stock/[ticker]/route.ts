import { NextRequest, NextResponse } from 'next/server';
import { getCompanyByTicker } from '@/lib/ingestion/database';
import type { Company } from '@/lib/types/database';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ ticker: string }> }
) {
  // Next.js 15+ requires await for params
  const params = await context.params;
  const ticker = params.ticker?.toUpperCase();

  if (!ticker) {
    return NextResponse.json(
      { success: false, error: 'Ticker parameter required' },
      { status: 400 }
    );
  }

  try {
    const result = await getCompanyByTicker(ticker);

    if (!result.success || !result.data) {
      return NextResponse.json(
        { success: false, error: `Company ${ticker} not found` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      company: result.data as Company,
    });
  } catch (error) {
    console.error('Error fetching company:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
