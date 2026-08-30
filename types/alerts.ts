import { z } from 'zod';
import type { TFunction } from 'i18next';

// ─── Alert type taxonomy ─────────────────────────────────────────────────────

export const AlertTypeSchema = z.enum([
  'price_above',
  'price_below',
  'pct_change_up',
  'pct_change_down',
  'near_52w_high',
  'near_52w_low',
  'all_time_high',
]);
export type AlertType = z.infer<typeof AlertTypeSchema>;

export type AlertTypeGroupName = 'Price' | 'Momentum' | 'Proximity' | 'Milestone';

/**
 * Grouping for the UI's type picker. Keep stable — drives layout order.
 * `group` is a stable English identifier, not display text — see groupLabel().
 */
export const ALERT_TYPE_GROUPS: Array<{
  group: AlertTypeGroupName;
  types: AlertType[];
}> = [
  { group: 'Price',     types: ['price_above', 'price_below'] },
  { group: 'Momentum',  types: ['pct_change_up', 'pct_change_down'] },
  { group: 'Proximity', types: ['near_52w_high', 'near_52w_low'] },
  { group: 'Milestone', types: ['all_time_high'] },
];

const GROUP_LABELS: Record<AlertTypeGroupName, string> = {
  Price: 'Price',
  Momentum: 'Momentum',
  Proximity: 'Proximity',
  Milestone: 'Milestone',
};

const GROUP_LABEL_KEYS: Record<AlertTypeGroupName, string> = {
  Price: 'groupPrice',
  Momentum: 'groupMomentum',
  Proximity: 'groupProximity',
  Milestone: 'groupMilestone',
};

/**
 * `t` is optional so this stays callable from server code with no i18next
 * context (lib/notifications/notification-creators.ts writes a plain-English
 * message straight into a stored notification row; lib/ai/tools.ts builds a
 * string fed back to the LLM) — both keep today's English behavior
 * unchanged. Client UI call sites pass `t` from useTranslation('alerts') to
 * get a real translation.
 */
export function groupLabel(group: AlertTypeGroupName, t?: TFunction): string {
  return t ? t(GROUP_LABEL_KEYS[group]) : GROUP_LABELS[group];
}

// ─── DB row → client shape ───────────────────────────────────────────────────

export interface UserAlert {
  id: string;
  userId: string;
  symbol: string;
  companyName: string | null;
  alertType: AlertType;
  threshold: number;
  baselineValue: number | null;
  isActive: boolean;
  lastTriggeredAt: string | null;
  triggerCount: number;
  createdAt: string;
}

// ─── Create payload (POST /api/alerts body) ──────────────────────────────────

export const CreateAlertPayloadSchema = z.object({
  symbol:       z.string().trim().min(1).max(20).transform((s) => s.toUpperCase()),
  companyName:  z.string().trim().max(160).optional(),
  alertType:    AlertTypeSchema,
  /**
   * Thresholds are stored as the raw scalar from the user:
   * - price_*:        positive dollars (e.g. 200)
   * - pct_change_*:   percent as decimal (e.g. 0.05 = 5%)
   * - near_52w_*:     proximity as decimal (e.g. 0.02 = within 2%)
   * - all_time_high:  unused (clients send 0)
   */
  threshold:    z.number().finite().nonnegative(),
});
export type CreateAlertPayload = z.infer<typeof CreateAlertPayloadSchema>;

// ─── PATCH payload (toggle pause/resume) ─────────────────────────────────────

export const PatchAlertPayloadSchema = z.object({
  isActive: z.boolean(),
});
export type PatchAlertPayload = z.infer<typeof PatchAlertPayloadSchema>;

// ─── Display helpers ─────────────────────────────────────────────────────────

const TYPE_LABELS: Record<AlertType, string> = {
  price_above:     'Price above',
  price_below:     'Price below',
  pct_change_up:   'Daily gain',
  pct_change_down: 'Daily drop',
  near_52w_high:   'Near 52-week high',
  near_52w_low:    'Near 52-week low',
  all_time_high:   'All-time high',
};

const TYPE_LABEL_KEYS: Record<AlertType, string> = {
  price_above:     'typePriceAbove',
  price_below:     'typePriceBelow',
  pct_change_up:   'typePctChangeUp',
  pct_change_down: 'typePctChangeDown',
  near_52w_high:   'typeNear52wHigh',
  near_52w_low:    'typeNear52wLow',
  all_time_high:   'typeAllTimeHigh',
};

/** See groupLabel() above for why `t` is optional. */
export function alertTypeLabel(type: AlertType, t?: TFunction): string {
  return t ? t(TYPE_LABEL_KEYS[type]) : TYPE_LABELS[type];
}

/** Compact human summary for the alert card. `t` is optional — see groupLabel() above. */
export function describeAlert(a: Pick<UserAlert, 'alertType' | 'threshold'>, t?: TFunction): string {
  const price = a.threshold.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const pct = (a.threshold * 100).toFixed(1);

  if (t) {
    switch (a.alertType) {
      case 'price_above':     return t('describePriceAbove', { price });
      case 'price_below':     return t('describePriceBelow', { price });
      case 'pct_change_up':   return t('describePctChangeUp', { pct });
      case 'pct_change_down': return t('describePctChangeDown', { pct });
      case 'near_52w_high':   return t('describeNear52wHigh', { pct });
      case 'near_52w_low':    return t('describeNear52wLow', { pct });
      case 'all_time_high':   return t('describeAllTimeHigh');
    }
  }

  switch (a.alertType) {
    case 'price_above':     return `Price ≥ $${price}`;
    case 'price_below':     return `Price ≤ $${price}`;
    case 'pct_change_up':   return `Daily gain ≥ ${pct}%`;
    case 'pct_change_down': return `Daily drop ≥ ${pct}%`;
    case 'near_52w_high':   return `Within ${pct}% of 52-week high`;
    case 'near_52w_low':    return `Within ${pct}% of 52-week low`;
    case 'all_time_high':   return 'New all-time high';
  }
}

// ─── Free-tier limit ─────────────────────────────────────────────────────────

export const FREE_ACTIVE_ALERT_LIMIT = 5;
