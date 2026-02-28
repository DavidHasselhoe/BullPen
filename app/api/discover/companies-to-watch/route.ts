import { NextRequest, NextResponse } from 'next/server';
import { getCompaniesToWatch } from '@/lib/discover/discover-db';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get('limit') || '10', 10);

  try {
    const result = await getCompaniesToWatch(limit);
    if (!result.success) {
      return NextResponse.json({ success: true, companies: [] });
    }
    return NextResponse.json({
      success: true,
      companies: result.data || [],
    });
  } catch {
    return NextResponse.json({ success: true, companies: [] });
  }
}
