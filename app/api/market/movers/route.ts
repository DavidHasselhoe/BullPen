import { NextRequest, NextResponse } from 'next/server';
import { getTopMovers } from '@/lib/finnhub/finnhub-client';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '5', 10);

    const movers = await getTopMovers(limit);

    return NextResponse.json({
      success: true,
      movers,
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