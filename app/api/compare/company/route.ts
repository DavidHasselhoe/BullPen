import { NextRequest, NextResponse } from 'next/server';
import { TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { fetchCompareCompany } from '@/lib/compare/fetch-compare-company';

export const dynamic = 'force-dynamic';

/**
 * Single-ticker counterpart to /api/compare — lets the client fetch each
 * company in the comparison as its own request/query, so it can show real
 * per-company loading progress instead of waiting on the slowest ticker in
 * one combined response. See CompareContent in app/tools/compare/page.tsx.
 */
export async function GET(request: NextRequest) {
  try {
    const ticker = request.nextUrl.searchParams.get('ticker')?.trim().toUpperCase();

    if (!ticker) {
      return NextResponse.json(
        { success: false, error: 'Provide a ticker, e.g. ?ticker=NVDA' },
        { status: 400 }
      );
    }

    const company = await fetchCompareCompany(ticker);
    return NextResponse.json({ success: true, company });
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return NextResponse.json({ success: false, error: 'rate_limited' }, { status: 200 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (/enterprise plan|higher plan|not available.*plan/i.test(msg)) {
      return NextResponse.json({ success: false, error: 'plan_restricted' }, { status: 200 });
    }
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
