import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';

interface HealthScoreHistoryRow {
  fiscal_date: string;
  snapshot_date: string;
  score: number;
  grade: string;
}

async function handler(
  _request: NextRequest,
  context: { params: Promise<{ ticker: string }> },
  _session: { userId: string }
): Promise<NextResponse> {
  const { ticker } = await context.params;
  const symbol = ticker.toUpperCase();

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('health_score_history')
      .select('fiscal_date, snapshot_date, score, grade')
      .eq('ticker', symbol)
      .order('snapshot_date', { ascending: true });

    if (error) throw new Error(error.message);

    const rows = (data ?? []) as HealthScoreHistoryRow[];

    return addSecurityHeaders(
      NextResponse.json(
        {
          success: true,
          data: rows.map((r) => ({
            fiscalDate: r.fiscal_date,
            snapshotDate: r.snapshot_date,
            score: r.score,
            grade: r.grade,
          })),
        },
        { headers: { 'Cache-Control': 'private, max-age=3600' } }
      )
    );
  } catch (err) {
    console.error(`[health-score-history] Error for ${symbol}:`, err);
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to fetch health score history' }, { status: 500 })
    );
  }
}

export const GET = withRateLimit(withAuth(handler), { windowMs: 60 * 1000, maxRequests: 30 });
