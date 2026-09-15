/**
 * GET /api/onboarding/health-scores?symbols=NVDA,MSFT
 *
 * Health Scores for the onboarding preview, read ONLY from screener_stats
 * (the persisted canonical score). This screen is reachable before signup, and
 * computing a score for an uncached symbol costs ~300 TwelveData credits
 * (three statement fetches), so this route never computes. A symbol without a
 * persisted score is simply absent from the response.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { validateTicker } from '@/lib/security/input-validation';

const MAX_SYMBOLS = 20;

async function handler(request: NextRequest): Promise<NextResponse> {
  const raw = request.nextUrl.searchParams.get('symbols') ?? '';
  const symbols = [
    ...new Set(
      raw
        .split(',')
        .map((s) => validateTicker(s.trim()))
        .filter((v) => v.valid && v.normalized)
        .map((v) => v.normalized as string)
    ),
  ].slice(0, MAX_SYMBOLS);

  if (symbols.length === 0) return addSecurityHeaders(NextResponse.json({ scores: {} }));

  const { data } = await createServerClient()
    .from('screener_stats')
    .select('ticker, health_score, health_score_grade')
    .in('ticker', symbols)
    .not('health_score', 'is', null);

  const scores: Record<string, { score: number; grade: string }> = {};
  for (const row of (data as { ticker: string; health_score: number; health_score_grade: string | null }[] | null) ?? []) {
    if (row.health_score_grade) scores[row.ticker] = { score: row.health_score, grade: row.health_score_grade };
  }

  return addSecurityHeaders(
    NextResponse.json({ scores }, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600' } })
  );
}

export const GET = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 30 });
