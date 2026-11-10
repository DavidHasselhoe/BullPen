/**
 * GET /api/stock/[ticker]/spotlight
 *
 * Home's "Your stock up close" section: everything worth knowing about one
 * holding that BullPen already has on file. Its health score and strongest and
 * weakest pillar, its next earnings date, the tracked members of Congress who
 * traded it and the funds whose latest 13F holds it, and its biggest
 * same-industry peers.
 *
 * Stored rows only, never a TwelveData or vendor call: screener_stats, the
 * calendar the cron warms 45 days ahead (read with allowFetch: false),
 * congress_trades and the 13F tables. The same public records the stock page
 * shows to anyone, so CDN-cached rather than per user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { slugToSymbol } from '@/lib/assets/asset-type';
import { validateTicker } from '@/lib/security/input-validation';
import { getTradesForSymbols } from '@/lib/congress/insights';
import { tradeDirection, type TradeDirection } from '@/lib/congress/types';
import { getFundHolders } from '@/lib/stock/subpage-data';
import { getCalendarRange, dropMisdatedEarnings } from '@/lib/market-data/calendar-days';
import { addDays, todayET } from '@/lib/dates/calendar-format';
import { HEALTH_CATEGORIES } from '@/lib/finance/health-score';
import type { EarningsCalendarItem } from '@/lib/twelvedata/twelvedata-client';
import { displayCompanyName } from '@/lib/market-data/company-name';
import { shortFundName } from '@/lib/institutions/format';

const MAX_MEMBERS = 3;
const MAX_FUNDS = 3;
const MAX_PEERS = 4;
const EARNINGS_DAYS_AHEAD = 45;

type Pillar = (typeof HEALTH_CATEGORIES)[number]['column'];

export interface Spotlight {
  symbol: string;
  name: string;
  health: { score: number; grade: string; strongest: Pillar | null; weakest: Pillar | null } | null;
  nextEarnings: { date: string; time: string | null; estimated: boolean } | null;
  members: { slug: string; displayName: string; direction: TradeDirection; date: string; trades: number }[];
  funds: { slug: string; name: string; logoUrl: string | null; portfolioPct: number | null; periodOfReport: string }[];
  peers: { symbol: string; name: string }[];
}

type StatsRow = {
  ticker: string; name: string | null; industry: string | null; health_score: number | null; health_score_grade: string | null;
} & Partial<Record<Pillar, number | null>>;

/**
 * Strongest and weakest pillar by share of its own maximum. A spread under 25
 * points says nothing stands out, so no pillar is named rather than the
 * difference between "Excellent" and "Excellent".
 */
function pillarExtremes(row: Partial<Record<Pillar, number | null>>): { strongest: Pillar | null; weakest: Pillar | null } {
  const scored = HEALTH_CATEGORIES
    .filter((c) => row[c.column] != null)
    .map((c) => ({ column: c.column, ratio: Number(row[c.column]) / c.max }));
  if (scored.length < 2) return { strongest: null, weakest: null };
  const sorted = [...scored].sort((a, b) => b.ratio - a.ratio);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  if (top.ratio - bottom.ratio < 0.25) return { strongest: null, weakest: null };
  return { strongest: top.column, weakest: bottom.column };
}

async function nextEarnings(symbol: string): Promise<Spotlight['nextEarnings']> {
  const today = todayET();
  const { byDate } = await getCalendarRange<EarningsCalendarItem>('earnings', today, addDays(today, EARNINGS_DAYS_AHEAD), { allowFetch: false });
  const row = [...dropMisdatedEarnings(byDate).values()]
    .flat()
    .filter((r) => r.symbol?.toUpperCase() === symbol)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  return row ? { date: row.date, time: row.time ?? null, estimated: !!row.date_estimated } : null;
}

async function handler(_request: NextRequest, context?: unknown) {
  const { params } = (context ?? {}) as { params: Promise<{ ticker: string }> };
  const check = validateTicker(slugToSymbol((await params).ticker));
  if (!check.valid || !check.normalized) {
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'Invalid ticker' }, { status: 400 }));
  }
  const symbol = check.normalized.toUpperCase();
  const db = createServerClient();

  try {
    const pillarColumns = HEALTH_CATEGORIES.map((c) => c.column).join(', ');
    const { data: stats, error } = await db
      .from('screener_stats')
      .select(`ticker, name, industry, health_score, health_score_grade, ${pillarColumns}`)
      .eq('ticker', symbol)
      .maybeSingle();
    if (error) throw error;
    const row = stats as StatsRow | null;

    const [trades, holders, earnings, peerRows] = await Promise.all([
      getTradesForSymbols([symbol], 365, 100),
      getFundHolders(symbol),
      // A cold calendar cache is "no date on file", not a failed section.
      nextEarnings(symbol).catch(() => null),
      row?.industry
        ? db
            .from('screener_stats')
            .select('ticker, name')
            .eq('industry', row.industry)
            .neq('ticker', symbol)
            .not('market_cap', 'is', null)
            .order('market_cap', { ascending: false })
            // Extra rows: another share class of the same company is dropped below.
            .limit(MAX_PEERS + 4)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (peerRows.error) throw peerRows.error;

    // One line per member: their latest trade in it, and how many in the year.
    const byMember = new Map<string, Spotlight['members'][number]>();
    for (const t of trades) {
      const seen = byMember.get(t.slug);
      if (seen) { seen.trades++; continue; }
      byMember.set(t.slug, { slug: t.slug, displayName: t.displayName, direction: tradeDirection(t.tradeType), date: t.transactionDate, trades: 1 });
    }

    const name = row?.name && row.name !== symbol ? displayCompanyName(row.name, symbol) : symbol;
    const body: Spotlight = {
      symbol,
      name,
      health:
        row?.health_score != null && row.health_score_grade
          ? { score: row.health_score, grade: row.health_score_grade, ...pillarExtremes(row) }
          : null,
      nextEarnings: earnings,
      members: [...byMember.values()].slice(0, MAX_MEMBERS),
      // By conviction, not dollars: 9% of Tiger's portfolio says more than 1% of Citadel's.
      funds: [...holders].sort((a, b) => (b.portfolioPct ?? 0) - (a.portfolioPct ?? 0)).slice(0, MAX_FUNDS).map((h) => ({
        slug: h.fund.slug,
        name: shortFundName(h.fund.name),
        logoUrl: h.fund.logoUrl,
        portfolioPct: h.portfolioPct,
        periodOfReport: h.periodOfReport,
      })),
      peers: ((peerRows.data ?? []) as { ticker: string; name: string | null }[])
        .map((p) => ({ symbol: p.ticker, name: p.name ? displayCompanyName(p.name, p.ticker) : p.ticker }))
        // GOOG is not a peer of GOOGL: another share class reads as the same name.
        .filter((p) => p.name !== name)
        .slice(0, MAX_PEERS),
    };

    const res = NextResponse.json({ success: true, spotlight: body });
    res.headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return addSecurityHeaders(res);
  } catch (err) {
    console.error(`[spotlight] ${symbol} failed`, err);
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'Failed to load' }, { status: 500 }));
  }
}

export const GET = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 60 });
