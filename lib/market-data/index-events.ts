/**
 * Index membership changes and fund weights, as recorded by the weekly index
 * sync (scripts/sync-index-constituents.ts -> /api/cron/record-index-changes).
 *
 * The sync runs every Monday, so a change is known to a week, not a day:
 * detected_on is when the sync saw it. Copy always says "in the week of",
 * from indexChangeWeekOf(), never an exact date.
 */

import { createServerClient } from '@/lib/supabase/client';
import type { IndexId } from './index-membership';
import { DUAL_CLASS_CANONICAL } from './dual-class-shares';

export const INDEX_IDS: IndexId[] = ['sp500', 'nasdaq100', 'dow30'];

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

export interface IndexChangesPayload {
  /** YYYY-MM-DD (UTC) the sync ran. */
  detectedOn: string;
  events: { ticker: string; indexId: IndexId; change: 'added' | 'removed' }[];
  /** Fund weight per holding, as of the holdings file's own date. */
  weights: { indexId: IndexId; asOf: string; pct: Record<string, number> }[];
}

export interface IndexChangeEvent {
  ticker: string;
  indexId: IndexId;
  change: 'added' | 'removed';
  detectedOn: string;
}

/**
 * The Monday of the week a change happened in. A Monday sync reads Friday's
 * fund holdings, so what it finds changed during the week before.
 * ponytail: assumes the weekly Monday cadence; a mid-week manual rerun can be
 * a week early. Store the previous run's date if that ever matters.
 */
export function indexChangeWeekOf(detectedOn: string): string {
  const d = new Date(`${detectedOn}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) - 7);
  return d.toISOString().slice(0, 10);
}

/** Stores a sync's events (a rerun is a no-op) and replaces the weights. Returns only the newly stored events. */
export async function recordIndexChanges(payload: IndexChangesPayload): Promise<IndexChangeEvent[]> {
  const supabase = createServerClient();
  let fresh: IndexChangeEvent[] = [];
  if (payload.events.length > 0) {
    const { data, error } = await supabase
      .from('index_membership_events')
      .upsert(
        payload.events.map((e) => ({ ticker: e.ticker, index_id: e.indexId, change: e.change, detected_on: payload.detectedOn })),
        { onConflict: 'ticker,index_id,change,detected_on', ignoreDuplicates: true },
      )
      .select('ticker, index_id, change, detected_on');
    if (error) throw error;
    fresh = (data ?? []).map((r) => ({ ticker: r.ticker, indexId: r.index_id, change: r.change, detectedOn: r.detected_on }));
  }

  for (const w of payload.weights) {
    const rows = Object.entries(w.pct).map(([ticker, pct]) => ({ ticker, index_id: w.indexId, weight_pct: pct, as_of: w.asOf }));
    if (rows.length === 0) continue;
    const { error } = await supabase.from('index_weights').upsert(rows, { onConflict: 'ticker,index_id' });
    if (error) throw error;
    // Whatever this file no longer lists has left the fund.
    const { error: pruneError } = await supabase.from('index_weights').delete().eq('index_id', w.indexId).lt('as_of', w.asOf);
    if (pruneError) throw pruneError;
  }
  return fresh;
}

export interface IndexBadgeFact {
  /** Monday of the week it joined, when that was in the last ~90 days. */
  joinedWeekOf?: string;
  weightPct?: number;
  weightAsOf?: string;
}

/** What a stock page's index badges can add to their tooltips. Empty on any failure. */
export async function getIndexBadgeFacts(ticker: string): Promise<Partial<Record<IndexId, IndexBadgeFact>>> {
  const supabase = createServerClient();
  const [events, weights] = await Promise.all([
    supabase
      .from('index_membership_events')
      .select('index_id, detected_on')
      .eq('ticker', ticker)
      .eq('change', 'added')
      .gte('detected_on', daysAgo(90))
      .order('detected_on', { ascending: true }),
    // A weight older than a month is not shown at all, dated or not.
    supabase.from('index_weights').select('index_id, weight_pct, as_of').eq('ticker', ticker).gte('as_of', daysAgo(30)),
  ]);
  const facts: Partial<Record<IndexId, IndexBadgeFact>> = {};
  for (const e of events.data ?? []) {
    facts[e.index_id as IndexId] = { joinedWeekOf: indexChangeWeekOf(e.detected_on) };
  }
  for (const w of weights.data ?? []) {
    const id = w.index_id as IndexId;
    facts[id] = { ...facts[id], weightPct: Number(w.weight_pct), weightAsOf: w.as_of };
  }
  return facts;
}


/**
 * One index's fund weights for its page, or null when there are none from the
 * last 30 days. A dual-class pair (GOOG + GOOGL) is one row on the page, so the
 * dropped class's weight is folded into the class that is listed.
 */
export async function getIndexWeights(indexId: IndexId): Promise<{ asOf: string; pct: Record<string, number> } | null> {
  const { data } = await createServerClient()
    .from('index_weights')
    .select('ticker, weight_pct, as_of')
    .eq('index_id', indexId)
    .gte('as_of', daysAgo(30)); // ~503 rows: under PostgREST's 1000-row cap
  if (!data || data.length === 0) return null;
  const pct: Record<string, number> = {};
  for (const r of data) pct[r.ticker] = Number(r.weight_pct);
  for (const [dup, canonical] of Object.entries(DUAL_CLASS_CANONICAL)) {
    if (pct[dup] != null && pct[canonical] != null) pct[canonical] += pct[dup];
  }
  return { asOf: data[0].as_of, pct };
}

/** The most recent joins and exits for one index (last `days`, at most 12), newest first. A quarterly rebalance alone is ~8. */
export async function getRecentIndexEvents(indexId: IndexId, days: number): Promise<IndexChangeEvent[]> {
  const { data } = await createServerClient()
    .from('index_membership_events')
    .select('ticker, change, detected_on')
    .eq('index_id', indexId)
    .gte('detected_on', daysAgo(days))
    .order('detected_on', { ascending: false })
    .order('ticker')
    .limit(12);
  return (data ?? []).map((r) => ({ ticker: r.ticker, indexId, change: r.change, detectedOn: r.detected_on }));
}
