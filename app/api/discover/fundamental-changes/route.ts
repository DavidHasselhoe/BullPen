import { NextRequest, NextResponse } from 'next/server';
import { getRecentFundamentalChanges } from '@/lib/discover/discover-db';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get('limit') || '6', 10);

  try {
    const result = await getRecentFundamentalChanges(limit);
    if (!result.success) {
      return NextResponse.json({ success: true, changes: [] });
    }
    return NextResponse.json({
      success: true,
      changes: result.data || [],
    });
  } catch {
    return NextResponse.json({ success: true, changes: [] });
  }
}
