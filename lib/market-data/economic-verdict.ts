// Client-safe: Home renders the same sentence the notification stores.
import type { NotifMsg } from '@/lib/notifications/notifications-db';
import type { EconomicKind } from './economic-kinds';

const msg = (key: string, vars?: NotifMsg['vars']): NotifMsg => (vars ? { key, vars } : { key });

/** Results worth a notification. Weekly claims would be one every Thursday. */
export const RESULT_KINDS_NOTIFIED: EconomicKind[] = ['fomc', 'cpi', 'jobs', 'pce', 'gdp'];

export interface EconomicResultEvent {
  id: string;
  kind: EconomicKind;
  results: Array<{ key: string; actual: number; previous: number | null }>;
  verdict: 'hold' | 'raise' | 'lower' | null;
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
  const sentences = (...parts: NotifMsg[]) => msg('notifSentences', { sentences: parts });

  switch (e.kind) {
    case 'fomc': {
      const upper = get('rate_upper');
      const lower = get('rate_lower');
      if (!upper || !lower) return null;
      const range = { lower: lower.actual, upper: upper.actual };
      if (e.verdict === 'hold') return { title: msg('notifEconFedHold', range), message: msg('notifEconFedHoldMeaning') };
      if (!e.verdict || upper.previous == null) return { title: msg('notifEconFedSet', range) };
      const change = Math.round(Math.abs(upper.actual - upper.previous) * 100) / 100;
      return e.verdict === 'raise'
        ? { title: msg('notifEconFedRaise', { ...range, change }), message: msg('notifEconFedRaiseMeaning') }
        : { title: msg('notifEconFedLower', { ...range, change }), message: msg('notifEconFedLowerMeaning') };
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
          ...(core ? [msg(e.kind === 'cpi' ? 'notifEconCoreCpi' : 'notifEconCorePce', { value: core.actual })] : []),
          msg('notifEconFedTarget'),
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
        message: rate ? sentences(msg('notifEconUnemployment', { value: rate.actual }), ...vs(rate, 'Month')) : undefined,
      };
    }
    case 'gdp': {
      const gdp = get('gdp');
      if (!gdp) return null;
      return {
        title: msg(gdp.actual < 0 ? 'notifEconGdpShrank' : 'notifEconGdpGrew', { value: Math.abs(gdp.actual) }),
        message: sentences(...vs(gdp, 'Quarter'), msg('notifEconGdpPace')),
      };
    }
    default:
      return null;
  }
}
