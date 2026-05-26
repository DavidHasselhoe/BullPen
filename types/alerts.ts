import { z } from 'zod';

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

/**
 * Grouping for the UI's type picker. Keep stable — drives layout order.
 */
export const ALERT_TYPE_GROUPS: Array<{
  group: 'Price' | 'Momentum' | 'Proximity' | 'Milestone';
  types: AlertType[];
}> = [
  { group: 'Price',     types: ['price_above', 'price_below'] },
  { group: 'Momentum',  types: ['pct_change_up', 'pct_change_down'] },
  { group: 'Proximity', types: ['near_52w_high', 'near_52w_low'] },
  { group: 'Milestone', types: ['all_time_high'] },
];

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

export function alertTypeLabel(t: AlertType): string {
  return TYPE_LABELS[t];
}

/** Compact human summary for the alert card. */
export function describeAlert(a: Pick<UserAlert, 'alertType' | 'threshold'>): string {
  switch (a.alertType) {
    case 'price_above':     return `Price ≥ $${a.threshold.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    case 'price_below':     return `Price ≤ $${a.threshold.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    case 'pct_change_up':   return `Daily gain ≥ ${(a.threshold * 100).toFixed(1)}%`;
    case 'pct_change_down': return `Daily drop ≥ ${(a.threshold * 100).toFixed(1)}%`;
    case 'near_52w_high':   return `Within ${(a.threshold * 100).toFixed(1)}% of 52-week high`;
    case 'near_52w_low':    return `Within ${(a.threshold * 100).toFixed(1)}% of 52-week low`;
    case 'all_time_high':   return 'New all-time high';
  }
}

// ─── Free-tier limit ─────────────────────────────────────────────────────────

export const FREE_ACTIVE_ALERT_LIMIT = 5;
