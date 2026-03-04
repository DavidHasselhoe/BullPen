import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getStorageLogoUrl } from '@/lib/logos/logos-storage';

/**
 * Batch company metadata lookup (ticker -> name, logo_url).
 * Replaces N individual /api/search calls with a single DB query.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const tickers = body?.tickers;

    if (!Array.isArray(tickers) || tickers.length === 0) {
      return NextResponse.json(
        { success: true, data: [] },
        { headers: { 'Cache-Control': 'private, max-age=300' } }
      );
    }

    // Limit batch size for safety
    const uniqueTickers = [...new Set(tickers)]
      .filter((t): t is string => typeof t === 'string')
      .map((t) => t.toUpperCase())
      .slice(0, 50);

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('companies')
      .select('ticker, name, logo_url')
      .in('ticker', uniqueTickers);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    const map = new Map(
      (data || []).map((c) => [c.ticker, { name: c.name, logo_url: c.logo_url }])
    );

    const result = uniqueTickers.map((ticker) => {
      const dbLogo = map.get(ticker)?.logo_url;
      return {
        ticker,
        name: map.get(ticker)?.name ?? ticker,
        logo_url: dbLogo ?? getStorageLogoUrl(ticker),
      };
    });

    return NextResponse.json(
      { success: true, data: result },
      { headers: { 'Cache-Control': 'private, max-age=300' } }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid request' },
      { status: 400 }
    );
  }
}
