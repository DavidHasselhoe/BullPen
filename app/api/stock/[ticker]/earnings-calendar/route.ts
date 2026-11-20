import { NextRequest, NextResponse } from 'next/server';
import { getSymbolEarnings } from '@/lib/market-data/symbol-earnings';

export async function GET(
  _request: NextRequest,
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

  return NextResponse.json({ success: true, earnings: await getSymbolEarnings(ticker) });
}
