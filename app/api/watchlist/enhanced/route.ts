import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { getCached } from '@/lib/cache/market-data-cache';
import type { CompanyStatistics } from '@/lib/twelvedata/twelvedata-client';

function gradeLabel(grade: string): string {
  switch (grade) {
    case 'A': return 'Strong';
    case 'B': return 'Good';
    case 'C': return 'Fair';
    case 'D': return 'Weak';
    default: return 'At Risk';
  }
}

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
 * Health score: read from screener_stats — the same persisted, synced value
 * shown on the stock page and screener, rather than recomputed here from
 * whatever happens to be cached (which could disagree with those surfaces).
 * Earnings: read from the cached TwelveData /earnings payload only — no Finnhub
 * fallback, since BullPen isn't licensed to display Finnhub data (news + fallback
 * prices are the only permitted uses). A symbol with no cached upcoming date from
 * TD simply shows no earnings badge.
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

  // ── Canonical health scores (single query, matches stock page + screener) ──
  const { data: healthRows } = await supabase
    .from('screener_stats')
    .select('ticker, health_score, health_score_grade')
    .in('ticker', symbols);

  const healthMap = new Map<string, EnhancedData['healthScore']>();
  for (const row of healthRows ?? []) {
    if (row.health_score != null && row.health_score_grade) {
      healthMap.set(row.ticker, {
        score: row.health_score,
        grade: row.health_score_grade,
        label: gradeLabel(row.health_score_grade),
      });
    }
  }

  // ── Read remaining caches in parallel ─────────────────────────────────────
  const cacheResults = await Promise.all(
    symbols.map(async (sym) => {
      const [stats, earnings] = await Promise.all([
        getCached<CompanyStatistics>(`stats:${sym}`),
        getCached<EarningsItem[]>(`snap-earnings:${sym}`),
      ]);
      return { sym, stats, earnings };
    })
  );

  // ── Build results ─────────────────────────────────────────────────────────
  const results: Record<string, EnhancedData> = {};

  for (const { sym, stats, earnings } of cacheResults) {
    const healthScore = healthMap.get(sym) ?? null;

    // Earnings — TD cache only (see doc comment above on why there's no fallback)
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
