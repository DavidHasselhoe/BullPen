import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { batchFetch, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { rget, rset } from '@/lib/cache/redis-cache';

interface TsValue { datetime: string; close: string }
interface TsResponse { values?: TsValue[]; status?: string }

// 1-month daily sparklines are stable — 20 min matches the client-side staleTime.
const TTL = 20 * 60;

async function handler(
  request: NextRequest,
   
  _ctx: unknown,
   
  _session: { userId: string }
): Promise<NextResponse> {
  const symbols = (new URL(request.url).searchParams.get('symbols') ?? '')
    .split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 60);

  if (symbols.length === 0) {
    return addSecurityHeaders(NextResponse.json({ success: true, sparklines: {} }));
  }

  // Check Redis for each symbol — only fetch the true misses from TwelveData.
  const cacheResults = await Promise.all(
    symbols.map(async (sym) => ({
      sym,
      cached: await rget<number[]>(`sparkline:1M:${sym}`),
    }))
  );

  const sparklines: Record<string, number[]> = {};
  const missing: string[] = [];

  for (const { sym, cached } of cacheResults) {
    if (cached && cached.length > 1) {
      sparklines[sym] = cached;
    } else {
      missing.push(sym);
    }
  }

  if (missing.length === 0) {
    return addSecurityHeaders(
      NextResponse.json({ success: true, sparklines }, {
        headers: { 'Cache-Control': 'public, s-maxage=1200, stale-while-revalidate=300' },
      })
    );
  }

  const apiKey = process.env.TWELVE_DATA_API_KEY ?? '';
  const requests: Record<string, string> = {};
  for (const sym of missing) {
    requests[sym] =
      `/time_series?symbol=${encodeURIComponent(sym)}&interval=1day&outputsize=31&apikey=${apiKey}`;
  }

  try {
    const raw = await batchFetch<TsResponse>(requests);

    for (const [sym, data] of Object.entries(raw)) {
      if (!Array.isArray(data?.values) || data.values.length < 2) continue;
      // TwelveData returns values newest-first — reverse to get chronological order.
      const closes = [...data.values]
        .reverse()
        .map(v => parseFloat(v.close))
        .filter(n => !isNaN(n));
      if (closes.length < 2) continue;
      sparklines[sym] = closes;
      void rset(`sparkline:1M:${sym}`, closes, TTL);
    }

    return addSecurityHeaders(
      NextResponse.json({ success: true, sparklines }, {
        headers: { 'Cache-Control': 'public, s-maxage=1200, stale-while-revalidate=300' },
      })
    );
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 })
      );
    }
    // Non-fatal: return whatever we got from cache so rows still render.
    return addSecurityHeaders(NextResponse.json({ success: true, sparklines }));
  }
}

export const GET = withAuth(handler);
