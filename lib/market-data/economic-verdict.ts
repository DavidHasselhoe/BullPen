// Client-safe: Home renders the same sentence the notification stores.
import type { NotifMsg } from '@/lib/notifications/notifications-db';
import type { EconomicKind } from './economic-kinds';
import type { Extreme } from './economy-hub';
import { fmtPeriod } from '@/components/economy/format';

const msg = (key: string, vars?: NotifMsg['vars']): NotifMsg => (vars ? { key, vars } : { key });

/** Results worth a notification. Weekly claims would be one every Thursday. */
export const RESULT_KINDS_NOTIFIED: EconomicKind[] = ['fomc', 'cpi', 'jobs', 'pce', 'gdp'];

export interface EconomicResultEvent {
  id: string;
  kind: EconomicKind;
  results: Array<{ key: string; actual: number; previous: number | null }>;
  verdict: 'hold' | 'raise' | 'lower' | null;
  /** How unusual the headline is against its own history (economy-hub.ts). Set when the result lands. */
  extreme?: Extreme | null;
  /** One model-written sentence on what the release means (lib/ai/economy-summary.ts). English. */
  takeaway?: string | null;
}

/**
 * "The highest since May 2026." The period goes in pre-worded in English.
 * ponytail: every account reads English today (2026-11-06); pass the period as data once one doesn't.
 */
function extremeMsg(kind: EconomicKind, ex: Extreme | null | undefined): NotifMsg[] {
  if (!ex) return [];
  const dir = ex.dir === 'high' ? 'High' : 'Low';
  return 'since' in ex
    ? [msg(`notifEcon${dir}Since`, { period: fmtPeriod(kind, ex.since, 'en-US', kind !== 'claims') })]
    : [msg(`notifEcon${dir}Years`, { years: ex.years })];
}

/**
 * What came in, against the release before, in plain words (navigation
 * notifEcon* keys). No consensus and no odds: we have neither, so the only
 * comparison is with the previous release, plus the Fed's 2% target, which is
 * a fact. Null when the stored result lacks its headline.
 */
export function economicResultText(e: EconomicResultEvent): { title: NotifMsg; message?: NotifMsg } | null {
  const get = (key: string) => e.results.find((r) => r.key === key);
  const vs = (r: { actual: number; previous: number | null } | undefined, per: 'Month' | 'Quarter'): NotifMsg[] =>
    r?.previous == null ? []
      : [msg(r.actual > r.previous ? `notifEconUp${per}` : r.actual < r.previous ? `notifEconDown${per}` : `notifEconSame${per}`, { previous: r.previous })];
  const sentences = (...parts: Array<NotifMsg | string>) => msg('notifSentences', { sentences: parts });
  const ex = extremeMsg(e.kind, e.extreme);
  // The model's sentence says what it means, so it replaces the stock explanation where there is one.
  const take = e.takeaway ? [e.takeaway] : null;

  switch (e.kind) {
    case 'fomc': {
      const upper = get('rate_upper');
      const lower = get('rate_lower');
      if (!upper || !lower) return null;
      const range = { lower: lower.actual, upper: upper.actual };
      const meaning = (key: string) => (take ? sentences(...take) : msg(key));
      if (e.verdict === 'hold') return { title: msg('notifEconFedHold', range), message: meaning('notifEconFedHoldMeaning') };
      if (!e.verdict || upper.previous == null) return { title: msg('notifEconFedSet', range), message: take ? sentences(...take) : undefined };
      const change = Math.round(Math.abs(upper.actual - upper.previous) * 100) / 100;
      return e.verdict === 'raise'
        ? { title: msg('notifEconFedRaise', { ...range, change }), message: meaning('notifEconFedRaiseMeaning') }
        : { title: msg('notifEconFedLower', { ...range, change }), message: meaning('notifEconFedLowerMeaning') };
    }
    case 'cpi':
    case 'pce': {
      const head = get(`${e.kind}_yoy`);
      const core = get(`core_${e.kind}_yoy`);
      if (!head) return null;
      return {
        title: msg(e.kind === 'cpi' ? 'notifEconCpi' : 'notifEconPce', { value: head.actual }),
        message: sentences(
          ...vs(head, 'Month'),
          ...ex,
          ...(take ?? [
            ...(core ? [msg(e.kind === 'cpi' ? 'notifEconCoreCpi' : 'notifEconCorePce', { value: core.actual })] : []),
            msg('notifEconFedTarget'),
          ]),
        ),
      };
    }
    case 'jobs': {
      const payrolls = get('payrolls');
      const rate = get('unemployment');
      if (!payrolls) return null;
      return {
        // FRED counts payrolls in thousands.
        title: msg(payrolls.actual < 0 ? 'notifEconJobsLost' : 'notifEconJobsAdded', { value: Math.abs(payrolls.actual) * 1000 }),
        message: rate || ex.length || take
          ? sentences(...(rate ? [msg('notifEconUnemployment', { value: rate.actual }), ...vs(rate, 'Month')] : []), ...ex, ...(take ?? []))
          : undefined,
      };
    }
    case 'gdp': {
      const gdp = get('gdp');
      if (!gdp) return null;
      return {
        title: msg(gdp.actual < 0 ? 'notifEconGdpShrank' : 'notifEconGdpGrew', { value: Math.abs(gdp.actual) }),
        message: sentences(...vs(gdp, 'Quarter'), ...ex, ...(take ?? [msg('notifEconGdpPace')])),
      };
    }
    default:
      return null;
  }
}
