/**
 * Daily new-match alerts for saved screens (screener_filter_presets with
 * alert_enabled, migration 196). Matching reads only our own screener_stats
 * through the same loader and predicate as /api/screener, so it costs no
 * TwelveData credits and agrees with what the screener shows.
 *
 * Self-check (pure diff logic, no I/O): npx tsx lib/screener/saved-screen-alerts.ts
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScreenerRow } from '@/app/api/screener/route';
import { fetchAllPages, loadScreenerUniverse, matchesScreenerFilters, type ScreenerFilterParams } from '@/lib/screener/screener-query';
import { canUseScreenAlerts, type SavedScreenScope } from '@/lib/screener/saved-screen-limits';
import { createNotification } from '@/lib/notifications/notifications-db';

const NUMERIC_KEYS = [
  'healthScoreMin', 'healthScoreMax', 'marketCapMin', 'marketCapMax', 'peMin', 'peMax', 'pbMin', 'pbMax',
  'betaMin', 'betaMax', 'divYieldMin', 'divYieldMax', 'profitMarginMin', 'profitMarginMax',
  'revenueGrowthMin', 'revenueGrowthMax', 'week52ChangeMin', 'week52ChangeMax',
] as const;

/** A saved preset holds the filter inputs as typed (strings, market cap in $B); the predicate wants numbers and raw USD. */
export function presetToParams(filters: Record<string, unknown>): ScreenerFilterParams {
  const out: ScreenerFilterParams = {};
  if (typeof filters.sector === 'string' && filters.sector) out.sector = filters.sector;
  if (typeof filters.industry === 'string' && filters.industry) out.industry = filters.industry;
  for (const key of NUMERIC_KEYS) {
    const n = parseFloat(String(filters[key] ?? ''));
    if (!isFinite(n)) continue;
    out[key] = key === 'marketCapMin' || key === 'marketCapMax' ? n * 1e9 : n;
  }
  return out;
}

/**
 * Tickers in `current` that were not in `prev`, in `current`'s order.
 * `prev` null means the screen was never checked: record a baseline, announce
 * nothing, or turning an alert on would announce every match as new.
 */
export function newMatches(prev: string[] | null, current: string[]): string[] | null {
  if (prev == null) return null;
  const before = new Set(prev);
  return current.filter((t) => !before.has(t));
}

/** "KO, PEP and MO", or the first five and "N more". English: the stored fallback and the push body. */
export function tickerListEn(tickers: string[]): string {
  const shown = tickers.length > 5 ? [...tickers.slice(0, 5), `${tickers.length - 5} more`] : tickers;
  return shown.length <= 1 ? shown.join('') : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
}

type Universe = { rows: ScreenerRow[]; error: string | null };

/** Tickers matching a preset's filters in its scope, biggest company first. */
export function matchTickers(rows: ScreenerRow[], filters: Record<string, unknown>): string[] {
  const params = presetToParams(filters);
  return rows.filter((r) => matchesScreenerFilters(r, params)).map((r) => r.ticker);
}

export async function screenMatches(
  supabase: SupabaseClient,
  filters: Record<string, unknown>,
  scope: SavedScreenScope,
): Promise<{ tickers: string[]; error: string | null }> {
  const u = await loadScreenerUniverse(supabase, { scope });
  return { tickers: u.error ? [] : matchTickers(u.rows, filters), error: u.error };
}

/** "2 new stocks match Cheap dividend payers" / "KO and PEP are new on this screen." In-app, push (title + body) and the panel's i18n keys. */
export async function createSavedScreenNotification(p: { userId: string; presetId: string; name: string; fresh: string[] }): Promise<boolean> {
  const n = p.fresh.length;
  const listVar = p.fresh.length > 5
    ? [...p.fresh.slice(0, 5), { key: 'notifEarningsMore', vars: { n: p.fresh.length - 5 } }]
    : p.fresh;
  const result = await createNotification({
    user_id: p.userId,
    type: 'saved_screen',
    title: `${n} new ${n === 1 ? 'stock matches' : 'stocks match'} ${p.name}`,
    message: `New on this screen: ${tickerListEn(p.fresh)}.`,
    // Date in the id: one row per screen per day, and the panel/push link reads the preset id from it.
    entity_id: `saved-screen:${p.presetId}:${new Date().toISOString().slice(0, 10)}`,
    severity: 'info',
    params: {
      kind: 'i18n',
      title: { key: 'notifSavedScreenTitle', vars: { count: n, name: p.name } },
      message: { key: 'notifSavedScreenMessage', vars: { tickers: listVar } },
    },
    push: 'saved_screen',
  });
  return result.success;
}

interface AlertPresetRow {
  id: string; user_id: string; name: string; filters: Record<string, unknown>;
  scope: SavedScreenScope; last_matches: string[] | null;
}
interface UserRow {
  id: string; account_tier: number | null; role: string | null; pro_bonus_until: string | null;
  settings: { notifications?: Record<string, boolean> } | null;
}

export interface SavedScreenRunSummary {
  screens: number;
  eligible: number;
  baselined: number;
  notified: number;
  newTickers: number;
  dryRun: boolean;
  /** Dry run only: what would have been sent. */
  preview?: { presetId: string; userId: string; name: string; fresh: string[] }[];
  errors: string[];
}

/**
 * One pass over every saved screen with its alert on. Pro owners (re-checked
 * here, since a lapsed subscription keeps the flag) who have not switched
 * `saved_screen` off in Settings get one notification per screen with new
 * matches. last_matches is rewritten either way, so a stock that leaves and
 * comes back is announced again.
 * dryRun: compute and report, write nothing. userId: only that user's screens.
 */
