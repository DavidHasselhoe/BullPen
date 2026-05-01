import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { getCached } from '@/lib/cache/market-data-cache';
import { computeHealthScore } from '@/lib/finance/health-score';
import { getEarningsCalendar } from '@/lib/finnhub/finnhub-client';
import type {
  CompanyStatistics,
  IncomeStatementPeriod,
  BalanceSheetPeriod,
  CashFlowPeriod,
} from '@/lib/twelvedata/twelvedata-client';

type EarningsItem = {
  date: string;
  epsActual: number | null;
};

type ThesisSentiment = 'bull' | 'bear' | 'neutral';

interface EnhancedData {
  healthScore: { score: number; grade: string; label: string } | null;
  nextEarningsDate: string | null;
  daysToEarnings: number | null;
  thesisSentiment: ThesisSentiment | null;
  marketCap: number | null;
  peRatio: number | null;
  week52High: number | null;
  week52Low: number | null;
}

/**
 * POST /api/watchlist/enhanced
 * Body: { symbols: string[] }
 *
 * Health/financials: read-only from market_data_cache (populated on stock page visits).
 * Earnings: cache first, falls back to a single Finnhub calendar call (free tier).
 * Market cap / P/E: from stats cache when available.
 */
async function handler(
  req: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const body = await req.json().catch(() => null);

  if (!body || !Array.isArray(body.symbols)) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'symbols must be an array' }, { status: 400 })
    );
  }

  const rawSymbols: string[] = body.symbols;

  if (rawSymbols.length > 50) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'symbols array must have at most 50 items' }, { status: 400 })
    );
  }

  const symbols = rawSymbols.map((s: string) => String(s).toUpperCase().trim()).filter(Boolean);

  if (symbols.length === 0) {
    return addSecurityHeaders(NextResponse.json({ success: true, data: {} }));
  }

  const supabase = createServerClient();
  const now = Date.now();

  // ── Thesis sentiments (single query) ──────────────────────────────────────
  const { data: thesisRows } = await supabase
    .from('stock_theses')
    .select('symbol, sentiment')
    .eq('user_id', session.userId)
    .in('symbol', symbols)
    .order('created_at', { ascending: false });

  const thesisMap: Record<string, ThesisSentiment> = {};
  for (const row of thesisRows ?? []) {
    if (!thesisMap[row.symbol]) {
      thesisMap[row.symbol] = row.sentiment as ThesisSentiment;
    }
  }

  // ── Read all caches in parallel ───────────────────────────────────────────
  const cacheResults = await Promise.all(
    symbols.map(async (sym) => {
      const [stats, income, balance, cashflow, earnings] = await Promise.all([
        getCached<CompanyStatistics>(`stats:${sym}`),
        getCached<IncomeStatementPeriod[]>(`financials:${sym}:income:quarterly`),
        getCached<BalanceSheetPeriod[]>(`financials:${sym}:balance:quarterly`),
        getCached<CashFlowPeriod[]>(`financials:${sym}:cashflow:quarterly`),
        getCached<EarningsItem[]>(`snap-earnings:${sym}`),
      ]);
      return { sym, stats, income, balance, cashflow, earnings };
    })
  );

  // ── Finnhub earnings fallback for symbols with no cached upcoming date ────
  const needEarnings = cacheResults
    .filter(r => !r.earnings?.some(e => e.epsActual === null && Date.parse(e.date) > now))
    .map(r => r.sym);

  const finnhubNext: Record<string, string> = {};
  if (needEarnings.length > 0) {
    try {
      const from = new Date().toISOString().slice(0, 10);
      const to = new Date(now + 60 * 86_400_000).toISOString().slice(0, 10); // next 60 days
      const items = await getEarningsCalendar(from, to);
      for (const item of items) {
        if (needEarnings.includes(item.symbol) && item.date && !finnhubNext[item.symbol]) {
          finnhubNext[item.symbol] = item.date;
        }
      }
    } catch {
      // Non-fatal — earnings column will just remain empty
    }
  }

  // ── Build results ─────────────────────────────────────────────────────────
  const results: Record<string, EnhancedData> = {};

  for (const { sym, stats, income, balance, cashflow, earnings } of cacheResults) {
    // Health score
    let healthScore: EnhancedData['healthScore'] = null;
    if (stats && income && balance && cashflow) {
      const hs = computeHealthScore(stats, income, balance, cashflow);
      healthScore = { score: hs.score, grade: hs.grade, label: hs.label };
    }

    // Earnings — cache first, Finnhub fallback
    let nextEarningsDate: string | null = null;
    let daysToEarnings: number | null = null;

    if (earnings && earnings.length > 0) {
      const upcoming = earnings
        .filter(e => e.epsActual === null && Date.parse(e.date) > now)
        .map(e => e.date)
        .sort();
      if (upcoming.length > 0) {
        nextEarningsDate = upcoming[0];
      }
    }

    if (!nextEarningsDate && finnhubNext[sym]) {
      nextEarningsDate = finnhubNext[sym];
    }

    if (nextEarningsDate) {
      daysToEarnings = Math.ceil((Date.parse(nextEarningsDate) - now) / 86_400_000);
    }

    results[sym] = {
      healthScore,
      nextEarningsDate,
      daysToEarnings,
      thesisSentiment: thesisMap[sym] ?? null,
      marketCap: stats?.marketCap ?? null,
      peRatio: stats?.peRatioTTM ?? null,
      week52High: stats?.week52High ?? null,
      week52Low: stats?.week52Low ?? null,
    };
  }

  return addSecurityHeaders(NextResponse.json({ success: true, data: results }));
}

export const POST = withAuth(handler);
