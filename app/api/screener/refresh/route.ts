/**
 * POST /api/screener/refresh
 *
 * Fetches TwelveData statistics for a batch of symbols and upserts them into
 * the `screener_stats` table. The frontend calls this once per day (or on first
 * visit if the cache is stale).
 *
 * Query params:
 *   batch=0  (0-indexed; each batch = 10 symbols = 500 credits)
 *
 * Credits per batch call: 10 × 50 = 500 credits
 * Rate limit: 610/min → max 1 full batch per minute with headroom
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { batchFetch, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { SCREENER_UNIVERSE } from '@/lib/market-data/screener-universe';

export const dynamic = 'force-dynamic';

const BATCH_SIZE = 10;

interface TwelveDataStatisticsRaw {
  statistics?: {
    valuations_metrics?: {
      market_capitalization?: number | null;
      trailing_pe?: number | null;
      forward_pe?: number | null;
      price_to_book_mrq?: number | null;
      price_to_sales_ttm?: number | null;
      enterprise_to_ebitda?: number | null;
    };
    stock_statistics?: {
      avg_90_volume?: number | null;
    };
    stock_price_summary?: {
      beta?: number | null;
      fifty_two_week_high?: number | null;
      fifty_two_week_low?: number | null;
      fifty_day_ma?: number | null;
      two_hundred_day_ma?: number | null;
    };
    dividends_and_splits?: {
      forward_annual_dividend_yield?: number | null;
      payout_ratio?: number | null;
    };
    financials?: {
      profit_margin?: number | null;
      total_revenue?: number | null;
      diluted_eps?: number | null;
      income_statement?: {
        quarterly_revenue_growth?: number | null;
        quarterly_earnings_growth_yoy?: number | null;
      };
    };
  };
  status?: string;
  code?: number;
  message?: string;
}

function parseStats(raw: TwelveDataStatisticsRaw, sym: string) {
  const s = raw.statistics ?? {};
  const v = s.valuations_metrics ?? {};
  const sp = s.stock_price_summary ?? {};
  const d = s.dividends_and_splits ?? {};
  const f = s.financials ?? {};
  const fi = f.income_statement ?? {};

  return {
    ticker: sym,
    market_cap: v.market_capitalization ? Math.round(v.market_capitalization) : null,
    pe_ratio: v.trailing_pe ?? null,
    forward_pe: v.forward_pe ?? null,
    pb_ratio: v.price_to_book_mrq ?? null,
    ps_ratio: v.price_to_sales_ttm ?? null,
    ev_to_ebitda: v.enterprise_to_ebitda ?? null,
    beta: sp.beta ?? null,
    avg_volume: s.stock_statistics?.avg_90_volume ? Math.round(s.stock_statistics.avg_90_volume) : null,
    week52_high: sp.fifty_two_week_high ?? null,
    week52_low: sp.fifty_two_week_low ?? null,
    day50_ma: sp.fifty_day_ma ?? null,
    day200_ma: sp.two_hundred_day_ma ?? null,
    dividend_yield: d.forward_annual_dividend_yield ?? null,
    payout_ratio: d.payout_ratio ?? null,
    profit_margin: f.profit_margin ?? null,
    revenue_ttm: f.total_revenue ? Math.round(f.total_revenue) : null,
    eps_ttm: f.diluted_eps ?? null,
    revenue_growth_yoy: fi.quarterly_revenue_growth != null ? fi.quarterly_revenue_growth * 100 : null,
    earnings_growth_yoy: fi.quarterly_earnings_growth_yoy != null ? fi.quarterly_earnings_growth_yoy * 100 : null,
    updated_at: new Date().toISOString(),
  };
}

async function handler(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const batchIndex = parseInt(sp.get('batch') ?? '0', 10);
  const apiKey = process.env.TWELVE_DATA_API_KEY;

  if (!apiKey) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'TWELVE_DATA_API_KEY not configured' }, { status: 500 })
    );
  }

  const start = batchIndex * BATCH_SIZE;
  const symbols = SCREENER_UNIVERSE.slice(start, start + BATCH_SIZE);

  if (symbols.length === 0) {
    return addSecurityHeaders(
      NextResponse.json({ success: true, done: true, totalBatches: Math.ceil(SCREENER_UNIVERSE.length / BATCH_SIZE) })
    );
  }

  try {
    // Fetch all statistics in one batch POST (500 credits for 10 symbols)
    const requests: Record<string, string> = {};
    for (const sym of symbols) {
      requests[sym] = `/statistics?symbol=${encodeURIComponent(sym)}&apikey=${apiKey}`;
    }

    const raw = await batchFetch<TwelveDataStatisticsRaw>(requests);

    // Also pull company names / sector / industry from Supabase
    const supabase = createServerClient();
    const { data: companies } = await supabase
      .from('companies')
      .select('ticker, name, sector, industry, logo_url')
      .in('ticker', symbols);

    const companyMap = new Map(
      (companies ?? []).map((c) => [c.ticker, c])
    );

    // Build upsert rows
    const rows = [];
    for (const sym of symbols) {
      const statsRaw = raw[sym];
      if (!statsRaw) continue;

      const stats = parseStats(statsRaw, sym);
      const company = companyMap.get(sym);

      rows.push({
        ...stats,
        name: company?.name ?? sym,
        sector: company?.sector ?? null,
        industry: company?.industry ?? null,
        logo_url: company?.logo_url ?? null,
      });
    }

    if (rows.length > 0) {
      const { error } = await supabase
        .from('screener_stats')
        .upsert(rows, { onConflict: 'ticker' });

      if (error) {
        console.error('[screener/refresh] Upsert error:', error);
        return addSecurityHeaders(
          NextResponse.json({ success: false, error: error.message }, { status: 500 })
        );
      }
    }

    const totalBatches = Math.ceil(SCREENER_UNIVERSE.length / BATCH_SIZE);
    const nextBatch = batchIndex + 1 < totalBatches ? batchIndex + 1 : null;

    return addSecurityHeaders(
      NextResponse.json({
        success: true,
        batch: batchIndex,
        refreshed: rows.length,
        symbols,
        nextBatch,
        totalBatches,
        done: nextBatch === null,
      })
    );
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 })
      );
    }
    return addSecurityHeaders(
      NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
        { status: 500 }
      )
    );
  }
}

// Limit to 5 refresh calls per minute — each costs 500 credits
export const POST = withRateLimit(handler, { windowMs: 60_000, maxRequests: 5 });
