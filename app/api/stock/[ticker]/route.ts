import { NextRequest, NextResponse } from 'next/server';
import { getCompanyByTicker } from '@/lib/ingestion/database';
import type { Company } from '@/lib/types/database';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> | { ticker: string } }
) {
  // Handle both sync and async params (Next.js 15+ uses Promise)
  const resolvedParams = params instanceof Promise ? await params : params;
  const ticker = resolvedParams.ticker?.toUpperCase();

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
