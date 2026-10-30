/**
 * What the economic releases on the calendar actually printed: CPI, the jobs
 * report, PCE, GDP, jobless claims and the Fed's rate decision.
 *
 * Sources (US government data, public domain):
 *   - FRED API (St. Louis Fed) for every number. Each series used here is
 *     published by BLS, BEA, DOL or the Board, none is a copyrighted
 *     third-party series. FRED's terms require the "not endorsed" notice the
 *     pages show (FRED_NOTICE in economic-kinds.ts).
 *   - The Fed's own statement page for the rate decision, minutes after 2 PM,
 *     well before FRED's target-range series catch up.
 *
 * No consensus and no market-implied odds: neither has a free licence for
 * display (docs/superpowers/plans/2026-10-29-economic-event-results.md).
 */

import { createServerClient } from '@/lib/supabase/client';
import { SITE_URL } from '@/lib/site';
import { notifyEconomicResults } from '@/lib/notifications/notification-creators';
import { etDateOf } from './economic-calendar';
import type { EconomicKind } from './economic-kinds';


export type ResultKind = Extract<EconomicKind, 'fomc' | 'cpi' | 'jobs' | 'pce' | 'gdp' | 'claims'>;
export const RESULT_KINDS: ResultKind[] = ['fomc', 'cpi', 'jobs', 'pce', 'gdp', 'claims'];

export type MetricKey =
  | 'rate_upper' | 'rate_lower'
  | 'cpi_yoy' | 'cpi_mom' | 'core_cpi_yoy' | 'core_cpi_mom'
  | 'pce_yoy' | 'pce_mom' | 'core_pce_yoy' | 'core_pce_mom'
  | 'payrolls' | 'unemployment'
  | 'gdp'
  | 'claims' | 'claims_4wk';

export interface Metric {
  key: MetricKey;
  actual: number;
  previous: number | null;
}

export type Verdict = 'hold' | 'raise' | 'lower';

type Obs = { period: string; value: number };
type SeriesMap = Record<string, Map<string, number>>;

// ─── Period arithmetic (YYYY-MM-DD strings, no time zones involved) ──────────

function shiftMonths(period: string, n: number): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

const pct = (now: number | undefined, then: number | undefined) =>
  now == null || then == null ? null : Math.round((now / then - 1) * 1000) / 10 || 0; // || 0: no "-0.0%"

// ─── What each kind reports ───────────────────────────────────────────────────

interface KindDef {
  /** Every series the kind reads. The first one decides which period is newest. */
  series: string[];
  /** Metrics in display order; the first is the headline. */
  metrics: Array<{ key: MetricKey; at: (s: SeriesMap, period: string) => number | null }>;
  /** How far back the stored history goes. */
  years: number;
}

const get = (s: SeriesMap, id: string, period: string) => s[id]?.get(period) ?? null;

/** Month-on-month and 12-month change of an index, the way BLS and BEA headline them. */
const yoy = (id: string) => (s: SeriesMap, p: string) => pct(s[id]?.get(p), s[id]?.get(shiftMonths(p, -12)));
const mom = (id: string) => (s: SeriesMap, p: string) => pct(s[id]?.get(p), s[id]?.get(shiftMonths(p, -1)));

