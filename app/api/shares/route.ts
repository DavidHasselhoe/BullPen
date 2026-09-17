import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { computeTodaySparkline, getTodayCandlesForSymbol, type SparklineHolding, type CandleData } from '@/lib/holdings/today-sparkline';
import { getStockQuotes } from '@/lib/market-data';
import { isOutsideRegularSessionET } from '@/lib/twelvedata/twelvedata-client';
import { randomBytes } from 'crypto';

interface CreateShareBody {
  includeAmount?: boolean;
  anonymous?: boolean;
}

interface HoldingRow {
  symbol: string;
  quantity: number | null;
  mic_code: string | null;
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
    .select('symbol, quantity, mic_code')
    .eq('user_id', session.userId);

  // Snapshotted onto the row below (not joined live at render time) — same
  // "frozen, independent of what happens to the account later" reasoning as
  // pct/pnl_usd/sparkline. Never fetched at all when anonymous is true, and
  // stored ready to render, @-prefix and all: a username is a handle, a real
  // name isn't. Same `full_name || username` order the rest of the app names
  // people by (ThesisSection, the social feed) — username alone is null for
  // anyone who signed up without picking one, which is why cards that weren't
  // anonymous at all still read "A BullPen investor".
  let username: string | null = null;
  if (!anonymous) {
    const { data: userRow } = await supabase
      .from('users')
      .select('username, full_name')
      .eq('id', session.userId)
      .single();
    const profile = userRow as { username: string | null; full_name: string | null } | null;
    username =
      profile?.full_name?.trim() || (profile?.username ? `@${profile.username}` : null) || null;
  }

  const positions = ((holdingRows ?? []) as HoldingRow[])
    .filter((h) => (h.quantity ?? 0) > 0)
    .map((h) => ({ symbol: h.symbol.toUpperCase(), quantity: h.quantity as number, micCode: h.mic_code }));

  if (positions.length === 0) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'no_holdings' }, { status: 200 })
    );
  }

  // The same quote call the Holdings page makes for its day-change column,
  // prepost and mic_code included. The card's number IS that page's number,
  // so it has to come from that page's source rather than be re-derived.
  const micCodes: Record<string, string> = {};
  for (const p of positions) if (p.micCode) micCodes[p.symbol] = p.micCode;
  const quotes = await getStockQuotes(positions.map((p) => p.symbol), {
    prepost: isOutsideRegularSessionET(),
    ...(Object.keys(micCodes).length > 0 ? { micCodes } : {}),
  }).catch(() => new Map());

  const eligible: SparklineHolding[] = positions.map((p) => {
    const q = quotes.get(p.symbol);
    return {
      symbol: p.symbol,
      quantity: p.quantity,
      prevClose: q?.pc ?? null,
      currentPrice: q?.c ?? null,
    };
  });

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
    // 8-char URL-safe, cryptographically random slug (e.g. "xK3mQ2Fh") — not
    // sequential, so shares can't be enumerated by incrementing an ID. 6
    // random bytes / base64url gives ~2.8×10^14 possible values; collision
    // risk against this table is negligible even at scale.
    const id = randomBytes(6).toString('base64url');
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
