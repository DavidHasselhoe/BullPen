/**
 * Builds the US economic calendar from the agencies' own published
 * schedules and writes it to `economic_events`.
 *
 * Sources (all US government works, no licence needed):
 *   - BLS release calendar (.ics): jobs report, CPI, PPI, JOLTS. Local ET times.
 *   - BEA release calendar (.ics): GDP, personal income & outlays (PCE). UTC times.
 *   - FOMC decision days: hand-seeded below from federalreserve.gov, 8 a year.
 *   - Weekly jobless claims: no feed; always Thursday 8:30 ET, moved to
 *     Wednesday when Thursday is a federal holiday.
 *
 * BLS rejects requests without a browser-like user agent (403, verified
 * 2026-09-24) and may block some cloud IPs outright. Every source fails soft:
 * a failed fetch keeps that source's existing rows (they were published a
 * year ahead anyway) and is reported in the sync result, never thrown.
 */

import { createServerClient } from '@/lib/supabase/client';
import type { EconomicKind } from './economic-kinds';

const USER_AGENT = 'Mozilla/5.0 (compatible; BullPen economic calendar; +https://bullpen.no)';
const BLS_ICS = 'https://www.bls.gov/schedule/news_release/bls.ics';
const BEA_ICS = 'https://www.bea.gov/news/schedule/ics/online-calendar-subscription.ics';

type Source = 'bls' | 'bea' | 'fed' | 'rule';

export interface EconomicEventRow {
  id: string;
  kind: EconomicKind;
  date: string;
  release_at: string;
  detail: string | null;
  has_projections: boolean;
  source: Source;
}

/**
 * FOMC statement days (the second day of each two-day meeting), from
 * https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm. `true`
 * marks meetings with a Summary of Economic Projections (the page's asterisk).
 * Statement at 2:00 PM ET, press conference at 2:30.
 * ponytail: hand-seeded like the exchange holidays. 2028 is the next gap:
 * add it when the Fed publishes it (usually the summer before).
 */
const FOMC_DECISIONS: Array<[string, boolean]> = [
  ['2026-01-28', false], ['2026-03-18', true], ['2026-04-29', false], ['2026-06-17', true],
  ['2026-07-29', false], ['2026-09-16', true], ['2026-10-28', false], ['2026-12-09', true],
  ['2027-01-27', false], ['2027-03-17', true], ['2027-04-28', false], ['2027-06-09', true],
  ['2027-07-28', false], ['2027-09-15', true], ['2027-10-27', false], ['2027-12-08', true],
];

// ─── Time helpers ─────────────────────────────────────────────────────────────

const ET = 'America/New_York';

/** Wall-clock ET date + time to a UTC ISO instant, DST-correct. */
export function etToIso(date: string, hhmm: string): string {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  // What ET reads at that UTC instant tells us the offset for that date.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ET, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(asUtc));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const etAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return new Date(asUtc + (asUtc - etAsUtc)).toISOString();
}

/** YYYY-MM-DD of an instant in ET. */
export function etDateOf(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: ET });
}

function addDaysIso(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ─── ICS parsing ──────────────────────────────────────────────────────────────

interface IcsEvent {
  summary: string;
  /** ISO instant. */
  start: string;
}

/** Minimal VEVENT reader: unfolds continuation lines, reads SUMMARY + DTSTART. */
export function parseIcs(text: string): IcsEvent[] {
  const lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const out: IcsEvent[] = [];
  let summary: string | null = null;
  let start: string | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { summary = null; start = null; continue; }
    if (line === 'END:VEVENT') {
      if (summary && start) out.push({ summary, start });
      continue;
    }
    if (line.startsWith('SUMMARY')) {
      summary = line.slice(line.indexOf(':') + 1).replace(/\\([,;\\])/g, '$1').trim();
    } else if (line.startsWith('DTSTART')) {
      const [params, value] = [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1).trim()];
      const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/);
      if (!m) continue;
      const date = `${m[1]}-${m[2]}-${m[3]}`;
      const time = `${m[4]}:${m[5]}`;
      if (value.endsWith('Z')) start = `${date}T${time}:00.000Z`;
      // BLS tags its times TZID=US-Eastern; treat any TZID as ET, the only zone these feeds use.
      else if (params.includes('TZID')) start = etToIso(date, time);
    }
  }
  return out;
}

/** BLS release name → our kind. Exact names only: "State Job Openings..." etc. are regional. */
const BLS_KINDS: Record<string, EconomicKind> = {
  'Employment Situation': 'jobs',
  'Consumer Price Index': 'cpi',
  'Producer Price Index': 'ppi',
  'Job Openings and Labor Turnover Survey': 'jolts',
};

function row(kind: EconomicKind, releaseAt: string, source: Source, detail: string | null = null, hasProjections = false): EconomicEventRow {
  const date = etDateOf(releaseAt);
  return { id: `${kind}:${date}`, kind, date, release_at: releaseAt, detail, has_projections: hasProjections, source };
}

export function blsRows(events: IcsEvent[]): EconomicEventRow[] {
  return events.flatMap((e) => (BLS_KINDS[e.summary] ? [row(BLS_KINDS[e.summary], e.start, 'bls')] : []));
}