const KINDS: Record<Exclude<ResultKind, 'fomc'>, KindDef> = {
  // BLS headlines the 12-month change on the unadjusted index and the monthly
  // change on the seasonally adjusted one.
  cpi: {
    series: ['CPIAUCNS', 'CPIAUCSL', 'CPILFENS', 'CPILFESL'],
    metrics: [
      { key: 'cpi_yoy', at: yoy('CPIAUCNS') },
      { key: 'cpi_mom', at: mom('CPIAUCSL') },
      { key: 'core_cpi_yoy', at: yoy('CPILFENS') },
      { key: 'core_cpi_mom', at: mom('CPILFESL') },
    ],
    years: 10,
  },
  pce: {
    series: ['PCEPI', 'PCEPILFE'],
    metrics: [
      { key: 'pce_yoy', at: yoy('PCEPI') },
      { key: 'pce_mom', at: mom('PCEPI') },
      { key: 'core_pce_yoy', at: yoy('PCEPILFE') },
      { key: 'core_pce_mom', at: mom('PCEPILFE') },
    ],
    years: 10,
  },
  jobs: {
    series: ['PAYEMS', 'UNRATE'],
    metrics: [
      {
        key: 'payrolls',
        at: (s, p) => {
          const now = get(s, 'PAYEMS', p);
          const then = get(s, 'PAYEMS', shiftMonths(p, -1));
          return now == null || then == null ? null : now - then; // thousands of jobs
        },
      },
      { key: 'unemployment', at: (s, p) => get(s, 'UNRATE', p) },
    ],
    years: 10,
  },
  gdp: {
    // Real GDP, percent change at an annual rate: BEA's own headline number.
    series: ['A191RL1Q225SBEA'],
    metrics: [{ key: 'gdp', at: (s, p) => get(s, 'A191RL1Q225SBEA', p) }],
    years: 10,
  },
  claims: {
    series: ['ICSA', 'IC4WSA'],
    metrics: [
      { key: 'claims', at: (s, p) => get(s, 'ICSA', p) },
      { key: 'claims_4wk', at: (s, p) => get(s, 'IC4WSA', p) },
    ],
    years: 3,
  },
};

/** The Fed's target range, stored as change points. Plus the officials' median projection. */
const RATE_SERIES = ['DFEDTARU', 'DFEDTARL'];
const PROJECTION_SERIES = 'FEDTARMD';
const RATE_YEARS = 20;

export function seriesFor(kind: ResultKind): string[] {
  return kind === 'fomc' ? [...RATE_SERIES, PROJECTION_SERIES] : KINDS[kind].series;
}

function toSeriesMap(rows: Array<{ series_id: string; period: string; value: number | string }>): SeriesMap {
  const out: SeriesMap = {};
  for (const r of rows) (out[r.series_id] ??= new Map()).set(r.period, Number(r.value));
  return out;
}

/** Newest-first periods of the kind's lead series. */
function periodsOf(kind: Exclude<ResultKind, 'fomc'>, s: SeriesMap): string[] {
  return [...(s[KINDS[kind].series[0]]?.keys() ?? [])].sort().reverse();
}

/** Every metric at one period, with the period before it as "previous". */
export function computeMetrics(kind: Exclude<ResultKind, 'fomc'>, s: SeriesMap, period: string): Metric[] {
  const periods = periodsOf(kind, s);
  const prev = periods[periods.indexOf(period) + 1];
  return KINDS[kind].metrics.flatMap(({ key, at }) => {
    const actual = at(s, period);
    return actual == null ? [] : [{ key, actual, previous: prev ? at(s, prev) : null }];
  });
}

// ─── The Fed's statement ──────────────────────────────────────────────────────

const FED_USER_AGENT = `Mozilla/5.0 (compatible; BullPen economic results; +${SITE_URL})`;

/** "3-3/4" → 3.75, "4" → 4. */
function parseFedNumber(s: string): number {
  const [whole, frac] = s.split('-');
  if (whole.includes('/')) {
    const [a, b] = whole.split('/').map(Number);
    return a / b;
  }
  if (!frac) return Number(whole);
  const [a, b] = frac.split('/').map(Number);
  return Number(whole) + a / b;
}

/**
 * The Committee's decision sentence, e.g. "The Committee decided to maintain
 * the target range for the federal funds rate at 3-3/4 to 4 percent".
 * Dissents later in the statement use "preferred to", so they never match.
 */
export function parseFomcStatement(text: string): { lower: number; upper: number } | null {
  const m = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .match(/Committee decided to (?:maintain|raise|lower) the target range for the federal funds rate (?:by [\d/-]+ percentage points? )?(?:at|to) ([\d/-]+) to ([\d/-]+) percent/);
  return m ? { lower: parseFedNumber(m[1]), upper: parseFedNumber(m[2]) } : null;
}

