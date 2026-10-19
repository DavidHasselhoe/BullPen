import type { Notification } from '@/lib/notifications/notifications-db';

export type NotificationCategory = 'stocks' | 'bull' | 'following' | 'academy';

/**
 * Filter chips on /notifications, in order. Types not listed here (economic
 * calendar, billing, referral) show under All only. The old chips were built
 * from type names and sent Weekly Pick, Health Score, 13F and Washington
 * Trading, the most common notifications, to "Other".
 */
export const NOTIFICATION_CATEGORIES: { id: NotificationCategory; label: string }[] = [
  { id: 'stocks', label: 'Your stocks' },
  { id: 'bull', label: 'From Bull' },
  { id: 'following', label: 'Funds & Congress' },
  { id: 'academy', label: 'Academy' },
];

export function categoryOf(n: Notification): NotificationCategory | null {
  switch (n.type) {
    case 'price_move':
    case 'earnings':
    case 'dividend':
    case 'health_score':
      return 'stocks';
    case 'weekly_pick':
    case 'daily_brief':
    case 'ai_insight':
      return 'bull';
    case 'institution_filing':
    case 'politician_trade':
      return 'following';
    case 'academy':
      return 'academy';
    default:
      return null;
  }
}

/**
 * Today / Yesterday / This week / Earlier, on the device clock. A header per
 * calendar day put one above nearly every row, repeating the date each row
 * already shows.
 */
export function groupByRecency(notifications: Notification[]): [string, Notification[]][] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const groups = new Map<string, Notification[]>();
  for (const n of notifications) {
    const day = new Date(n.created_at);
    day.setHours(0, 0, 0, 0);
    const daysAgo = Math.round((today.getTime() - day.getTime()) / 86_400_000);
    const key = daysAgo <= 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : daysAgo < 7 ? 'This week' : 'Earlier';
    const group = groups.get(key);
    if (group) group.push(n);
    else groups.set(key, [n]);
  }
  return [...groups];
}
