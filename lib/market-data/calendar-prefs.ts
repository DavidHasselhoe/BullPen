/**
 * The Market Calendar's saved filters, stored at users.settings.calendar_prefs.
 *
 * Server-safe on purpose: `economicKinds` is also the list of releases a
 * user gets economic notifications for (check-economic-events cron), so
 * "I only care about the jobs report" is set once and holds in both places.
 */

import type { EconomicKind } from './economic-kinds';

export const CALENDAR_PREFS_KEY = 'calendar_prefs';

export const COMPANY_EVENT_TYPES = ['earnings', 'dividends', 'splits', 'ipo'] as const;
export type CompanyEventType = (typeof COMPANY_EVENT_TYPES)[number];

export const ECONOMIC_KIND_ORDER: EconomicKind[] = ['jobs', 'cpi', 'fomc', 'pce', 'gdp', 'ppi', 'jolts', 'claims'];

/** Which companies' events to show: every company, or only ones the user tracks. */
export type CalendarScope = 'all' | 'mine' | 'holdings' | 'watchlist';
const SCOPES: CalendarScope[] = ['all', 'mine', 'holdings', 'watchlist'];

export interface CalendarPrefs {
  scope: CalendarScope;
  types: CompanyEventType[];
  /** Empty means the Economic filter is off entirely. */
  economicKinds: EconomicKind[];
}

export const CALENDAR_PREF_DEFAULTS: CalendarPrefs = {
  scope: 'all',
  types: [...COMPANY_EVENT_TYPES],
  economicKinds: [...ECONOMIC_KIND_ORDER],
};

/** Tolerant read of whatever is stored: unknown values drop, missing fields default. */
export function parseCalendarPrefs(raw: unknown): CalendarPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const scope = SCOPES.includes(r.scope as CalendarScope) ? (r.scope as CalendarScope) : CALENDAR_PREF_DEFAULTS.scope;
  const types = Array.isArray(r.types)
    ? COMPANY_EVENT_TYPES.filter((t) => (r.types as unknown[]).includes(t))
    : CALENDAR_PREF_DEFAULTS.types;
  const economicKinds = Array.isArray(r.economicKinds)
    ? ECONOMIC_KIND_ORDER.filter((k) => (r.economicKinds as unknown[]).includes(k))
    : CALENDAR_PREF_DEFAULTS.economicKinds;
  // An empty type list would blank every company event with no visible reason.
  return { scope, types: types.length > 0 ? types : CALENDAR_PREF_DEFAULTS.types, economicKinds };
}
