import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { computeTodaySparkline, getTodayCandlesForSymbol, type SparklineHolding, type CandleData } from '@/lib/holdings/today-sparkline';
import { generateShareId } from '@/lib/shares/generate-share-id';

interface CreateShareBody {
  includeAmount?: boolean;
  anonymous?: boolean;
}

interface HoldingRow {
  symbol: string;
  avg_price: number | null;
  quantity: number | null;
  date_purchased: string | null;
  created_at: string;
}

async function handler(
  request: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as CreateShareBody;
  const includeAmount = body.includeAmount === true;
  const anonymous = body.anonymous === true;

  const supabase = createServerClient();
  const { data: holdingRows } = await supabase
    .from('user_holdings')
    .select('symbol, avg_price, quantity, date_purchased, created_at')
    .eq('user_id', session.userId);

  // Snapshotted onto the row below (not joined live at render time) — same
  // "frozen, independent of what happens to the account later" reasoning as
  // pct/pnl_usd/sparkline. Never fetched at all when anonymous is true.
  let username: string | null = null;
  if (!anonymous) {
    const { data: userRow } = await supabase
      .from('users')
      .select('username')
      .eq('id', session.userId)
      .single();
    username = (userRow as { username: string | null } | null)?.username ?? null;
  }

  const eligible: SparklineHolding[] = ((holdingRows ?? []) as HoldingRow[])
    .filter((h) => h.avg_price != null && (h.quantity ?? 0) > 0)
    .map((h) => ({
      symbol: h.symbol.toUpperCase(),
      avgPrice: h.avg_price as number,
      quantity: h.quantity as number,
      startMs: new Date(h.date_purchased ?? h.created_at).getTime(),
    }));

  if (eligible.length === 0) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'no_holdings' }, { status: 200 })
    );
  }

  const candleResults = await Promise.all(
    eligible.map(async (h) => ({ symbol: h.symbol, candles: await getTodayCandlesForSymbol(h.symbol) }))
  );
  const candlesBySymbol: Record<string, CandleData | null> = {};
  for (const { symbol, candles } of candleResults) candlesBySymbol[symbol] = candles;

  const result = computeTodaySparkline(eligible, candlesBySymbol);
  if (!result) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'no_data_yet' }, { status: 200 })
    );
  }

  // Retry once on the astronomically-rare slug collision (unique violation).
  for (let attempt = 0; attempt < 2; attempt++) {
    const id = generateShareId();
    const { error } = await supabase.from('portfolio_shares').insert({
      id,
      user_id: session.userId,
      username,
      date: new Date().toISOString().slice(0, 10),
      pct: result.pct,
      pnl_usd: includeAmount ? result.pnlUsd : null,
      currency: 'USD',
      sparkline: result.points,
      anonymous,
    } as never);

    if (!error) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
      return addSecurityHeaders(
        NextResponse.json({ success: true, id, url: `${appUrl}/share/${id}` })
      );
    }
    if (error.code !== '23505') {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'insert_failed' }, { status: 500 })
      );
    }
    // 23505 = unique_violation — loop and try a fresh id.
  }

  return addSecurityHeaders(
    NextResponse.json({ success: false, error: 'insert_failed' }, { status: 500 })
  );
}

export const POST = withAuth(handler, { rateLimit: { windowMs: 60 * 60 * 1000, maxRequests: 10 } });
