import { NextRequest, NextResponse } from 'next/server';
import { searchCompanies } from '@/lib/search/search-db';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get('q');
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : 15;

  if (!q || q.trim().length === 0) {
    return NextResponse.json({
      success: true,
      results: [],
    });
  }

  try {
    const result = await searchCompanies(q, limit);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Search failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      results: result.data || [],
    });
  } catch (error) {
    console.error('Error searching companies:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
