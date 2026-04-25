import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/server';
import { getCached } from '@/lib/cache/market-data-cache';
import { computeHealthScore } from '@/lib/finance/health-score';
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
}

/**
 * POST /api/watchlist/enhanced
 * Body: { symbols: string[] }
 * Returns: { [symbol]: EnhancedData }
 *
 * Zero TwelveData API calls — reads only from market_data_cache and stock_theses.
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

  // ── Thesis sentiments for all symbols in a single query ──
  const { data: thesisRows } = await supabase
    .from('stock_theses')
    .select('symbol, sentiment')
    .eq('user_id', session.userId)
    .in('symbol', symbols)
    .order('created_at', { ascending: false });

  // Build a map: symbol → most recent sentiment (first row per symbol after order)
  const thesisMap: Record<string, ThesisSentiment> = {};
  for (const row of thesisRows ?? []) {
    if (!thesisMap[row.symbol]) {
      thesisMap[row.symbol] = row.sentiment as ThesisSentiment;
    }
  }

  // ── Per-symbol cache reads (parallel) ──
  const results: Record<string, EnhancedData> = {};

  await Promise.all(
    symbols.map(async (sym) => {
      // Health score inputs
      const [stats, income, balance, cashflow, earnings] = await Promise.all([
        getCached<CompanyStatistics>(`stats:${sym}`),
        getCached<IncomeStatementPeriod[]>(`financials:${sym}:income:quarterly`),
        getCached<BalanceSheetPeriod[]>(`financials:${sym}:balance:quarterly`),
        getCached<CashFlowPeriod[]>(`financials:${sym}:cashflow:quarterly`),
        getCached<EarningsItem[]>(`snap-earnings:${sym}`),
      ]);

      // Health score — null if any required cache entry is missing
      let healthScore: { score: number; grade: string; label: string } | null = null;
      if (stats && income && balance && cashflow) {
        const hs = computeHealthScore(stats, income, balance, cashflow);
        healthScore = { score: hs.score, grade: hs.grade, label: hs.label };
      }

      // Next earnings date — first upcoming item where epsActual is null
      let nextEarningsDate: string | null = null;
      let daysToEarnings: number | null = null;

      if (earnings && earnings.length > 0) {
        const upcomingDates = earnings
          .filter((e) => e.epsActual === null && Date.parse(e.date) > now)
          .map((e) => e.date)
          .sort();

        if (upcomingDates.length > 0) {
          nextEarningsDate = upcomingDates[0];
          daysToEarnings = Math.ceil((Date.parse(nextEarningsDate) - now) / (1000 * 60 * 60 * 24));
        }
      }

      results[sym] = {
        healthScore,
        nextEarningsDate,
        daysToEarnings,
        thesisSentiment: thesisMap[sym] ?? null,
      };
    })
  );

  return addSecurityHeaders(NextResponse.json({ success: true, data: results }));
}

export const POST = withAuth(handler);
