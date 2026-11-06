/**
 * The earnings-recap step of /api/cron/check-sec-filings (every 15 minutes).
 *
 * For each stock someone tracks (open holding or watchlist, alerts on) that
 * reported today or yesterday, it waits for the earnings 8-K, writes one
 * shared recap from the press release (lib/ai/earnings-recap.ts), and sends
 * it to the Pro readers who track the stock: an in-app row, a push
 * ('earnings_recap') and, through that row, the next morning's email card.
 *
 * Recaps are written for every tracked report, not only Pro-tracked ones, so
 * the locked cue a free reader sees on the stock page always opens onto a real
 * recap after upgrading. 63 tracked symbols on 2026-11-06: a few dollars a
 * quarter at the measured cost. The daily cap bounds the worst case.
 */

import { createServerClient } from '@/lib/supabase/client';
import { createNotification } from '@/lib/notifications/notifications-db';
import { getCalendarRange } from '@/lib/market-data/calendar-days';
import { getCachedManyStale } from '@/lib/cache/market-data-cache';
import { getDisplayNames } from '@/lib/market-data/display-names';
import { OPEN_POSITION_FILTER } from '@/lib/holdings/open-position';
import { isPro, tierFromUser } from '@/lib/billing/tier';
import { addDays, todayET } from '@/lib/dates/calendar-format';
import { rdel, rsetnx } from '@/lib/cache/redis-cache';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { sleep } from '@/lib/utils';
import type { EarningsCalendarItem } from '@/lib/twelvedata/twelvedata-client';
import { fetchPressRelease, generateRecap, recapKey, storeRecap, type EarningsRecap } from '@/lib/ai/earnings-recap';

/** Generations a day, all users together. ~$0.03 each (measured, see the hand-over), so $1.20 at worst. */
const DAILY_GENERATIONS = 40;

export interface RecapRunResult {
  reporters: number;
  due: string[];
  waiting: string[];
  /** Dry run: the 8-K found, nothing spent or written. */
  found: Record<string, string>;
  generated: string[];
  rejected: Record<string, string>;
  notified: number;
  errors: string[];
}

export const recapEntityId = (symbol: string, reportDate: string) => `${symbol}:earnings_recap:${reportDate}`;

type Tracker = { userId: string; owned: boolean };

async function pagedRows(table: 'user_holdings' | 'user_watchlist'): Promise<Array<{ user_id: string; symbol: string }>> {
  const supabase = createServerClient();
  const out: Array<{ user_id: string; symbol: string }> = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select('user_id, symbol').eq('alerts_enabled', true).order('id').range(from, from + 999);
    if (table === 'user_holdings') q = q.or(OPEN_POSITION_FILTER);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as Array<{ user_id: string; symbol: string }>));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** symbol → who tracks it. Holdings first, so held-and-watched counts as owned. */
async function trackers(): Promise<Map<string, Tracker[]>> {
  const [held, watched] = await Promise.all([pagedRows('user_holdings'), pagedRows('user_watchlist')]);
  const by = new Map<string, Map<string, boolean>>();
  for (const [rows, owned] of [[held, true], [watched, false]] as const) {
    for (const r of rows) {
      const sym = r.symbol?.toUpperCase();
      if (!sym || sym.includes('/')) continue;
      const users = by.get(sym) ?? new Map<string, boolean>();
      if (!users.has(r.user_id)) users.set(r.user_id, owned);
      by.set(sym, users);
    }
  }
  return new Map([...by].map(([s, users]) => [s, [...users].map(([userId, owned]) => ({ userId, owned }))]));
}

/**
 * The Pro readers of one recap who still need it: earnings notifications on
 * (the same "Earnings today" switch), and no row for this report yet.
 */
async function notifyRecap(recap: EarningsRecap, name: string, who: Tracker[]): Promise<number> {
  if (!recap.bullets || !who.length) return 0;
  const supabase = createServerClient();
  const entityId = recapEntityId(recap.symbol, recap.reportDate);
  const ids = who.map((w) => w.userId);
  const [{ data: users, error: usersErr }, { data: already, error: doneErr }] = await Promise.all([
    supabase.from('users').select('id, settings, account_tier, role, pro_bonus_until').in('id', ids),
    supabase.from('notifications').select('user_id').eq('entity_id', entityId).in('user_id', ids),
  ]);
  if (usersErr || doneErr) throw new Error(`recipients: ${(usersErr ?? doneErr)!.message}`);
  const done = new Set(((already ?? []) as Array<{ user_id: string }>).map((r) => r.user_id));
  let sent = 0;
  for (const u of (users ?? []) as Array<{
    id: string; settings: { notifications?: Record<string, boolean> } | null;
    account_tier: number | null; role: string | null; pro_bonus_until: string | null;
  }>) {
    if (done.has(u.id) || !isPro(tierFromUser(u.account_tier, u.role, u.pro_bonus_until))) continue;
    if (u.settings?.notifications?.upcoming_earnings === false) continue;
    const res = await createNotification({
      user_id: u.id,
      type: 'earnings',
      // English for the push and the email; the panel words the title from params.
      title: `${name} reported its results`,
      message: recap.bullets.join(' '),
      entity_type: 'stock',
      entity_id: entityId,
      severity: 'info',
      push: 'earnings_recap',
      // No message key: the stored message is model-written and shown as is.
      params: { kind: 'i18n', title: { key: 'notifEarningsRecapTitle', vars: { name } } },
    });
    if (!res.success) throw new Error(`notify ${u.id}: ${res.error}`);
    sent++;
  }
  return sent;
}

