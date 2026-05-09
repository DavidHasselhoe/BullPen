import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { withRateLimit } from '@/lib/security/api-security';
import { SCREENER_UNIVERSE } from '@/lib/market-data/screener-universe';
import { logger } from '@/lib/utils/logger';
import { getCached, setCached } from '@/lib/cache/market-data-cache';

export const dynamic = 'force-dynamic';

export interface HeatmapStock {
  ticker: string;
  name: string;
  sector: string;
  marketCap: number;
  change: number;
  price: number;
}

export interface HeatmapSector {
  name: string;
  totalMarketCap: number;
  avgChange: number;
  stocks: HeatmapStock[];
}

export interface HeatmapResponse {
  success: boolean;
  sectors?: HeatmapSector[];
  lastUpdated?: string;
  error?: string;
}

interface TwelveDataQuote {
  close?: string;
  percent_change?: string;
  status?: string;
}

type BatchQuoteResponse = Record<string, TwelveDataQuote>;

const HEATMAP_CACHE_KEY = 'heatmap:v1';
const HEATMAP_CACHE_TTL_SECONDS = 5 * 60;

async function fetchBatchQuotes(tickers: string[]): Promise<BatchQuoteResponse> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) throw new Error('TWELVE_DATA_API_KEY not configured');

  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(tickers.join(','))}&apikey=${apiKey}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`TwelveData responded ${res.status}`);

  const json = await res.json() as BatchQuoteResponse | TwelveDataQuote;

  // Single-ticker responses come back as a flat object, not keyed by ticker
  if (tickers.length === 1 && json && typeof json === 'object' && !(tickers[0] in json)) {
    return { [tickers[0]]: json as TwelveDataQuote };
  }

  return json as BatchQuoteResponse;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function heatmapHandler(_req: NextRequest): Promise<NextResponse> {
  const cachedHeatmap = await getCached<HeatmapResponse>(HEATMAP_CACHE_KEY);
  if (cachedHeatmap) {
    return NextResponse.json(cachedHeatmap);
  }

  try {
    const supabase = createServerClient();

    // companies always has name + sector; screener_stats has market_cap when the
    // screener refresh job has run. Both queries are best-effort — we fall back
    // to a rank-based market cap so the heatmap always renders.
    const [{ data: companies, error: dbError }, { data: stats }] = await Promise.all([
      supabase.from('companies').select('ticker, name, sector').in('ticker', SCREENER_UNIVERSE),
      supabase.from('screener_stats').select('ticker, market_cap').in('ticker', SCREENER_UNIVERSE),
    ]);

    if (dbError) {
      logger.error('Heatmap: Supabase query failed', dbError);
      return NextResponse.json({ success: false, error: 'Database error' }, { status: 500 });
    }

    // Build a market-cap lookup from screener_stats
    const marketCapMap = new Map<string, number>();
    for (const s of stats ?? []) {
      if (s.market_cap && (s.market_cap as number) > 0) {
        marketCapMap.set(s.ticker, s.market_cap as number);
      }
    }

    // SCREENER_UNIVERSE is ordered largest-first; use rank as a proxy when
    // screener_stats has no data for a ticker.
    const BASE_CAP = 3_000_000_000_000; // ~$3T for rank 0
    const universeRank = new Map(SCREENER_UNIVERSE.map((t, i) => [t, i]));

    const validCompanies = (companies ?? [])
      .filter((c) => Boolean(c.ticker))
      .map((c) => {
        const realCap = marketCapMap.get(c.ticker);
        const rank = universeRank.get(c.ticker) ?? SCREENER_UNIVERSE.length;
        const market_cap = realCap ?? Math.round(BASE_CAP * Math.pow(0.96, rank));
        return { ...c, market_cap };
      });

    const tickers = validCompanies.map((c) => c.ticker);

    const BATCH_SIZE = 20;
    const batches: string[][] = [];
    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      batches.push(tickers.slice(i, i + BATCH_SIZE));
    }

    const batchResults = await Promise.all(batches.map(fetchBatchQuotes));
    const quoteMap: BatchQuoteResponse = Object.assign({}, ...batchResults);

    const sectorMap = new Map<string, HeatmapStock[]>();

    for (const company of validCompanies) {
      const quote = quoteMap[company.ticker];
      if (!quote || quote.status === 'error') continue;

      const price = parseFloat(quote.close ?? '0');
      const change = parseFloat(quote.percent_change ?? '0');
      if (!isFinite(price) || !isFinite(change)) continue;

      const sectorName = (company.sector as string | null)?.trim() || 'Other';
      const stock: HeatmapStock = {
        ticker: company.ticker,
        name: (company.name as string | null) ?? company.ticker,
        sector: sectorName,
        marketCap: company.market_cap as number,
        change,
        price,
      };

      const existing = sectorMap.get(sectorName) ?? [];
      existing.push(stock);
      sectorMap.set(sectorName, existing);
    }

    const sectors: HeatmapSector[] = Array.from(sectorMap.entries())
      .map(([name, stocks]) => {
        const sorted = [...stocks].sort((a, b) => b.marketCap - a.marketCap);
        const totalMarketCap = sorted.reduce((sum, s) => sum + s.marketCap, 0);
        const avgChange = sorted.reduce((sum, s) => sum + s.change, 0) / (sorted.length || 1);
        return { name, totalMarketCap, avgChange, stocks: sorted };
      })
      .sort((a, b) => b.totalMarketCap - a.totalMarketCap);

    const response: HeatmapResponse = {
      success: true,
      sectors,
      lastUpdated: new Date().toISOString(),
    };

    void setCached(HEATMAP_CACHE_KEY, 'MARKET', 'heatmap', response, HEATMAP_CACHE_TTL_SECONDS);

    return NextResponse.json(response);
  } catch (err) {
    logger.error('Heatmap API error', err);
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export const GET = withRateLimit(heatmapHandler, { windowMs: 60_000, maxRequests: 5 });
