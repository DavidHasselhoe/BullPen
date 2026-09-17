import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getCompanyProfile } from '@/lib/twelvedata/twelvedata-client';
import { withAuth } from '@/lib/security/api-security';

/**
 * Fetches sector data from TwelveData for tickers that have null sector in the DB,
 * updates the companies table, and returns the resolved sector map.
 * Called by the holdings page when it detects holdings with missing sector data.
 *
 * Requires auth (not per-user scoped — companies/ticker_sectors is shared
 * reference data) purely to stop anonymous callers from burning TwelveData
 * credits on this route at will.
 */
async function handler(request: NextRequest, _ctx: unknown, _session: { userId: string }) {
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

    // Look in the database before paying TwelveData for it. /profile is 10
    // credits a call, and this app keeps sectors in three tables filled by
    // three different paths, so a ticker the caller believes is unclassified
    // is often already classified in one of the other two. Callers only check
    // ticker_sectors and companies, which is how this route ended up buying
    // sectors that screener_stats already had.
    const [screener, companies] = await Promise.all([
      supabase.from('screener_stats').select('ticker, sector').in('ticker', tickers),
      supabase.from('companies').select('ticker, sector').in('ticker', tickers),
    ]);

    const known = new Map<string, string>();
    for (const result of [companies, screener]) {
      for (const row of (result.data ?? []) as Array<{ ticker: string; sector: string | null }>) {
        if (row.sector && row.sector.trim()) known.set(row.ticker, row.sector.trim());
      }
    }

    const toFetch: string[] = [];
    for (const ticker of tickers) {
      const hit = known.get(ticker);
      if (hit) {
        sectors[ticker] = hit;
        // Promote it into the shared cache so the next reader of that table
        // finds it without coming back here at all.
        void supabase.from('ticker_sectors').upsert(
          { ticker, sector: hit, updated_at: new Date().toISOString() },
          { onConflict: 'ticker' }
        );
      } else {
        toFetch.push(ticker);
      }
    }

    await Promise.all(
      toFetch.map(async (ticker) => {
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

export const POST = withAuth(handler, { rateLimit: { windowMs: 60_000, maxRequests: 20 } });
