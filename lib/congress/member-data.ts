/**
 * The Washington Trading reads, shared by the public API routes
 * (/api/congress, /api/congress/[slug]) and the pages that server-render the
 * same data. robots.txt keeps crawlers out of /api/, so a page that only
 * fetched these in the browser reached Google empty.
 */

import { cache } from 'react';
import { createServerClient } from '@/lib/supabase/client';
import { getCached, setCached } from '@/lib/cache/market-data-cache';
import { isPlausibleTradeDate, type CongressTradeRow } from '@/lib/congress/types';

const LIST_CACHE_KEY = 'congress:member-list:v4';
const LIST_CACHE_TTL_SECONDS = 60 * 60;

/** Trades shown on a member page. Deep history lives behind the vendor, not
 *  here — we only store the most recent 100 per member (see ingest-trades). */
const TRADE_LIMIT = 100;

/**
 * A member page with fewer disclosed trades than this is thin: it stays
 * reachable and linked, but is noindex and left out of the sitemap. Same bar
 * as a stock's congress-trades subpage (MIN_CONGRESS_TRADES).
 */
export const MIN_MEMBER_TRADES = 5;

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

/**
 * The curated member list. Returns only counts and dates, never a portfolio
 * value: the estimated position values in congress_holdings are reconstructed
 * from bracket midpoints (migration 150), and a dollar figure on a card,
 * stripped of the disclaimer that belongs with it, is exactly the shape of
 * number this codebase refuses to ship.
 */
export async function loadCongressMembers(): Promise<CongressMemberSummary[]> {
  const cached = await getCached<{ members: CongressMemberSummary[] }>(LIST_CACHE_KEY);
  if (cached) return cached.members;

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
      const [{ count: tradeCount }, { count: positionCount }, { data: newest }] = await Promise.all([
        supabase.from('congress_trades').select('id', { count: 'exact', head: true }).eq('politician_id', m.id),
        supabase.from('congress_holdings').select('id', { count: 'exact', head: true }).eq('politician_id', m.id),
        supabase
          .from('congress_trades')
          .select('transaction_date, disclosure_date')
          .eq('politician_id', m.id)
          .order('transaction_date', { ascending: false })
          // ponytail: newest 50 cover today's worst case (Khanna, 15 such rows);
          // a SQL view with transaction_date <= disclosure_date if one ever has more.
          .limit(50)
          .returns<{ transaction_date: string; disclosure_date: string | null }[]>(),
      ]);
      // Source rows occasionally carry a date after their own disclosure (a
      // bond's coupon or maturity date in place of the trade date): Hern's
      // filing of Sep 25 listed Oct 1 and Nov 1, shown as "to Nov 2026". A
      // trade cannot postdate the report of it, and PostgREST cannot compare
      // two columns, so the newest rows are checked here.
      const latest = (newest ?? []).find((t) => !t.disclosure_date || t.transaction_date <= t.disclosure_date);

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
  void setCached(LIST_CACHE_KEY, 'congress', 'congress_member_list', { members }, LIST_CACHE_TTL_SECONDS);
  return members;
}

/**
 * One member's estimated open positions plus their disclosed trades, or null
 * when the slug is not an active member. `holdings` and `trades` are NOT the
 * same class of data and stay apart deliberately:
 *   - trades are filed facts: a bracket, a date, a direction
 *   - holdings are the vendor's reconstruction from bracket midpoints, and
 *     ship with `holdingsDisclaimer`, which the UI is required to render
 * Anything that merges them into one "portfolio" number is wrong.
 * cache() dedupes the read between a page's generateMetadata and its body.
 */
export const loadCongressMember = cache(async (slug: string): Promise<CongressMemberDetail | null> => {
  const supabase = createServerClient();

  const { data: member, error: memberErr } = await supabase
    .from('congress_politicians')
    .select('id, slug, display_name, party, state, chamber, bioguide_id, holdings_synced_at, holdings_disclaimer')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle<MemberRow & { holdings_disclaimer: string | null }>();
  if (memberErr) throw new Error(memberErr.message);
  if (!member) return null;

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

  // Readable names from our own catalogue, by ticker. The filed wording is
  // upper-case, truncated and full of account tags ('FIDELITY NATL
  // INFORMATIO', 'JP Morgan Chase & Co. [sT]'), and it reached the rows and
  // the generated summary sentence. Same fix as the 13F pages (load-holdings).
  const symbols = [
    ...new Set(
      [...((holdings ?? []) as { symbol: string | null }[]), ...((trades ?? []) as { symbol: string | null }[])]
        .map((r) => r.symbol)
        .filter((s): s is string => !!s),
    ),
  ];
  const catalogue = new Map<string, string>();
  for (let i = 0; i < symbols.length; i += 500) {
    const { data: names } = await supabase.from('search_index').select('ticker, name').in('ticker', symbols.slice(i, i + 500));
    for (const r of (names as { ticker: string; name: string }[] | null) ?? []) catalogue.set(r.ticker, r.name);
  }

  return {
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
      // An option keeps its filed name: the page tells options from shares by it (isOptionPosition).
      companyName: /\b(call|put)\s+option/i.test((h.company_name as unknown as string) ?? '')
        ? (h.company_name as unknown as string)
        : catalogue.get(h.symbol as unknown as string) ?? (h.company_name as unknown as string) ?? null,
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
    trades: ((trades ?? []) as Record<string, never>[]).map((t) => {
      const transactionDate = t.transaction_date as unknown as string;
      const disclosureDate = (t.disclosure_date as unknown as string) ?? null;
      const plausible = isPlausibleTradeDate(transactionDate, disclosureDate);
      return {
        id: t.id as unknown as string,
        symbol: (t.symbol as unknown as string) ?? null,
        assetDescription: (t.asset_description as unknown as string) ?? '',
        companyName: t.symbol ? catalogue.get(t.symbol as unknown as string) ?? null : null,
        assetType: (t.asset_type as unknown as string) ?? null,
        tradeType: t.trade_type as unknown as string,
        amountRange: t.amount_range as unknown as string,
        amountLow: num(t.amount_low),
        amountHigh: num(t.amount_high),
        transactionDate: plausible ? transactionDate : null,
        disclosureDate,
        daysToDisclose: plausible ? num(t.days_to_disclose) : null,
        sector: (t.sector as unknown as string) ?? null,
        priceAtTrade: plausible ? num(t.price_at_trade) : null,
        priceAtDisclosure: num(t.price_at_disclosure),
      };
    }),
  };
});

/** Postgres NUMERIC comes back as a string through PostgREST. */
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