export async function runEarningsRecaps(opts: { dryRun?: boolean; deadline: number; today?: string }): Promise<RecapRunResult> {
  const result: RecapRunResult = { reporters: 0, due: [], waiting: [], found: {}, generated: [], rejected: {}, notified: 0, errors: [] };
  const today = opts.today ?? todayET();
  const tracked = await trackers();
  if (!tracked.size) return result;

  // Cache only: prefetch-calendar keeps these days warm, and this tick must not spend TwelveData credits.
  const { byDate } = await getCalendarRange<EarningsCalendarItem>('earnings', addDays(today, -1), today, { allowFetch: false });
  const reported = new Map<string, string>();
  for (const rows of byDate.values()) {
    for (const r of rows ?? []) {
      const sym = r.symbol?.toUpperCase();
      // A projected date is a guess, and item 2.02 also covers non-earnings results.
      if (sym && tracked.has(sym) && !r.date_estimated && r.date > (reported.get(sym) ?? '')) reported.set(sym, r.date);
    }
  }
  result.reporters = reported.size;
  if (!reported.size) return result;

  const symbols = [...reported.keys()];
  const [stored, names] = await Promise.all([
    getCachedManyStale<EarningsRecap>(symbols.map(recapKey)),
    getDisplayNames(symbols),
  ]);
  const nameOf = (s: string) => names.get(s) ?? s;

  for (const sym of symbols) {
    if (Date.now() > opts.deadline) break;
    const date = reported.get(sym)!;
    const have = stored.get(recapKey(sym));
    try {
      // Written for this report: only a missed notify is left to do.
      if (have && have.reportDate >= date) {
        if (have.bullets && !have.notifiedAt && !opts.dryRun) {
          result.notified += await notifyRecap(have, nameOf(sym), tracked.get(sym)!);
          await storeRecap({ ...have, notifiedAt: new Date().toISOString() });
        }
        continue;
      }
      result.due.push(sym);
      const pr = await fetchPressRelease(sym, date);
      await sleep(150);
      if (!pr) { result.waiting.push(sym); continue; }
      if (opts.dryRun) { result.found[sym] = `${pr.filing.accessionNumber} ${pr.url ?? 'no release exhibit'}`; continue; }

      const lock = `${recapKey(sym)}:lock`;
      if (!(await rsetnx(lock, 180))) continue;
      try {
        let gen: { bullets: string[] | null; rejected?: string };
        if (!pr.text) gen = { bullets: null, rejected: 'no release exhibit' };
        else {
          const cap = await checkRateLimit('earnings-recap-gen', { windowMs: 24 * 60 * 60 * 1000, maxRequests: DAILY_GENERATIONS });
          if (!cap.allowed) { result.errors.push(`${sym}: daily cap`); continue; }
          gen = await generateRecap(sym, nameOf(sym), pr.text);
        }
        const recap: EarningsRecap = {
          symbol: sym,
          reportDate: date,
          accession: pr.filing.accessionNumber,
          filedAt: pr.filing.acceptanceDateTime ?? null,
          sourceUrl: pr.url,
          bullets: gen.bullets,
          ...(gen.rejected ? { rejected: gen.rejected } : {}),
          generatedAt: new Date().toISOString(),
          notifiedAt: null,
        };
        await storeRecap(recap);
        if (!recap.bullets) { result.rejected[sym] = recap.rejected ?? 'unknown'; continue; }
        result.generated.push(sym);
        result.notified += await notifyRecap(recap, nameOf(sym), tracked.get(sym)!);
        await storeRecap({ ...recap, notifiedAt: new Date().toISOString() });
      } finally {
        void rdel(lock);
      }
    } catch (err) {
      result.errors.push(`${sym}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return result;
}