/** The statement for a decision day, or null before it is posted. */
async function fetchFomcDecision(date: string): Promise<{ lower: number; upper: number } | null> {
  const url = `https://www.federalreserve.gov/newsevents/pressreleases/monetary${date.replaceAll('-', '')}a.htm`;
  const res = await fetch(url, { headers: { 'User-Agent': FED_USER_AGENT }, cache: 'no-store', signal: AbortSignal.timeout(15_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${res.status} from federalreserve.gov`);
  return parseFomcStatement(await res.text());
}

// ─── FRED ─────────────────────────────────────────────────────────────────────

function fredKey(): string {
  const key = process.env.FRED_API_KEY;
  if (!key) throw new Error('FRED_API_KEY is not set');
  return key;
}

async function fredGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({ ...params, api_key: fredKey(), file_type: 'json' });
  const res = await fetch(`https://api.stlouisfed.org/fred/${path}?${qs}`, { cache: 'no-store', signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`FRED ${path} ${params.series_id}: ${res.status}`);
  return res.json() as Promise<T>;
}

async function fredObservations(seriesId: string, start: string): Promise<Obs[]> {
  const body = await fredGet<{ observations: Array<{ date: string; value: string }> }>('series/observations', {
    series_id: seriesId,
    observation_start: start,
  });
  // "." marks a period with no value (the October 2025 CPI that was never collected).
  return body.observations.filter((o) => o.value !== '.').map((o) => ({ period: o.date, value: Number(o.value) }));
}

/** When FRED last changed the series. Its format: "2026-10-15 07:44:02-05". */
async function fredLastUpdated(seriesId: string): Promise<Date> {
  const body = await fredGet<{ seriess: Array<{ last_updated: string }> }>('series', { series_id: seriesId });
  return new Date(body.seriess[0].last_updated.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'));
}

/** Daily target-range values collapsed to the days the range changed. */
function changePoints(obs: Obs[]): Obs[] {
  return obs.filter((o, i) => i === 0 || o.value !== obs[i - 1].value);
}

function yearsAgo(years: number): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

/** Fetch a kind's series from FRED and upsert them. Returns what was fetched. */
async function syncKind(kind: ResultKind): Promise<SeriesMap> {
  const supabase = createServerClient();
  const years = kind === 'fomc' ? RATE_YEARS : KINDS[kind].years;
  const out: SeriesMap = {};
  for (const id of seriesFor(kind)) {
    let obs = await fredObservations(id, yearsAgo(years));
    if (RATE_SERIES.includes(id)) obs = changePoints(obs);
    const fetchedAt = new Date().toISOString();
    const rows = obs.map((o) => ({ series_id: id, period: o.period, value: o.value, fetched_at: fetchedAt }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from('economic_observations').upsert(rows.slice(i, i + 500), { onConflict: 'series_id,period' });
      if (error) throw error;
    }
    if (id === PROJECTION_SERIES) {
      // Only the newest projections are shown. Older vintages would linger
      // under years the latest SEP no longer covers. Deleted after the upsert
      // so a failed write keeps the old ones.
      await supabase.from('economic_observations').delete().eq('series_id', id).lt('fetched_at', fetchedAt);
    }
    out[id] = new Map(obs.map((o) => [o.period, o.value]));
  }
  return out;
}

/** Weekly refresh of every series' history (revisions included). Fails soft per kind. */
export async function syncEconomicObservations(): Promise<Record<ResultKind, { ok: boolean; error?: string }>> {
  const out = {} as Record<ResultKind, { ok: boolean; error?: string }>;
  for (const kind of RESULT_KINDS) {
    try {
      await syncKind(kind);
      out[kind] = { ok: true };
    } catch (error) {
      out[kind] = { ok: false, error: String(error) };
    }
  }
  return out;
}

// ─── Release-day check ────────────────────────────────────────────────────────

interface EventRow {
  id: string;
  kind: ResultKind;
  date: string;
  release_at: string;
  results_at: string | null;
}

const MAX_WAIT_MS = 7 * 86_400_000;

/**
 * For each kind, the latest release that has happened. If it has no result
 * yet and the source has published, store the result on the event.
 *
 * Only the latest release is ever filled: FRED holds today's numbers, so an
 * older release that was missed can't be reconstructed as it was printed.
 */
export async function checkEconomicResults(now = new Date()): Promise<Record<string, string>> {
  const supabase = createServerClient();
  const status: Record<string, string> = {};

  for (const kind of RESULT_KINDS) {
    const { data } = await supabase
      .from('economic_events')
      .select('id, kind, date, release_at, results_at')
      .eq('kind', kind)
      .lte('release_at', now.toISOString())
      .order('release_at', { ascending: false })
      .limit(1);
    const event = data?.[0] as EventRow | undefined;
    if (!event || event.results_at || now.getTime() - Date.parse(event.release_at) > MAX_WAIT_MS) continue;

    try {
      status[event.id] = kind === 'fomc' ? await fillFomc(event) : await fillRelease(event);
    } catch (error) {
      status[event.id] = `error: ${String(error)}`;
    }
  }
  return status;
}

async function fillRelease(event: EventRow): Promise<string> {
  const kind = event.kind as Exclude<ResultKind, 'fomc'>;
  const updated = await Promise.all(KINDS[kind].series.map(fredLastUpdated));
  if (updated.some((d) => d.getTime() < Date.parse(event.release_at))) return 'waiting';

  const s = await syncKind(kind);
  const period = periodsOf(kind, s)[0];
  const results = computeMetrics(kind, s, period);
  if (results.length === 0) return 'no data';
  await saveResult(event, { period_label: period, results, verdict: null });
  return `filled ${period}`;
}

async function fillFomc(event: EventRow): Promise<string> {
  const decision = await fetchFomcDecision(event.date);
  if (!decision) return 'waiting';

  // The range before this meeting: the newest change point on or before the
  // decision day (a new range takes effect the day after).
  const supabase = createServerClient();
  const rangeBefore = async (id: string): Promise<number | null> => {
    const { data } = await supabase
      .from('economic_observations')
      .select('value')
      .eq('series_id', id)
      .lte('period', event.date)
      .order('period', { ascending: false })
      .limit(1);
    return data?.[0] ? Number(data[0].value) : null;
  };
  const [before, beforeLower] = await Promise.all(RATE_SERIES.map(rangeBefore));
  const verdict: Verdict | null = before == null ? null : decision.upper > before ? 'raise' : decision.upper < before ? 'lower' : 'hold';

  const results: Metric[] = [
    { key: 'rate_upper', actual: decision.upper, previous: before },
    { key: 'rate_lower', actual: decision.lower, previous: beforeLower },
  ];
  await saveResult(event, { period_label: event.date, results, verdict });

  // Chart the new range straight away instead of waiting for FRED.
  if (verdict && verdict !== 'hold') {
    const nextDay = new Date(Date.parse(`${event.date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    await supabase.from('economic_observations').upsert([
      { series_id: 'DFEDTARU', period: nextDay, value: decision.upper },
      { series_id: 'DFEDTARL', period: nextDay, value: decision.lower },
    ], { onConflict: 'series_id,period' });
  }
  return `filled ${verdict ?? 'unknown'}`;
}

/**
 * Notify first, then freeze the result: a failed notify leaves results_at
 * empty so the next run retries, and the notifications' entity_id keeps that
 * retry from telling anyone twice.
 */
async function saveResult(event: EventRow, fields: { period_label: string; results: Metric[]; verdict: Verdict | null }) {
  await notifyEconomicResults({ id: event.id, kind: event.kind, results: fields.results, verdict: fields.verdict });
  const { error } = await createServerClient()
    .from('economic_events')
    .update({ ...fields, results_at: new Date().toISOString() })
    .eq('id', event.id);
  if (error) throw error;
}

// ─── Page data ────────────────────────────────────────────────────────────────

export interface HistoryRow {
  /** YYYY-MM-DD: month or quarter start, week ending, or the day a new range took effect. */
  period: string;
  values: Partial<Record<MetricKey, number | null>>;
}

export interface ScheduledRelease {
  date: string;
  release_at: string;
  detail: string | null;
}

export interface EconomyPageData {
  kind: ResultKind;
  /** Newest period with data, and its metrics against the period before. */
  latest: { period: string; metrics: Metric[] } | null;
  /** Oldest first. */
  history: HistoryRow[];
  nextRelease: ScheduledRelease | null;
  lastRelease: (ScheduledRelease & { verdict: Verdict | null }) | null;
  /** FOMC only: officials' median projection for the federal funds rate at the end of each year. */
  projections: Array<{ year: number; value: number }>;
  /** Date of the meeting that published `projections`. */
  projectionsDate: string | null;
  /** When the stored series were last fetched from FRED (ISO). */
  updatedAt: string | null;
}

/** Monthly and quarterly kinds chart five years; claims two; the Fed rate twenty. */
const CHART_YEARS: Record<ResultKind, number> = { fomc: 20, cpi: 5, pce: 5, jobs: 5, gdp: 5, claims: 2 };

export async function getEconomyPage(kind: ResultKind, today = etDateOf(new Date().toISOString())): Promise<EconomyPageData> {
  const supabase = createServerClient();
  const [{ data: obs, error }, { data: next }, { data: last }] = await Promise.all([
    supabase.from('economic_observations').select('series_id, period, value, fetched_at').in('series_id', seriesFor(kind)).order('period', { ascending: false }).limit(1000), // newest first: the 1000-row cap drops the oldest
    supabase.from('economic_events').select('date, release_at, detail').eq('kind', kind).gt('release_at', new Date().toISOString())
      .order('release_at').limit(1),
    supabase.from('economic_events').select('date, release_at, detail, verdict').eq('kind', kind).lte('release_at', new Date().toISOString())
      .order('release_at', { ascending: false }).limit(1),
  ]);
  if (error) throw error;
  const s = toSeriesMap(obs ?? []);
  const from = shiftMonths(today, -12 * CHART_YEARS[kind]);
  const base = {
    kind,
    nextRelease: (next?.[0] as ScheduledRelease | undefined) ?? null,
    lastRelease: (last?.[0] as EconomyPageData['lastRelease'] | undefined) ?? null,
    updatedAt: (obs ?? []).reduce<string | null>((max, r) => (max == null || r.fetched_at > max ? r.fetched_at : max), null),
  };

  if (kind === 'fomc') {
    const periods = [...new Set(RATE_SERIES.flatMap((id) => [...(s[id]?.keys() ?? [])]))].sort();
    // Carry each bound forward: the two series don't always change on the same row.
    let upper: number | null = null;
    let lower: number | null = null;
    const all = periods.map((period) => {
      upper = s.DFEDTARU?.get(period) ?? upper;
      lower = s.DFEDTARL?.get(period) ?? lower;
      return { period, values: { rate_upper: upper, rate_lower: lower } };
    });
    // A step chart needs the level at both ends: the range in force at the
    // window's start, and today's range carried to today.
    const before = all.filter((r) => r.period < from).at(-1);
    const history = [
      ...(before ? [{ period: from, values: before.values }] : []),
      ...all.filter((r) => r.period >= from),
      // Not on a decision day after a change: fillFomc already wrote tomorrow's row.
      ...(all.length && today > all.at(-1)!.period ? [{ period: today, values: all.at(-1)!.values }] : []),
    ];
    const cur = all.at(-1);
    const prev = all.at(-2);
    const latest = cur
      ? {
          period: cur.period,
          metrics: (['rate_upper', 'rate_lower'] as const).flatMap((key): Metric[] =>
            cur.values[key] == null ? [] : [{ key, actual: cur.values[key]!, previous: prev?.values[key] ?? null }]),
        }
      : null;
    const projections = [...(s[PROJECTION_SERIES]?.entries() ?? [])]
      .map(([period, value]) => ({ year: Number(period.slice(0, 4)), value }))
      .filter((p) => p.year >= Number(today.slice(0, 4)));
    // The meeting that published them: the latest one with projections.
    const { data: sep } = await supabase.from('economic_events').select('date').eq('kind', 'fomc').eq('has_projections', true)
      .lte('release_at', new Date().toISOString()).order('release_at', { ascending: false }).limit(1);
    return { ...base, latest, history, projections, projectionsDate: (sep?.[0]?.date as string | undefined) ?? null };
  }

  const periods = periodsOf(kind, s);
  const history = periods
    .filter((p) => p >= from)
    .reverse()
    .map((period) => ({
      period,
      values: Object.fromEntries(KINDS[kind].metrics.map(({ key, at }) => [key, at(s, period)])),
    }));
  const latest = periods[0] ? { period: periods[0], metrics: computeMetrics(kind, s, periods[0]) } : null;
  return { ...base, latest, history, projections: [], projectionsDate: null };
}
