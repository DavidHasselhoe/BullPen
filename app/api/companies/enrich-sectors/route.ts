import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getCompanyProfile } from '@/lib/twelvedata/twelvedata-client';

/**
 * Fetches sector data from TwelveData for tickers that have null sector in the DB,
 * updates the companies table, and returns the resolved sector map.
 * Called by the holdings page when it detects holdings with missing sector data.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const tickers: string[] = Array.isArray(body?.tickers)
      ? body.tickers.filter((t: unknown): t is string => typeof t === 'string').slice(0, 20)
      : [];

    if (tickers.length === 0) {
      return NextResponse.json({ sectors: {} });
    }

    const supabase = createServerClient();
    const sectors: Record<string, string> = {};

    await Promise.all(
      tickers.map(async (ticker) => {
        try {
          const profile = await getCompanyProfile(ticker);
          if (profile.sector) {
            sectors[ticker] = profile.sector;
            await Promise.all([
              supabase.from('companies').update({ sector: profile.sector }).eq('ticker', ticker),
              supabase.from('ticker_sectors').upsert(
                { ticker, sector: profile.sector, updated_at: new Date().toISOString() },
                { onConflict: 'ticker' }
              ),
            ]);
          }
        } catch {
          // Skip — don't fail the batch for one problematic ticker
        }
      })
    );

    return NextResponse.json({ sectors });
  } catch {
    return NextResponse.json({ sectors: {} });
  }
}
