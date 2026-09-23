/**
 * Congressional trade ingestion — Disclosed Capitol -> congress_trades.
 *
 * Ingest-once-serve-many, same principle as lib/institutions/: a user page
 * view must never trigger a vendor call. This is the only thing in the
 * codebase that talks to Disclosed Capitol, so vendor spend scales with
 * real-world disclosure volume, not with subscriber count.
 *
 * CREDIT COST, measured live 2026-09-23 from the `x-credits-charged`
 * response header rather than trusted from docs:
 *   /politicians            -> 15 flat
 *   /trades/recent          -> 15 flat (caps at 50 rows regardless of limit)
 *   /politicians/{id}/trades -> 15 + 1 per row returned
 *
 * That per-row term is the whole cost model. Ro Khanna alone has 41,071
 * disclosed trades, so a full-history backfill of one member would cost
 * ~41,000 credits (~$41). We take the most recent TRADE_LIMIT per member
 * instead, which is also the better product: nobody wants a 41,000-row
 * archive, they want recent activity.
 */

import { createServerClient } from '@/lib/supabase/client';

const API_BASE = 'https://api.disclosedcapitol.com';

/**
 * Rows fetched per member per run. Cost per member is 15 + this number, so
 * the whole sweep is bounded by construction: 18 members * 115 = 2,070
 * credits (~$2.07) for a full backfill, and far less incrementally once
 * duplicates start landing.
 *
 * ponytail: fixed window rather than a since-cursor. PTRs arrive 30-46 days
 * after the trade, so nobody is racing us. If a member ever files more than
 * this between two runs we'd miss the overflow — switch to /v1/detections
 * with its `since` cursor if that ever shows up in the skipped counts.
 */
const TRADE_LIMIT = 100;

/** Hard ceiling per run. Nothing else calls this vendor, so a bounded loop is
 *  the whole budget guard — no shared reservation needed like TwelveData's. */
const MAX_CREDITS_PER_RUN = 4000;

export interface CongressPolitician {
  id: string;
  slug: string;
  dc_politician_id: number;
  display_name: string;
}

interface VendorTrade {
  id: number;
  ticker: string | null;
  trade_type: string | null;
  asset_type: string | null;
  asset_description: string | null;
  amount_range: string | null;
  amount_low: number | null;
  amount_high: number | null;
  transaction_date: string | null;
  disclosure_date: string | null;
  days_to_disclose: number | null;
  sector: string | null;
  industry: string | null;
  source: string | null;
}

export interface IngestResult {
  slug: string;
  fetched: number;
  inserted: number;
  skipped: number;
  creditsCharged: number;
  error?: string;
}

/**
 * The vendor returns the literal string 'N/A' for an asset it could not
 * resolve to a ticker, not null. Storing that verbatim would render a fake
 * ticker "N/A" on a real politician's row, so it is normalised to NULL here.
 * 38% of all rows are unresolved this way, but only 1.6% of asset_type
 * 'Stock' rows are — the rest are treasuries and municipal bonds, which have
 * no ticker to resolve in the first place.
 */
export function normalizeSymbol(ticker: string | null): string | null {
  if (!ticker) return null;
  const t = ticker.trim().toUpperCase();
  if (!t || t === 'N/A' || t === 'NA' || t === '--') return null;
  return t;
}

/**
 * Map vendor trades to DB rows, dropping any that aren't usable disclosure
 * records. Split out from ingestPolitician so it is testable without a
 * network call or a live API key.
 *
 * Note what is deliberately absent: nothing here collapses amount_low and
 * amount_high into a single "estimated value". A filing discloses a bracket,
 * so a midpoint would be a number no one filed. See
 * feedback-never-ship-synthetic-numbers.
 */
export function buildRows(trades: VendorTrade[], politicianId: string) {
  return trades
    // transaction_date is NOT NULL in the schema, and amount_range/trade_type
    // carry the filed bracket and direction; a row missing any of the three
    // is not a usable disclosure record.
    .filter((t) => t.transaction_date && t.amount_range && t.trade_type)
    .map((t) => ({
      politician_id: politicianId,
      dc_trade_id: t.id,
      symbol: normalizeSymbol(t.ticker),
      asset_description: t.asset_description ?? 'Undisclosed asset',
      asset_type: t.asset_type,
      trade_type: t.trade_type as string,
      amount_range: t.amount_range as string,
      amount_low: t.amount_low,
      amount_high: t.amount_high,
      transaction_date: t.transaction_date as string,
      disclosure_date: t.disclosure_date,
      days_to_disclose: t.days_to_disclose,
      sector: t.sector,
      industry: t.industry,
      source: t.source,
    }));
}

