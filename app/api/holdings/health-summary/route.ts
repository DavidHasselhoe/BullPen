import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { catLabel, type CategoryScore, type HealthGrade } from '@/lib/finance/health-score';

export interface TickerHealth {
  score: number;
  grade: HealthGrade;
  categories: CategoryScore[];
}

/**
 * POST /api/holdings/health-summary
 * Body: { symbols: string[] }
 *
 * Batch-reads the canonical, persisted health score + 5-category breakdown
 * from screener_stats (same source as the stock page and screener — see
 * app/api/watchlist/enhanced/route.ts for the precedent this follows).
 * Tickers with no persisted health_score are omitted entirely rather than
 * fetched on-demand — the portfolio-level aggregation excludes them and
 * shows a coverage count instead.
 */
async function handler(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => null);

  if (!body || !Array.isArray(body.symbols)) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'symbols must be an array' }, { status: 400 })
    );
  }

  const symbols = (body.symbols as string[]).map((s) => String(s).toUpperCase().trim()).filter(Boolean);

  if (symbols.length === 0) {
    return addSecurityHeaders(NextResponse.json({ success: true, data: {} }));
  }

  const { data, error } = await createServerClient()
    .from('screener_stats')
    .select('ticker, health_score, health_score_grade, health_profitability, health_financial_strength, health_valuation, health_growth, health_market_risk')
    .in('ticker', symbols);

  if (error) {
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'query_failed' }, { status: 500 }));
  }

  const out: Record<string, TickerHealth> = {};
  for (const row of data ?? []) {
    if (row.health_score == null || row.health_score_grade == null) continue;
    out[row.ticker] = {
      score: row.health_score,
      grade: row.health_score_grade as HealthGrade,
      // Category columns can be NULL for a ticker whose aggregate health_score
      // predates the categories migration and hasn't been re-synced yet (no
      // backfill — see migration 122). Mark those explicitly unavailable
      // rather than defaulting to 0, so portfolio aggregation excludes them
      // from that category's weighting instead of dragging it toward zero.
      categories: (
        [
          ['Profitability', row.health_profitability, 30],
          ['Financial Strength', row.health_financial_strength, 25],
          ['Valuation', row.health_valuation, 20],
          ['Growth', row.health_growth, 15],
          ['Market Risk', row.health_market_risk, 10],
        ] as const
      ).map(([name, score, max]) => ({
        name,
        score: score ?? 0,
        max,
        label: score == null ? 'Unavailable' : catLabel(score, max),
        dataAvailable: score != null,
      })),
    };
  }

  return addSecurityHeaders(NextResponse.json({ success: true, data: out }));
}

export const POST = withAuth(handler, { rateLimit: { windowMs: 60_000, maxRequests: 60 } });
