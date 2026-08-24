'use client';

import { useEffect, useRef, useState } from 'react';
import { useNotifications } from '@/hooks/use-notifications';
import { NotificationToast } from './NotificationToast';
import type { Notification } from '@/lib/notifications/notifications-db';

function shouldToast(n: Notification): boolean {
  return n.severity === 'warning' || n.severity === 'critical' || n.type === 'ai_insight' || n.type === 'referral';
}

/**
 * Mounted once at the app root. Watches the same notifications list the bell
 * already polls/subscribes to (useNotifications' Realtime channel), and pops
 * a toast the moment a new one worth interrupting for arrives — e.g. "Your
 * AAPL deep dive is ready" — wherever the user currently is in the app, not
 * just when they happen to open the bell.
 */
export function NotificationToastListener() {
  const { data: notifications } = useNotifications(10);
  const [active, setActive] = useState<Notification | null>(null);
  const seenIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!notifications) return;

    if (seenIds.current === null) {
      // First load — these already existed, don't toast historical ones.
      seenIds.current = new Set(notifications.map((n) => n.id));
      return;
    }

    const fresh = notifications.find((n) => !seenIds.current!.has(n.id) && shouldToast(n));
    for (const n of notifications) seenIds.current.add(n.id);
    if (fresh) setActive(fresh);
  }, [notifications]);

  if (!active) return null;
  return <NotificationToast notification={active} onDismiss={() => setActive(null)} />;
}
