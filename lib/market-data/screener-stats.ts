/**
 * Shared screener-stats fetch/upsert pipeline.
 *
 * Used by:
 *  - the daily refresh cron (app/api/screener/refresh) to populate the
 *    actively-tracked universe, and
 *  - the screener GET route (app/api/screener) to lazily fetch any ticker a
 *    user references (holdings / watchlist / custom views) that isn't cached yet.
 *
 * One TwelveData /statistics batch POST = ~50 credits per symbol. Keep call
 * sites bounded (the cron paces with delays; the GET route caps on-demand size).
 */

import { createServerClient } from '@/lib/supabase/client';
import { batchFetch } from '@/lib/twelvedata/twelvedata-client';
import type { ScreenerRow } from '@/app/api/screener/route';

/** Max symbols per TwelveData /batch POST. Stays well under the ~120 cap. */
const CHUNK_SIZE = 10;

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

/** Map a raw TwelveData /statistics payload to the screener_stats column shape. */
export function parseStats(raw: TwelveDataStatisticsRaw, sym: string) {
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

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Fetch /statistics for the given symbols from TwelveData, enrich with company
 * metadata from Supabase, upsert into screener_stats, and return the rows.
 *
 * Chunks into batch POSTs of CHUNK_SIZE. Throws TwelveDataRateLimitError up to
 * the caller (which decides whether to 429 or degrade to partial results).
 */
export async function fetchAndUpsertScreenerStats(symbols: string[]): Promise<ScreenerRow[]> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) throw new Error('TWELVE_DATA_API_KEY not configured');

  const uniqueSymbols = [...new Set(symbols.map((s) => s.toUpperCase()).filter(Boolean))];
  if (uniqueSymbols.length === 0) return [];

  const supabase = createServerClient();

  // Company metadata (name / sector / industry / logo) for all symbols in one query.
  const { data: companies } = await supabase
    .from('companies')
    .select('ticker, name, sector, industry, logo_url')
    .in('ticker', uniqueSymbols);
  const companyMap = new Map(
    (companies ?? []).map((c) => [(c as { ticker: string }).ticker, c as {
      ticker: string; name: string | null; sector: string | null; industry: string | null; logo_url: string | null;
    }])
  );

  const rows: ScreenerRow[] = [];

  for (const group of chunk(uniqueSymbols, CHUNK_SIZE)) {
    const requests: Record<string, string> = {};
    for (const sym of group) {
      requests[sym] = `/statistics?symbol=${encodeURIComponent(sym)}&apikey=${apiKey}`;
    }
    const raw = await batchFetch<TwelveDataStatisticsRaw>(requests);

    for (const sym of group) {
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
        exchange: null,
      } as ScreenerRow);
    }
  }

  if (rows.length > 0) {
    const { error } = await supabase
      .from('screener_stats')
      .upsert(rows, { onConflict: 'ticker' });
    if (error) {
      console.error('[screener-stats] upsert error:', error);
      throw new Error(error.message);
    }
  }

  return rows;
}
