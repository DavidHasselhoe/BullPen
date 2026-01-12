import { NextRequest, NextResponse } from 'next/server';
import { getMarketNews } from '@/lib/finnhub/finnhub-client';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category') || 'general';
    const minIdParam = searchParams.get('minId');
    const minId = minIdParam ? parseInt(minIdParam, 10) : undefined;

    const news = await getMarketNews(category, minId);

    return NextResponse.json({
      success: true,
      news,
    });
  } catch (error) {
    console.error('Error fetching market news:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}