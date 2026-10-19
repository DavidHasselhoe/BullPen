'use client';

import { useMemo, useEffect } from 'react';
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, useMarkAllNotificationsSeen } from '@/hooks/use-notifications';
import { NotificationItem } from './NotificationItem';
import { NotificationsError } from './NotificationsError';
import { groupByRecency } from './notification-groups';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Check, Settings } from 'lucide-react';

interface NotificationCenterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The bell dropdown. */
export function NotificationCenter({ open, onOpenChange }: NotificationCenterProps) {
  const { data: notifications, isLoading, isError, refetch, isRefetching } = useNotifications(50);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const markAllSeen = useMarkAllNotificationsSeen();

  const grouped = useMemo(() => groupByRecency(notifications ?? []), [notifications]);
  const unreadCount = notifications?.filter((n) => !n.is_read).length ?? 0;
  const unseenCount = notifications?.filter((n) => !n.is_read && !n.is_seen).length ?? 0;

  // Opening the bell clears the badge (seen) but leaves rows unread until
  // they are clicked. It used to mark everything read here, so one glance
  // wiped the unread state the full page relies on.
  useEffect(() => {
    if (open && unseenCount > 0 && !markAllSeen.isPending) markAllSeen.mutate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, unseenCount]);

  return (
    <div className="flex max-h-[600px] flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Notifications</h3>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              className="h-8 text-xs"
            >
              <Check className="mr-1 h-3.5 w-3.5" />
              Mark all read
            </Button>
          )}
          <Link
            href="/tools/alerts"
            onClick={() => onOpenChange(false)}
            aria-label="Alert options"
            title="Alert options"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Settings className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <NotificationsError onRetry={() => refetch()} retrying={isRefetching} />
        ) : !notifications || notifications.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-muted-foreground">You&apos;re all caught up</p>
          </div>
        ) : (
          grouped.map(([label, items]) => (
            <section key={label} aria-label={label}>
              <h4 className="sticky top-0 z-10 bg-popover px-4 pb-1 pt-3 text-xs font-medium text-muted-foreground">
                {label}
              </h4>
              <div className="divide-y divide-border/60">
                {items.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onMarkRead={(id) => markRead.mutate(id)}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <div className="border-t">
        <Link
          href="/notifications"
          onClick={() => onOpenChange(false)}
          className="block px-4 py-3 text-center text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          View all notifications
        </Link>
      </div>
    </div>
  );
}