export function beaRows(events: IcsEvent[]): EconomicEventRow[] {
  const out: EconomicEventRow[] = [];
  for (const e of events) {
    // "GDP (Advance Estimate), 3rd Quarter 2026" / "GDP (Third Estimate), Industries, Corporate Profits..."
    const gdp = e.summary.match(/^GDP \(([^)]+)\)(?:,\s*(\d(?:st|nd|rd|th) Quarter \d{4}))?/);
    if (gdp) {
      out.push(row('gdp', e.start, 'bea', gdp[2] ? `${gdp[1]}, ${gdp[2]}` : gdp[1]));
      continue;
    }
    // "Personal Income and Outlays, August 2026"
    const pce = e.summary.match(/^Personal Income and Outlays(?:,\s*(.+))?$/);
    if (pce) out.push(row('pce', e.start, 'bea', pce[1] ?? null));
  }
  return out;
}

export function fomcRows(): EconomicEventRow[] {
  return FOMC_DECISIONS.map(([date, sep]) => row('fomc', etToIso(date, '14:00'), 'fed', null, sep));
}

/** Federal holidays that can land on a Thursday, which pushes claims to Wednesday. */
function isThursdayHoliday(date: string): boolean {
  const md = date.slice(5);
  if (['01-01', '06-19', '07-04', '11-11', '12-25'].includes(md)) return true;
  // Thanksgiving: the fourth Thursday of November.
  const day = Number(date.slice(8, 10));
  return md.startsWith('11-') && day >= 22 && day <= 28;
}

/** Weekly jobless claims for every Thursday in [from, to]. */
export function claimsRows(from: string, to: string): EconomicEventRow[] {
  const out: EconomicEventRow[] = [];
  let d = from;
  while (new Date(`${d}T12:00:00Z`).getUTCDay() !== 4) d = addDaysIso(d, 1);
  for (; d <= to; d = addDaysIso(d, 7)) {
    const releaseDay = isThursdayHoliday(d) ? addDaysIso(d, -1) : d;
    out.push(row('claims', etToIso(releaseDay, '08:30'), 'rule'));
  }
  return out;
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

async function fetchIcs(url: string): Promise<IcsEvent[]> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, cache: 'no-store', signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).hostname}`);
  const events = parseIcs(await res.text());
  if (events.length === 0) throw new Error(`no events parsed from ${new URL(url).hostname}`);
  return events;
}

export interface SyncResult {
  written: number;
  pruned: number;
  sources: Record<Source, { ok: boolean; rows: number; error?: string }>;
}

/**
 * Fetches every source and upserts rows from 30 days back to a year ahead.
 * Upcoming rows a successful source no longer lists are pruned (a moved
 * release date would otherwise leave its old date behind); a failed source's
 * rows are left untouched.
 */
export async function syncEconomicCalendar(today: string = etDateOf(new Date().toISOString())): Promise<SyncResult> {
  const from = addDaysIso(today, -30);
  const to = addDaysIso(today, 366);
  const sources = {} as SyncResult['sources'];

  const settled = await Promise.allSettled([fetchIcs(BLS_ICS), fetchIcs(BEA_ICS)]);
  const bySource: Array<[Source, EconomicEventRow[] | null, string?]> = [
    ['bls', settled[0].status === 'fulfilled' ? blsRows(settled[0].value) : null, settled[0].status === 'rejected' ? String(settled[0].reason) : undefined],
    ['bea', settled[1].status === 'fulfilled' ? beaRows(settled[1].value) : null, settled[1].status === 'rejected' ? String(settled[1].reason) : undefined],
    ['fed', fomcRows()],
    ['rule', claimsRows(from, addDaysIso(today, 120))],
  ];

  const supabase = createServerClient();
  let written = 0;
  let pruned = 0;

  for (const [source, rows, error] of bySource) {
    if (!rows) {
      sources[source] = { ok: false, rows: 0, error };
      continue;
    }
    // Two releases of one kind on one day collapse onto one id; keep the first.
    const inWindow = [...new Map(rows.filter((r) => r.date >= from && r.date <= to).map((r) => [r.id, r])).values()];
    if (inWindow.length > 0) {
      const { error: upsertError } = await supabase
        .from('economic_events')
        .upsert(inWindow.map((r) => ({ ...r, updated_at: new Date().toISOString() })), { onConflict: 'id' });
      if (upsertError) {
        sources[source] = { ok: false, rows: 0, error: upsertError.message };
        continue;
      }
    }
    written += inWindow.length;

    const keep = inWindow.filter((r) => r.date >= today).map((r) => r.id);
    let del = supabase.from('economic_events').delete().eq('source', source).gte('date', today);
    if (keep.length > 0) del = del.not('id', 'in', `(${keep.map((id) => `"${id}"`).join(',')})`);
    const { data: deleted } = await del.select('id');
    pruned += deleted?.length ?? 0;

    sources[source] = { ok: true, rows: inWindow.length };
  }

  return { written, pruned, sources };
}

/** Scheduled releases with an ET date in [from, to], in release order. */
export async function getEconomicEvents(from: string, to: string): Promise<EconomicEventRow[]> {
  const { data, error } = await createServerClient()
    .from('economic_events')
    .select('id, kind, date, release_at, detail, has_projections, source')
    .gte('date', from)
    .lte('date', to)
    .order('release_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as EconomicEventRow[];
}
