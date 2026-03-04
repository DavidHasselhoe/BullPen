import { NextRequest, NextResponse } from 'next/server';
import { getTopMovers } from '@/lib/finnhub/finnhub-client';
import { getStorageLogoUrl } from '@/lib/logos/logos-storage';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '5', 10);

    const { gainers, losers } = await getTopMovers(limit);

    const enrichWithLogo = (m: { symbol: string }) => ({
      ...m,
      logoUrl: getStorageLogoUrl(m.symbol),
    });

    return NextResponse.json({
      success: true,
      movers: {
        gainers: gainers.map(enrichWithLogo),
        losers: losers.map(enrichWithLogo),
      },
    });
  } catch (error) {
    console.error('Error fetching top movers:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}