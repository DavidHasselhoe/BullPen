import { NextRequest, NextResponse } from 'next/server';
import { addSecurityHeaders } from '@/lib/security/api-security';
import { getSectorBenchmarks } from '@/lib/finance/sector-benchmarks';

/**
 * GET /api/sector-benchmarks/[sector]
 *
 * Public reference data (per-sector metric distributions from migration 087).
 * No auth, no market-data credits — just a cached DB read. Cached hard at the
 * edge for 12h since the medians only refresh once daily with the prefetch cron.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ sector: string }> }
): Promise<NextResponse> {
  const { sector } = await context.params;
  const decoded = decodeURIComponent(sector);

  try {
    const result = await getSectorBenchmarks(decoded);
    const res = NextResponse.json({
      success: true,
      sector: result?.sector ?? null,
      benchmarks: result?.benchmarks ?? {},
    });
    res.headers.set('Cache-Control', 'public, s-maxage=43200, stale-while-revalidate=86400');
    return addSecurityHeaders(res);
  } catch {
    // Never fail the page over benchmark context — return an empty set.
    const res = NextResponse.json({ success: true, sector: null, benchmarks: {} });
    res.headers.set('Cache-Control', 'public, s-maxage=300');
    return addSecurityHeaders(res);
  }
}
