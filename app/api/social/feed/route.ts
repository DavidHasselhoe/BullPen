/**
 * GET /api/social/feed?lang=xx
 *
 * One timeline of everything the signed-in user follows: funds (their latest
 * 13F, as the free teaser), members of Congress (newly disclosed trades) and
 * other members (positions they added). Until 2026-10-19 it covered members
 * only, which 1 of 25 accounts used, while fund and politician follows, the
 * ones people actually make, never appeared here.
 *
 * Read with the service role and filtered explicitly: a member's adds only
 * when both their profile and their holdings are public (lib/social/visibility).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { areHoldingsPublic } from '@/lib/social/visibility';
import { buildFundTeaser, type FundTeaser } from '@/lib/institutions/fund-teaser';
import { formatAmountRange, tradeDirection, type TradeDirection } from '@/lib/congress/types';
import { isValidLocale } from '@/lib/i18n/language-names';

const MAX_ITEMS = 50;
/** Disclosure dates of a followed member's trades worth showing, newest first. */
const POLITICIAN_TRADE_ROWS = 200;
const TRADES_PER_ITEM = 3;

export type FeedItem =
  | {
      kind: 'member_add';
      id: string;
      date: string;
      member: { username: string | null; fullName: string | null; avatarUrl: string | null };
      symbol: string;
      companyName: string;
    }
  | {
      kind: 'fund_filing';
      id: string;
      date: string;
      fund: { slug: string; displayName: string };
      periodOfReport: string;
      teaser: FundTeaser;
    }
  | {
      kind: 'politician_trades';
      id: string;
      date: string;
      politician: { slug: string; displayName: string; party: string | null; state: string | null };
      trades: { symbol: string; direction: TradeDirection; amount: string; priceAtDisclosure: number | null }[];
      total: number;
    };

type Supabase = ReturnType<typeof createServerClient>;

async function memberAdds(supabase: Supabase, userId: string): Promise<FeedItem[]> {
  const { data: follows } = await supabase.from('user_follows').select('following_id').eq('follower_id', userId);
  const ids = (follows ?? []).map((r: { following_id: string }) => r.following_id);
  if (ids.length === 0) return [];

  const { data: profiles } = await supabase
    .from('users')
    .select('id, username, full_name, avatar_url, settings')
    .in('id', ids);
  const visible = new Map(
    (profiles ?? [])
      .filter((p: { settings: Record<string, unknown> | null }) => areHoldingsPublic(p.settings))
      .map((p: { id: string; username: string | null; full_name: string | null; avatar_url: string | null }) => [
        p.id,
        { username: p.username, fullName: p.full_name, avatarUrl: p.avatar_url },
      ])
  );
  if (visible.size === 0) return [];

  const { data: rows } = await supabase
    .from('user_holdings')
    .select('id, user_id, symbol, company_name, created_at')
    .in('user_id', [...visible.keys()])
    .order('created_at', { ascending: false })
    .limit(MAX_ITEMS);

  return (rows ?? []).map((h: { id: string; user_id: string; symbol: string; company_name: string; created_at: string }) => ({
    kind: 'member_add' as const,
    id: `member:${h.id}`,
    date: h.created_at,
    member: visible.get(h.user_id)!,
    symbol: h.symbol,
    companyName: h.company_name,
  }));
}

async function fundFilings(supabase: Supabase, userId: string, lang: string): Promise<FeedItem[]> {
  const { data: follows } = await supabase
    .from('user_institution_follows')
    .select('institutional_investors(slug)')
    .eq('user_id', userId);
  const slugs = (follows ?? [])
    .map((f: { institutional_investors: { slug: string } | null }) => f.institutional_investors?.slug)
    .filter((s): s is string => !!s);

  const results = await Promise.all(slugs.map((slug) => buildFundTeaser(slug, lang).catch(() => null)));
  return results.flatMap((r) =>
    r?.ok
      ? [{
          kind: 'fund_filing' as const,
          id: `fund:${r.fund.slug}:${r.filing.periodOfReport}`,
          date: r.filing.filedDate,
          fund: r.fund,
          periodOfReport: r.filing.periodOfReport,
          teaser: r.teaser,
        }]
      : []
  );
}

async function politicianTrades(supabase: Supabase, userId: string): Promise<FeedItem[]> {
  const { data: follows } = await supabase
    .from('user_politician_follows')
    .select('congress_politicians(id, slug, display_name, party, state)')
    .eq('user_id', userId);
  const members = new Map(
    (follows ?? [])
      .map((f: { congress_politicians: { id: string; slug: string; display_name: string; party: string | null; state: string | null } | null }) => f.congress_politicians)
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => [p.id, { slug: p.slug, displayName: p.display_name, party: p.party, state: p.state }])
  );
  if (members.size === 0) return [];

  // Only trades with a resolved ticker, same as the follow notification: the
  // rest are treasuries and munis.
  const { data: rows } = await supabase
    .from('congress_trades')
    .select('politician_id, symbol, trade_type, amount_low, amount_high, amount_range, disclosure_date, price_at_disclosure')
    .in('politician_id', [...members.keys()])
    .not('symbol', 'is', null)
    .not('disclosure_date', 'is', null)
    .order('disclosure_date', { ascending: false })
    .limit(POLITICIAN_TRADE_ROWS);

  // One item per member per disclosure date: a filing lists several trades.
  const groups = new Map<string, Extract<FeedItem, { kind: 'politician_trades' }>>();
  for (const t of (rows ?? []) as {
    politician_id: string; symbol: string; trade_type: string; amount_low: number | null; amount_high: number | null;
    amount_range: string; disclosure_date: string; price_at_disclosure: number | null;
  }[]) {
    const key = `${t.politician_id}:${t.disclosure_date}`;
    let item = groups.get(key);
    if (!item) {
      item = { kind: 'politician_trades', id: `politician:${key}`, date: t.disclosure_date, politician: members.get(t.politician_id)!, trades: [], total: 0 };
      groups.set(key, item);
    }
    item.total++;
    if (item.trades.length < TRADES_PER_ITEM) {
      item.trades.push({
        symbol: t.symbol,
        direction: tradeDirection(t.trade_type),
        amount: formatAmountRange(t.amount_low, t.amount_high, t.amount_range),
        priceAtDisclosure: t.price_at_disclosure,
      });
    }
  }
  return [...groups.values()];
}

async function handler(req: NextRequest, _ctx: unknown, session: { userId: string }): Promise<NextResponse> {
  const requested = req.nextUrl.searchParams.get('lang') ?? 'en';
  const lang = isValidLocale(requested) ? requested : 'en';
  const supabase = createServerClient();

  try {
    const [members, funds, politicians] = await Promise.all([
      memberAdds(supabase, session.userId),
      fundFilings(supabase, session.userId, lang),
      politicianTrades(supabase, session.userId),
    ]);

    const feed = [...members, ...funds, ...politicians]
      // ISO dates and timestamps sort correctly as strings.
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, MAX_ITEMS);

    return addSecurityHeaders(NextResponse.json({ success: true, feed }));
  } catch (err) {
    console.error('[social/feed] failed:', err);
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'Failed to fetch feed' }, { status: 500 }));
  }
}

export const GET = withAuth(handler);
