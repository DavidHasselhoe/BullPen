import { NextRequest, NextResponse } from 'next/server';
import { getRecentFilings } from '@/lib/discover/discover-db';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get('limit') || '10', 10);

  try {
    const result = await getRecentFilings(limit);
    if (!result.success) {
      return NextResponse.json({ success: true, filings: [] });
    }
    return NextResponse.json({
      success: true,
      filings: result.data || [],
    });
  } catch {
    return NextResponse.json({ success: true, filings: [] });
  }
}
