import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { batchFetch, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';

interface TsValue { datetime: string; close: string }
interface TsResponse { values?: TsValue[]; status?: string }

async function handler(
  request: NextRequest,
   
  _ctx: unknown,
   
  _session: { userId: string }
): Promise<NextResponse> {
  const symbols = (new URL(request.url).searchParams.get('symbols') ?? '')
    .split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 20);

  if (symbols.length === 0) {
    return addSecurityHeaders(NextResponse.json({ success: true, sparklines: {} }));
  }

  const etDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const apiKey = process.env.TWELVE_DATA_API_KEY ?? '';

  // One HTTP request for all symbols via TwelveData /batch
  const requests: Record<string, string> = {};
  for (const sym of symbols) {
    requests[sym] =
      `/time_series?symbol=${encodeURIComponent(sym)}&interval=5min` +
      `&start_date=${etDate}+04:00:00&end_date=${etDate}+23:59:00` +
      `&prepost=1&outputsize=500&apikey=${apiKey}`;
  }

  try {
    const raw = await batchFetch<TsResponse>(requests);
    const sparklines: Record<string, number[]> = {};

    for (const [sym, data] of Object.entries(raw)) {
      if (!Array.isArray(data?.values) || data.values.length === 0) continue;
      // TwelveData returns values in descending order — reverse to get chronological
      const closes = [...data.values]
        .reverse()
        .map(v => parseFloat(v.close))
        .filter(n => !isNaN(n));
      if (closes.length > 1) sparklines[sym] = closes;
    }

    return addSecurityHeaders(
      NextResponse.json({ success: true, sparklines }, {
        headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' },
      })
    );
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 })
      );
    }
    // Non-fatal: return empty sparklines so cards still render without charts
    return addSecurityHeaders(NextResponse.json({ success: true, sparklines: {} }));
  }
}

export const GET = withAuth(handler);
