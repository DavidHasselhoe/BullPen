import { NextRequest, NextResponse } from 'next/server';
import { TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { fetchCompareCompany, type CompareCompany } from '@/lib/compare/fetch-compare-company';

export const dynamic = 'force-dynamic';

export type { CompareCompany };

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const tickersParam = sp.get('tickers');
    const tickers = tickersParam
      ? tickersParam.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean)
      : [];

    if (tickers.length < 2 || tickers.length > 5) {
      return NextResponse.json(
        { success: false, error: 'Provide 2–5 comma-separated tickers, e.g. ?tickers=NVDA,AMD' },
        { status: 400 }
      );
    }

    const results = await Promise.all(tickers.map(fetchCompareCompany));
    const successfulResults = results.filter((r): r is CompareCompany => r !== null);

    if (successfulResults.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Could not fetch data for any of the requested companies' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      companies: successfulResults,
    });
  } catch (err) {
    // Transient (already retried once in getCachedFinancial) and unrelated to plan
    // tier, so keep it distinct from the real plan_restricted case below.
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
