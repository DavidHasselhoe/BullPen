/**
 * GET /api/congress/[slug]
 *
 * One member's estimated open positions plus their disclosed trades, for the
 * detail page. Public, no auth (migration 149).
 *
 * `holdings` and `trades` are NOT the same class of data and the response
 * keeps them apart deliberately:
 *   - trades are filed facts: a bracket, a date, a direction
 *   - holdings are the vendor's reconstruction from bracket midpoints, and
 *     ship with `holdingsDisclaimer`, which the UI is required to render
 * Anything that merges them into one "portfolio" number is wrong.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import type { CongressTradeRow } from '@/lib/congress/types';

/** Trades shown on a member page. Deep history lives behind the vendor, not
 *  here — we only store the most recent 100 per member (see ingest-trades). */
const TRADE_LIMIT = 100;

export interface CongressHoldingRow {
  symbol: string;
  companyName: string | null;
  sector: string | null;
  estimatedShares: number | null;
  currentPrice: number | null;
  /** Estimated, from bracket midpoints. Never render to the cent. */
  currentValue: number | null;
  unrealizedPnlPct: number | null;
  totalBuys: number | null;
  totalSells: number | null;
  firstBuyDate: string | null;
  lastActivityDate: string | null;
}

export interface CongressMemberDetail {
  slug: string;
  displayName: string;
  party: string | null;
  state: string | null;
  chamber: string | null;
  bioguideId: string | null;
  holdings: CongressHoldingRow[];
  /** Null when no positions snapshot has been taken for this member yet. */
  holdingsSyncedAt: string | null;
  /** The vendor's caveat, stored with the snapshot it describes. */
  holdingsDisclaimer: string | null;
  trades: CongressTradeRow[];
}

async function handler(_request: NextRequest, context?: unknown) {
  const { params } = (context ?? {}) as { params: Promise<{ slug: string }> };
  const { slug } = await params;

  try {
    const supabase = createServerClient();

    const { data: member, error: memberErr } = await supabase
      .from('congress_politicians')
      .select(
        'id, slug, display_name, party, state, chamber, bioguide_id, holdings_synced_at, holdings_disclaimer',
      )
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle<{
        id: string;
        slug: string;
        display_name: string;
        party: string | null;
        state: string | null;
        chamber: string | null;
        bioguide_id: string | null;
        holdings_synced_at: string | null;
        holdings_disclaimer: string | null;
      }>();

    if (memberErr) throw new Error(memberErr.message);
    if (!member) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'Member not found' }, { status: 404 }),
      );
    }

    const [{ data: holdings }, { data: trades }] = await Promise.all([
      supabase
        .from('congress_holdings')
        .select(
          'symbol, company_name, sector, estimated_shares, current_price, current_value, unrealized_pnl_pct, total_buys, total_sells, first_buy_date, last_activity_date',
        )
        .eq('politician_id', member.id)
        .order('current_value', { ascending: false, nullsFirst: false }),
      supabase
        .from('congress_trades')
        .select(
          'id, symbol, asset_description, asset_type, trade_type, amount_range, amount_low, amount_high, transaction_date, disclosure_date, days_to_disclose, sector, price_at_trade, price_at_disclosure',
        )
        .eq('politician_id', member.id)
        .not('symbol', 'is', null)
        .order('transaction_date', { ascending: false })
        .limit(TRADE_LIMIT),
    ]);

    const detail: CongressMemberDetail = {
      slug: member.slug,
      displayName: member.display_name,
      party: member.party,
      state: member.state,
      chamber: member.chamber,
      bioguideId: member.bioguide_id,
      holdingsSyncedAt: member.holdings_synced_at,
      holdingsDisclaimer: member.holdings_disclaimer,
      holdings: ((holdings ?? []) as Record<string, never>[]).map((h) => ({
        symbol: h.symbol as unknown as string,
        companyName: (h.company_name as unknown as string) ?? null,
        sector: (h.sector as unknown as string) ?? null,
        estimatedShares: num(h.estimated_shares),
        currentPrice: num(h.current_price),
        currentValue: num(h.current_value),
        unrealizedPnlPct: num(h.unrealized_pnl_pct),
        totalBuys: num(h.total_buys),
        totalSells: num(h.total_sells),
        firstBuyDate: (h.first_buy_date as unknown as string) ?? null,
        lastActivityDate: (h.last_activity_date as unknown as string) ?? null,
      })),
      trades: ((trades ?? []) as Record<string, never>[]).map((t) => ({
        id: t.id as unknown as string,
        symbol: (t.symbol as unknown as string) ?? null,
        assetDescription: (t.asset_description as unknown as string) ?? '',
        assetType: (t.asset_type as unknown as string) ?? null,
        tradeType: t.trade_type as unknown as string,
        amountRange: t.amount_range as unknown as string,
        amountLow: num(t.amount_low),
        amountHigh: num(t.amount_high),
        transactionDate: t.transaction_date as unknown as string,
        disclosureDate: (t.disclosure_date as unknown as string) ?? null,
        daysToDisclose: num(t.days_to_disclose),
        sector: (t.sector as unknown as string) ?? null,
        priceAtTrade: num(t.price_at_trade),
        priceAtDisclosure: num(t.price_at_disclosure),
      })),
    };

    return addSecurityHeaders(NextResponse.json({ success: true, member: detail }));
  } catch (err) {
    console.error('[api/congress/[slug]]', err);
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to load member' }, { status: 500 }),
    );
  }
}

/** Postgres NUMERIC comes back as a string through PostgREST. */
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export const GET = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 60 });
