/**
 * Pro payday notifications for the dividend hub ("AAPL pays you $4.05 today").
 *
 * Run once a day from the ex-dividend cron (check-dividends-upcoming, 08:00
 * UTC); the push dispatcher holds the push until the reader's morning.
 * - A holding whose pay date is today: "pays you $X today".
 * - A holding with no known pay date (TwelveData has none, and Nasdaq only
 *   covers Nasdaq listings) whose ex-date is today: "locked in", because
 *   shares owned before the ex-date get the payout. Never a guessed pay date.
 * Amounts are the payment's real per-share amount times the user's shares, so
 * holdings without a share count are skipped. Uses the dividend_reminder
 * setting and push kind, like the ex-dividend reminder.
 */

import { createServerClient } from '@/lib/supabase/client';
import { createNotification, type I18nParams } from '@/lib/notifications/notifications-db';
import { isPro, tierFromUser } from '@/lib/billing/tier';
import { OPEN_POSITION_FILTER } from '@/lib/holdings/open-position';
import { listingMic } from '@/lib/assets/asset-type';
import { getDividendSchedules } from './dividend-schedule';
import { regularPayments } from './dividend-income';
import { fetchAllPages } from '@/lib/supabase/paging';

/** Notification entity ids start with this; notification-href.ts sends them to the hub. */
export const DIVIDEND_INCOME_ENTITY = 'portfolio:dividend_income';

const usd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

interface Item { symbol: string; total: number; perShare: number; shares: number }

/** Title, message and i18n params for one day's payday or locked-in group. Exported for the self-check. */
export function paydayCopy(kind: 'pay' | 'locked', items: Item[]): { title: string; message: string; params: I18nParams } {
  const sum = usd(items.reduce((s, i) => s + i.total, 0));
  const list = items.map((i) => `${i.symbol} ${usd(i.total)}`);
  const one = items.length === 1 ? items[0] : null;
  const share = one ? { perShare: usd(one.perShare), shares: Number(one.shares.toFixed(4)) } : null;
  if (kind === 'pay') {
    return one
      ? {
        title: `${one.symbol} pays you ${sum} today`,
        message: `${share!.perShare} a share on your ${share!.shares} shares.`,
        params: { kind: 'i18n' as const, title: { key: 'notifDividendPayOneTitle', vars: { symbol: one.symbol, amount: sum } }, message: { key: 'notifDividendPayOneMessage', vars: share! } },
      }
      : {
        title: `Your stocks pay you ${sum} today`,
        message: list.join(', '),
        params: { kind: 'i18n' as const, title: { key: 'notifDividendPayManyTitle', vars: { amount: sum } }, message: { key: 'notifList', vars: { items: list } } },
      };
  }
  return one
    ? {
      title: `${one.symbol} dividend locked in: ${sum}`,
      message: `You owned shares before today's ex-dividend date, so this payout is yours. ${share!.perShare} a share on your ${share!.shares} shares.`,
      params: { kind: 'i18n' as const, title: { key: 'notifDividendLockedOneTitle', vars: { symbol: one.symbol, amount: sum } }, message: { key: 'notifDividendLockedOneMessage', vars: share! } },
    }
    : {
      title: `${items.length} dividends locked in: ${sum}`,
      message: list.join(', '),
      params: { kind: 'i18n' as const, title: { key: 'notifDividendLockedManyTitle', vars: { count: items.length, amount: sum } }, message: { key: 'notifList', vars: { items: list } } },
    };
}

export async function runDividendPaydays(today: string): Promise<{ proUsers: number; notified: number; missing: string[]; errors: string[] }> {
  const supabase = createServerClient();
  const out = { proUsers: 0, notified: 0, missing: [] as string[], errors: [] as string[] };

  const { rows: users, error } = await fetchAllPages<{ id: string; account_tier: number | null; role: string | null; pro_bonus_until: string | null }>(() =>
    supabase
      .from('users')
      .select('id, account_tier, role, pro_bonus_until')
      .or('settings->notifications->dividend_reminder.is.null,settings->notifications->dividend_reminder.eq.true')
      .order('id'),
  );
  if (error) { out.errors.push(`users: ${error}`); return out; }
  const pros = new Set(users.filter((u) => isPro(tierFromUser(u.account_tier, u.role, u.pro_bonus_until))).map((u) => u.id));
  out.proUsers = pros.size;
  if (!pros.size) return out;

  // Every open position, filtered to Pro here: an .in() of every Pro id would outgrow the URL.
  const { rows, error: hErr } = await fetchAllPages<{ user_id: string; symbol: string; quantity: number | null; mic_code: string | null; trading_currency: string | null }>(() =>
    supabase.from('user_holdings').select('user_id, symbol, quantity, mic_code, trading_currency').or(OPEN_POSITION_FILTER).order('id'),
  );
  if (hErr) { out.errors.push(`holdings: ${hErr}`); return out; }

  // user -> symbol -> shares (lots add up; no share count means no amount to tell them)
  const held = new Map<string, Map<string, number>>();
  for (const h of rows) {
    if (!pros.has(h.user_id)) continue;
    if (!h.quantity || listingMic(h.mic_code) || (h.trading_currency ?? 'USD') !== 'USD' || h.symbol.includes('/')) continue;
    const m = held.get(h.user_id) ?? new Map<string, number>();
    m.set(h.symbol.toUpperCase(), (m.get(h.symbol.toUpperCase()) ?? 0) + h.quantity);
    held.set(h.user_id, m);
  }

  const symbols = [...new Set([...held.values()].flatMap((m) => [...m.keys()]))];
  const { schedules, missing } = await getDividendSchedules(symbols, 'cron');
  out.missing = missing;

  for (const [userId, positions] of held) {
    const groups: Record<'pay' | 'locked', Item[]> = { pay: [], locked: [] };
    for (const [symbol, shares] of positions) {
      for (const e of regularPayments(schedules.get(symbol) ?? [])) {
        const kind = e.payDate === today ? 'pay' : !e.payDate && e.exDate === today ? 'locked' : null;
        if (kind) groups[kind].push({ symbol, shares, perShare: e.amount, total: e.amount * shares });
      }
    }
    for (const kind of ['pay', 'locked'] as const) {
      const items = groups[kind];
      if (!items.length) continue;
      const entityId = `${DIVIDEND_INCOME_ENTITY}:${kind}:${today}`;
      // The cron can be re-run by hand; one notification per user, kind and day.
      const { data: existing } = await supabase.from('notifications').select('id')
        .eq('user_id', userId).eq('type', 'dividend').eq('entity_id', entityId).limit(1).maybeSingle();
      if (existing) continue;
      const copy = paydayCopy(kind, items.sort((a, b) => b.total - a.total));
      const res = await createNotification({
        user_id: userId, type: 'dividend', entity_type: 'portfolio', entity_id: entityId,
        severity: 'info', push: 'dividend_reminder', ...copy,
      });
      if (res.success) out.notified++;
      else out.errors.push(`${userId} ${kind}: ${res.error}`);
    }
  }
  return out;
}
