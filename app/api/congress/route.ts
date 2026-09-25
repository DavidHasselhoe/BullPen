/**
 * GET /api/congress
 *
 * The curated member list for the Discover section. Public, no auth — see
 * migration 149's header on 5 U.S.C. 13107 for why this data is deliberately
 * open where the 13F equivalent is Pro-gated.
 *
 * Returns only counts and dates, never a portfolio value. The estimated
 * position values in congress_holdings are reconstructed from bracket
 * midpoints (migration 150), and a dollar figure on a card, stripped of the
 * disclaimer that belongs with it, is exactly the shape of number this
 * codebase refuses to ship.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { getCached, setCached } from '@/lib/cache/market-data-cache';

const CACHE_KEY = 'congress:member-list:v1';
const CACHE_TTL_SECONDS = 60 * 60;

/** Same list for every visitor: let the CDN answer before the DB cache is even asked. */
function cdn(res: NextResponse): NextResponse {
  res.headers.set('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=86400');
  return addSecurityHeaders(res);
}

export interface CongressMemberSummary {
  slug: string;
  displayName: string;
  party: string | null;
  state: string | null;
  chamber: string | null;
  bioguideId: string | null;
  /** Disclosed trades we hold for this member. */
  tradeCount: number;
  /** Estimated open positions, or null when no snapshot has been taken yet. */
  positionCount: number | null;
  /** Most recent transaction date across this member's disclosed trades. */
  lastTradeDate: string | null;
}

interface MemberRow {
  id: string;
  slug: string;
  display_name: string;
  party: string | null;
  state: string | null;
  chamber: string | null;
  bioguide_id: string | null;
  holdings_synced_at: string | null;
}

async function handler(_request: NextRequest) {
  try {
    const cached = await getCached<{ members: CongressMemberSummary[] }>(CACHE_KEY);
    if (cached) return cdn(NextResponse.json({ success: true, ...cached }));

    const supabase = createServerClient();

    const { data: rows, error } = await supabase
      .from('congress_politicians')
      .select('id, slug, display_name, party, state, chamber, bioguide_id, holdings_synced_at')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) throw new Error(error.message);

    // Counted per member with head-only queries rather than by fetching rows
    // and grouping in JS: an unbounded .select() silently caps at 1000 rows,
    // which would quietly undercount as soon as a few members are backfilled.
    // Run across members in parallel, not member-by-member.
    const summaries = await Promise.all(
      ((rows ?? []) as MemberRow[]).map(async (m): Promise<CongressMemberSummary> => {
        const [{ count: tradeCount }, { count: positionCount }, { data: latest }] = await Promise.all([
        supabase
          .from('congress_trades')
          .select('id', { count: 'exact', head: true })
          .eq('politician_id', m.id),
        supabase
          .from('congress_holdings')
          .select('id', { count: 'exact', head: true })
          .eq('politician_id', m.id),
        supabase
          .from('congress_trades')
          .select('transaction_date')
          .eq('politician_id', m.id)
          .order('transaction_date', { ascending: false })
          .limit(1)
          .maybeSingle<{ transaction_date: string }>(),
        ]);

        return {
          slug: m.slug,
          displayName: m.display_name,
          party: m.party,
          state: m.state,
          chamber: m.chamber,
          bioguideId: m.bioguide_id,
          tradeCount: tradeCount ?? 0,
          // A member with no snapshot yet is null, not 0 — "no positions" and
          // "we have not looked" are different claims and the card says so.
          positionCount: m.holdings_synced_at ? (positionCount ?? 0) : null,
          lastTradeDate: latest?.transaction_date ?? null,
        };
      }),
    );

    // Seeded-but-not-yet-backfilled members are hidden rather than shown as
    // empty cards. The roster is seeded in full so a backfill needs no code
    // change, but a card reading "0 trades" tells a reader nothing true about
    // the member — only about our ingestion.
    const members = summaries.filter((m) => m.tradeCount > 0);

    const payload = { members };
    void setCached(CACHE_KEY, 'congress', 'congress_member_list', payload, CACHE_TTL_SECONDS);

    return cdn(NextResponse.json({ success: true, ...payload }));
  } catch (err) {
    console.error('[api/congress]', err);
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to load members' }, { status: 500 }),
    );
  }
}

export const GET = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 60 });
