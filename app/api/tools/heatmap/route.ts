import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { withRateLimit } from '@/lib/security/api-security';
import { SP500_TICKERS } from '@/lib/market-data/sp500';
import { SP500_SECTORS } from '@/lib/market-data/sp500-sectors';
import { logger } from '@/lib/utils/logger';
import { getCached, setCached } from '@/lib/cache/market-data-cache';
import type { Session } from '@/app/api/market/heatmap/stream/route';

export const dynamic = 'force-dynamic';

export interface HeatmapStock {
  ticker: string;
  name: string;
  sector: string;
  marketCap: number;
  change: number;
  price: number;
  previousClose?: number;
  isExtended?: boolean;
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
  session?: Session;
  lastUpdated?: string;
  error?: string;
}

interface TwelveDataQuote {
  close?: string;
  percent_change?: string;
  previous_close?: string;
  extended_price?: string;
  extended_percent_change?: string;
  is_market_open?: boolean;
  name?: string;
  status?: string;
}

type BatchQuoteResponse = Record<string, TwelveDataQuote>;

const HEATMAP_CACHE_KEY = 'heatmap:v2';
const HEATMAP_CACHE_TTL_SECONDS = 3 * 60;

function getCurrentSession(): Session {
  const etStr = new Date().toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
  });
  const [h, m] = etStr.split(':').map(Number);
  const etMins = h * 60 + m;
  const day = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })
  ).getDay();

  if (day === 0 || day === 6) return 'closed';
  if (etMins >= 240 && etMins < 570) return 'pre';
  if (etMins >= 570 && etMins < 960) return 'regular';
  if (etMins >= 960 && etMins < 1200) return 'post';
  return 'closed';
}

async function fetchBatchQuotes(
  tickers: string[],
  prepost: boolean
): Promise<BatchQuoteResponse> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) throw new Error('TWELVE_DATA_API_KEY not configured');

  const prepostParam = prepost ? '&prepost=true' : '';
  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(tickers.join(','))}&apikey=${apiKey}${prepostParam}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`TwelveData responded ${res.status}`);

  const json = await res.json() as BatchQuoteResponse | TwelveDataQuote;

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

  const session = getCurrentSession();

  try {
    const supabase = createServerClient();

    // Fetch market caps from screener_stats for as many tickers as possible.
    // Also fetch name+sector from companies table as a fallback for tickers
    // not in SP500_SECTORS (covers recent additions / reclassifications).
    const [{ data: statsData }, { data: companiesData }] = await Promise.all([
      supabase
        .from('screener_stats')
        .select('ticker, market_cap')
        .in('ticker', SP500_TICKERS),
      supabase
        .from('companies')
        .select('ticker, name, sector')
        .in('ticker', SP500_TICKERS),
    ]);

    const marketCapMap = new Map<string, number>();
    for (const s of statsData ?? []) {
      if (s.market_cap && (s.market_cap as number) > 0) {
        marketCapMap.set(s.ticker, s.market_cap as number);
      }
    }

    const dbNameMap = new Map<string, string>();
    const dbSectorMap = new Map<string, string>();
    for (const c of companiesData ?? []) {
      if (c.name) dbNameMap.set(c.ticker, c.name);
      if (c.sector) dbSectorMap.set(c.ticker, c.sector);
    }

    // Rank-based fallback market cap when screener_stats has no entry
    const BASE_CAP = 3_000_000_000_000;
    const universeRank = new Map(SP500_TICKERS.map((t, i) => [t, i]));

    const usePrepost = session === 'pre' || session === 'post';

    const BATCH_SIZE = 20;
    const batches: string[][] = [];
    for (let i = 0; i < SP500_TICKERS.length; i += BATCH_SIZE) {
      batches.push(SP500_TICKERS.slice(i, i + BATCH_SIZE));
    }

    const batchResults = await Promise.all(
      batches.map((b) => fetchBatchQuotes(b, usePrepost))
    );
    const quoteMap: BatchQuoteResponse = Object.assign({}, ...batchResults);

    const sectorMap = new Map<string, HeatmapStock[]>();

    for (const ticker of SP500_TICKERS) {
      const quote = quoteMap[ticker];
      if (!quote || quote.status === 'error') continue;

      // Use extended price when in pre/post session and available
      const isExtended = usePrepost && quote.extended_price != null;
      const rawPrice = isExtended ? quote.extended_price : quote.close;
      const rawChange = isExtended ? quote.extended_percent_change : quote.percent_change;

      const price = parseFloat(rawPrice ?? '0');
      const change = parseFloat(rawChange ?? '0');
      const previousClose = parseFloat(quote.previous_close ?? '0');
      if (!isFinite(price) || !isFinite(change) || price <= 0) continue;

      // Sector: static map → DB → 'Other'
      const sectorName =
        SP500_SECTORS[ticker] ??
        dbSectorMap.get(ticker)?.trim() ??
        'Other';

      // Name: DB → TwelveData quote → ticker
      const name = dbNameMap.get(ticker) ?? quote.name ?? ticker;

      const realCap = marketCapMap.get(ticker);
      const rank = universeRank.get(ticker) ?? SP500_TICKERS.length;
      const marketCap = realCap ?? Math.round(BASE_CAP * Math.pow(0.96, rank));

      const stock: HeatmapStock = {
        ticker,
        name,
        sector: sectorName,
        marketCap,
        change,
        price,
        previousClose: isFinite(previousClose) ? previousClose : undefined,
        isExtended,
      };

      const existing = sectorMap.get(sectorName) ?? [];
      existing.push(stock);
      sectorMap.set(sectorName, existing);
    }

    const SECTOR_ORDER = [
      'Information Technology',
      'Health Care',
      'Financials',
      'Consumer Discretionary',
      'Industrials',
      'Communication Services',
      'Consumer Staples',
      'Energy',
      'Real Estate',
      'Materials',
      'Utilities',
    ];

    const sectors: HeatmapSector[] = Array.from(sectorMap.entries())
      .map(([name, stocks]) => {
        const sorted = [...stocks].sort((a, b) => b.marketCap - a.marketCap);
        const totalMarketCap = sorted.reduce((sum, s) => sum + s.marketCap, 0);
        const avgChange = sorted.reduce((sum, s) => sum + s.change, 0) / (sorted.length || 1);
        return { name, totalMarketCap, avgChange, stocks: sorted };
      })
      .sort((a, b) => {
        const ai = SECTOR_ORDER.indexOf(a.name);
        const bi = SECTOR_ORDER.indexOf(b.name);
        if (ai === -1 && bi === -1) return b.totalMarketCap - a.totalMarketCap;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });

    const response: HeatmapResponse = {
      success: true,
      sectors,
      session,
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
