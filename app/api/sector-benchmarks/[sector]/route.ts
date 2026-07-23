import { NextRequest, NextResponse } from 'next/server';
import { addSecurityHeaders } from '@/lib/security/api-security';
import { getBenchmarks } from '@/lib/finance/sector-benchmarks';

/**
 * GET /api/sector-benchmarks/[sector]?industry=<encoded>
 *
 * Public reference data (per-industry, falling back to per-sector, metric
 * distributions from migrations 087/088). No auth, no market-data credits —
 * just a cached DB read. Cached hard at the edge for 12h since the medians
 * only refresh once daily with the prefetch cron.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sector: string }> }
): Promise<NextResponse> {
  const { sector } = await context.params;
  const decodedSector = decodeURIComponent(sector);
  const industry = request.nextUrl.searchParams.get('industry');

  try {
    const result = await getBenchmarks(decodedSector, industry);
    const res = NextResponse.json({
      success: true,
      groupType: result?.groupType ?? null,
      groupLabel: result?.groupLabel ?? null,
      benchmarks: result?.benchmarks ?? {},
    });
    res.headers.set('Cache-Control', 'public, s-maxage=43200, stale-while-revalidate=86400');
    return addSecurityHeaders(res);
  } catch {
    // Never fail the page over benchmark context — return an empty set.
    const res = NextResponse.json({ success: true, groupType: null, groupLabel: null, benchmarks: {} });
    res.headers.set('Cache-Control', 'public, s-maxage=300');
    return addSecurityHeaders(res);
  }
}
