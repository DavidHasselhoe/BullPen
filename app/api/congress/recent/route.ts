/**
 * GET /api/congress/recent
 *
 * Recently disclosed congressional trades across the curated member list,
 * newest disclosure first. Public, no auth — unlike /api/institutions, the
 * underlying rows are public too (see migration 149's header on
 * 5 U.S.C. 13107: the disclosure facts are the "dissemination to the general
 * public" posture, and Pro sells the tooling around them).
 *
 * Reads only what a disclosure actually states. In particular it returns the
 * filed amount bracket as a low/high pair and never a midpoint — a filing
 * discloses a range, so a single "estimated value" would be a number nobody
 * filed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { getCached, setCached } from '@/lib/cache/market-data-cache';

const CACHE_KEY = 'congress:recent-trades:v1';
/** PTRs land 30-46 days after the trade and the sync cron runs twice a week,
 *  so anything shorter than an hour just re-queries unchanged rows. */
const CACHE_TTL_SECONDS = 60 * 60;

/** Rows read from the DB before thinning. Generous, because one member filing
 *  in bulk can easily account for all of them. */
const FETCH_LIMIT = 120;

/** Rows actually shown. Discover's own subhead promises "a read on the market
 *  in ten seconds"; a 40-row wall is not that. */
const DISPLAY_LIMIT = 12;

/**
 * Members disclose in bulk — a single PTR covers every trade in the period, so
 * they all share one disclosure_date and a straight "newest disclosed" sort
 * renders as one member's entire filing, then the next member's. That reads as
 * "Tuberville sold everything" rather than as a feed. Capping each member's
 * share keeps it a cross-member view even when only a few members are tracked.
 */
const MAX_PER_MEMBER = 3;

/** The STOCK Act filing deadline. Past this, a disclosure was filed late. */
export const STOCK_ACT_DEADLINE_DAYS = 45;

export interface CongressTradeRow {
  id: string;
  politicianSlug: string;
  politicianName: string;
  party: string | null;
  state: string | null;
  chamber: string | null;
  symbol: string | null;
  assetDescription: string;
  assetType: string | null;
  tradeType: string;
  /** The filed bracket verbatim, e.g. '$500,001 - $1,000,000'. */
  amountRange: string;
  amountLow: number | null;
  amountHigh: number | null;
  transactionDate: string;
  disclosureDate: string | null;
  daysToDisclose: number | null;
  filedLate: boolean;
}

interface JoinedRow {
  id: string;
  symbol: string | null;
  asset_description: string;
  asset_type: string | null;
  trade_type: string;
  amount_range: string;
  amount_low: number | null;
  amount_high: number | null;
  transaction_date: string;
  disclosure_date: string | null;
  days_to_disclose: number | null;
  congress_politicians: {
    slug: string;
    display_name: string;
    party: string | null;
    state: string | null;
    chamber: string | null;
    is_active: boolean;
  } | null;
}

async function handler(_request: NextRequest) {
  try {
    const cached = await getCached<{ trades: CongressTradeRow[] }>(CACHE_KEY);
    if (cached) {
      return addSecurityHeaders(NextResponse.json({ success: true, ...cached }));
    }

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('congress_trades')
      .select(
        `id, symbol, asset_description, asset_type, trade_type, amount_range,
         amount_low, amount_high, transaction_date, disclosure_date, days_to_disclose,
         congress_politicians!inner ( slug, display_name, party, state, chamber, is_active )`,
      )
      .eq('congress_politicians.is_active', true)
      // Equities only, on a stock app's Discover feed. Members disclose
      // treasuries, municipal bonds and LLC interests too; those rows are
      // stored (they are real disclosures, and re-fetching them later would
      // cost credits again) but they have no ticker to link to and the
      // section's own copy promises stock trades. A muni bond listed under
      // that heading makes the sentence false.
      .not('symbol', 'is', null)
      // Disclosure date is the "news" date — when the public could first know.
      // Ordering by transaction_date would bury a just-filed old trade.
      .order('disclosure_date', { ascending: false, nullsFirst: false })
      .order('transaction_date', { ascending: false })
      .limit(FETCH_LIMIT);

    if (error) throw new Error(error.message);

    const perMember = new Map<string, number>();

    const trades: CongressTradeRow[] = ((data ?? []) as unknown as JoinedRow[])
      .filter((r) => r.congress_politicians)
      .filter((r) => {
        const slug = r.congress_politicians!.slug;
        const seen = perMember.get(slug) ?? 0;
        if (seen >= MAX_PER_MEMBER) return false;
        perMember.set(slug, seen + 1);
        return true;
      })
      .slice(0, DISPLAY_LIMIT)
      .map((r) => {
        const p = r.congress_politicians!;
        return {
          id: r.id,
          politicianSlug: p.slug,
          politicianName: p.display_name,
          party: p.party,
          state: p.state,
          chamber: p.chamber,
          symbol: r.symbol,
          assetDescription: r.asset_description,
          assetType: r.asset_type,
          tradeType: r.trade_type,
          amountRange: r.amount_range,
          amountLow: r.amount_low,
          amountHigh: r.amount_high,
          transactionDate: r.transaction_date,
          disclosureDate: r.disclosure_date,
          daysToDisclose: r.days_to_disclose,
          filedLate: (r.days_to_disclose ?? 0) > STOCK_ACT_DEADLINE_DAYS,
        };
      });

    const payload = { trades };
    void setCached(CACHE_KEY, 'congress', 'congress_recent_trades', payload, CACHE_TTL_SECONDS);

    return addSecurityHeaders(NextResponse.json({ success: true, ...payload }));
  } catch (err) {
    console.error('[api/congress/recent]', err);
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to load congressional trades' }, { status: 500 }),
    );
  }
}

export const GET = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 60 });