function apiKey(): string {
  const key = process.env.DISCLOSED_CAPITOL_API_KEY;
  if (!key) throw new Error('DISCLOSED_CAPITOL_API_KEY is not set');
  return key;
}

async function fetchTrades(
  dcPoliticianId: number,
): Promise<{ trades: VendorTrade[]; creditsCharged: number }> {
  const res = await fetch(
    `${API_BASE}/politicians/${dcPoliticianId}/trades?limit=${TRADE_LIMIT}`,
    { headers: { 'DC-API-Key': apiKey() }, cache: 'no-store' },
  );

  const creditsCharged = Number(res.headers.get('x-credits-charged') ?? 0);

  if (!res.ok) {
    throw new Error(`Disclosed Capitol ${res.status} for politician ${dcPoliticianId}`);
  }

  const body = await res.json();
  const trades: VendorTrade[] = Array.isArray(body) ? body : (body?.trades ?? []);
  return { trades, creditsCharged };
}

/**
 * Ingest one member's recent trades. Every member's work is independent and
 * commits as it completes, so one bad response never blocks another member —
 * same failure isolation as the 13F sync cron.
 *
 * Bonds, options and 'Other' rows are stored alongside stocks on purpose.
 * They arrive in the same already-paid response, so keeping them is free,
 * whereas dropping them means a future "all asset types" view would need a
 * full re-backfill at full credit cost. Read paths filter instead.
 */
export async function ingestPolitician(
  supabase: ReturnType<typeof createServerClient>,
  politician: CongressPolitician,
): Promise<IngestResult> {
  const base: IngestResult = {
    slug: politician.slug,
    fetched: 0,
    inserted: 0,
    skipped: 0,
    creditsCharged: 0,
  };

  let trades: VendorTrade[];
  try {
    const out = await fetchTrades(politician.dc_politician_id);
    trades = out.trades;
    base.creditsCharged = out.creditsCharged;
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : String(err) };
  }

  base.fetched = trades.length;

  const rows = buildRows(trades, politician.id);
  base.skipped = trades.length - rows.length;
  if (rows.length === 0) return base;

  // dc_trade_id is the vendor's stable per-trade id and is UNIQUE, so
  // re-running is a no-op rather than a duplicate. ignoreDuplicates keeps
  // already-stored rows untouched: a disclosure is an immutable historical
  // fact, and letting a later vendor response rewrite one would silently
  // change history.
  const { data, error } = await supabase
    .from('congress_trades')
    .upsert(rows, { onConflict: 'dc_trade_id', ignoreDuplicates: true })
    .select('id');

  if (error) return { ...base, error: error.message };

  base.inserted = data?.length ?? 0;
  return base;
}

/**
 * Sweep every active curated member. Returns per-member results plus the real
 * credit spend, which is logged rather than estimated — the same reason
 * TWELVE_DATA_USAGE_LOG exists.
 */
export async function ingestAllPoliticians(
  supabase: ReturnType<typeof createServerClient>,
  opts: { slugs?: string[] } = {},
): Promise<{ results: IngestResult[]; totalCredits: number }> {
  let query = supabase
    .from('congress_politicians')
    .select('id, slug, dc_politician_id, display_name')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (opts.slugs?.length) query = query.in('slug', opts.slugs);

  const { data: politicians, error } = await query;
  if (error) throw new Error(`Failed to load curated politicians: ${error.message}`);

  const results: IngestResult[] = [];
  let totalCredits = 0;

  for (const p of (politicians ?? []) as CongressPolitician[]) {
    if (totalCredits >= MAX_CREDITS_PER_RUN) {
      results.push({
        slug: p.slug,
        fetched: 0,
        inserted: 0,
        skipped: 0,
        creditsCharged: 0,
        error: `Stopped: run credit ceiling ${MAX_CREDITS_PER_RUN} reached`,
      });
      continue;
    }

    const result = await ingestPolitician(supabase, p);
    totalCredits += result.creditsCharged;
    results.push(result);
  }

  return { results, totalCredits };
}