export async function runSavedScreenAlerts(
  supabase: SupabaseClient,
  notify: (p: { userId: string; presetId: string; name: string; fresh: string[] }) => Promise<boolean>,
  opts: { dryRun?: boolean; userId?: string } = {},
): Promise<SavedScreenRunSummary> {
  const dryRun = !!opts.dryRun;
  const summary: SavedScreenRunSummary = { screens: 0, eligible: 0, baselined: 0, notified: 0, newTickers: 0, dryRun, errors: [] };
  if (dryRun) summary.preview = [];

  const { rows: presets, error } = await fetchAllPages<AlertPresetRow>(() => {
    let q = supabase
      .from('screener_filter_presets')
      .select('id, user_id, name, filters, scope, last_matches')
      .eq('alert_enabled', true);
    if (opts.userId) q = q.eq('user_id', opts.userId);
    return q.order('id', { ascending: true });
  });
  if (error) throw new Error(`screener_filter_presets: ${error}`);
  summary.screens = presets.length;
  if (presets.length === 0) return summary;

  // ponytail: one .in() of every alert owner; chunk it if alert owners pass a few hundred (URL length).
  const userIds = [...new Set(presets.map((p) => p.user_id))];
  const { data: users, error: userErr } = await supabase
    .from('users')
    .select('id, account_tier, role, pro_bonus_until, settings')
    .in('id', userIds);
  if (userErr) throw new Error(`users: ${userErr.message}`);
  const eligibleUsers = new Set(
    ((users ?? []) as UserRow[])
      .filter((u) => canUseScreenAlerts(u.account_tier, u.role, u.pro_bonus_until))
      .filter((u) => u.settings?.notifications?.saved_screen !== false)
      .map((u) => u.id),
  );

  const universes = new Map<SavedScreenScope, Universe>();
  const now = new Date().toISOString();

  for (const p of presets) {
    if (!eligibleUsers.has(p.user_id)) continue;
    summary.eligible++;
    if (!universes.has(p.scope)) universes.set(p.scope, await loadScreenerUniverse(supabase, { scope: p.scope }));
    const u = universes.get(p.scope)!;
    // A failed load must not overwrite last_matches with nothing, or tomorrow announces every match.
    if (u.error) {
      if (summary.errors.length < 10) summary.errors.push(`${p.scope}: ${u.error}`);
      continue;
    }
    const current = matchTickers(u.rows, p.filters);
    const fresh = newMatches(p.last_matches, current);

    if (fresh == null) summary.baselined++;
    else if (fresh.length > 0) {
      summary.newTickers += fresh.length;
      if (dryRun) summary.preview!.push({ presetId: p.id, userId: p.user_id, name: p.name, fresh });
      else if (await notify({ userId: p.user_id, presetId: p.id, name: p.name, fresh })) summary.notified++;
    }
    if (dryRun) continue;

    const { error: upErr } = await supabase
      .from('screener_filter_presets')
      .update({ last_matches: current, checked_at: now })
      .eq('id', p.id);
    if (upErr && summary.errors.length < 10) summary.errors.push(`update ${p.id}: ${upErr.message}`);
  }
  return summary;
}

if (process.argv[1]?.endsWith('saved-screen-alerts.ts')) {
  const assert = (ok: boolean, msg: string) => { if (!ok) throw new Error(msg); };
  const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  assert(newMatches(null, ['AAPL', 'KO']) === null, 'never checked: baseline only');
  assert(eq(newMatches([], ['AAPL']), ['AAPL']), 'empty baseline: everything is new');
  assert(eq(newMatches(['AAPL', 'KO'], ['PEP', 'AAPL', 'KO', 'MO']), ['PEP', 'MO']), 'only new tickers, in current order');
  assert(eq(newMatches(['AAPL', 'KO'], ['KO']), []), 'a stock leaving is not news');
  assert(eq(newMatches(['AAPL'], []), []), 'nothing matches: nothing new');

  assert(eq(presetToParams({ marketCapMin: '10', peMax: '15', divYieldMin: '2.5', sector: 'Energy', industry: '' }),
    { sector: 'Energy', marketCapMin: 10e9, peMax: 15, divYieldMin: 2.5 }), 'preset strings to params');
  assert(eq(presetToParams({ peMax: 'abc', betaMin: '' }), {}), 'junk and empty values are ignored');

  // Filter and diff together, through the real predicate (dividend_yield is stored as a fraction).
  const row = (ticker: string, dividend_yield: number | null, market_cap: number) =>
    ({ ticker, dividend_yield, market_cap }) as unknown as ScreenerRow;
  const yesterday = matchTickers([row('KO', 0.031, 3e11), row('PEP', 0.024, 2e11)], { divYieldMin: '2.5' });
  const today = matchTickers([row('KO', 0.031, 3e11), row('PEP', 0.027, 2e11), row('MO', 0.08, 9e10), row('XYZ', null, 1e9)], { divYieldMin: '2.5' });
  assert(eq(yesterday, ['KO']), 'PEP under 2.5% yesterday');
  assert(eq(newMatches(yesterday, today), ['PEP', 'MO']), 'PEP crossed in, MO new, missing yield never matches');

  assert(tickerListEn(['KO']) === 'KO', 'one ticker');
  assert(tickerListEn(['KO', 'PEP']) === 'KO and PEP', 'two tickers');
  assert(tickerListEn(['A', 'B', 'C', 'D', 'E', 'F', 'G']) === 'A, B, C, D, E and 2 more', 'capped at five');
  console.log('saved-screen-alerts self-check ok');
}
