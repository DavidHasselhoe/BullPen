/**
 * Hot Picks data API (GET). Popularity is driven by stock detail page visits
 * (see stock_page_visits + get_hot_picks), not search clicks.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { withRateLimit } from '@/lib/security/api-security';

async function getHandler(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const hours = parseInt(searchParams.get('hours') || '168', 10); // Default: 7 days
    const limit = parseInt(searchParams.get('limit') || '10', 10); // Default: 10 results

    const supabase = createServerClient();

    // Call the database function to get hot picks
    const { data, error } = await supabase.rpc('get_hot_picks', {
      time_period_hours: hours,
      limit_count: limit,
    });

    if (error) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Company name and logo come back with the tickers rather than leaving the
    // caller to fetch them: Hot Picks used to wait for this response and then
    // fire /api/companies/batch, two sequential round trips for one card, which
    // measured 746ms + 745ms in production. One query here costs nothing extra.
    const picks = (data ?? []) as Array<{ ticker: string }>;
    const tickers = picks.map((p) => p.ticker.toUpperCase());
    let companies = new Map<string, { name: string | null; logo_url: string | null }>();
    if (tickers.length > 0) {
      const { data: rows } = await supabase
        .from('companies')
        .select('ticker, name, logo_url')
        .in('ticker', tickers);
      companies = new Map(
        ((rows ?? []) as Array<{ ticker: string; name: string | null; logo_url: string | null }>)
          .map((r) => [r.ticker.toUpperCase(), { name: r.name, logo_url: r.logo_url }])
      );
    }

    return NextResponse.json({
      success: true,
      data: picks.map((p) => {
        const company = companies.get(p.ticker.toUpperCase());
        return {
          ...p,
          name: company?.name ?? null,
          logo_url: company?.logo_url ?? null,
        };
      }),
    });
  } catch {
    return NextResponse.json({ success: true, data: [] });
  }
}

/** GET: rate limited to 30/min */
export const GET = withRateLimit(getHandler, { windowMs: 60 * 1000, maxRequests: 30 });
