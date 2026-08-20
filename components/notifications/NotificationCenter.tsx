'use client';

import { useMemo, useEffect } from 'react';
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from '@/hooks/use-notifications';
import { NotificationItem } from './NotificationItem';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Check, Settings } from 'lucide-react';

interface NotificationCenterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * NotificationCenter
 * Displays notifications in a dropdown panel
 */
export function NotificationCenter({ open, onOpenChange }: NotificationCenterProps) {
  const { data: notifications, isLoading } = useNotifications(50);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  // Group notifications by day
  const groupedNotifications = useMemo(() => {
    if (!notifications) return {};

    const groups: Record<string, typeof notifications> = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    notifications.forEach((notification) => {
      const date = new Date(notification.created_at);
      date.setHours(0, 0, 0, 0);
      
      let key: string;
      if (date.getTime() === today.getTime()) {
        key = 'Today';
      } else if (date.getTime() === yesterday.getTime()) {
        key = 'Yesterday';
      } else {
        key = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      }

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(notification);
    });

    return groups;
  }, [notifications]);

  const handleMarkRead = (notificationId: string) => {
    markRead.mutate(notificationId);
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate();
  };

  const unreadCount = notifications?.filter((n) => !n.is_read).length || 0;

  // Mark all as read when the panel opens
  useEffect(() => {
    if (open && unreadCount > 0 && !markAllRead.isPending) {
      markAllRead.mutate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className="flex max-h-[600px] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-semibold text-sm">Notifications</h3>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllRead}
              disabled={markAllRead.isPending}
              className="h-7 text-xs"
            >
              <Check className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
          <Link
            href="/tools/alerts"
            onClick={() => onOpenChange(false)}
            aria-label="Alert options"
            title="Alert options"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Settings className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        ) : !notifications || notifications.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-muted-foreground">You&apos;re all caught up</p>
          </div>
        ) : (
          <div className="divide-y">
            {Object.entries(groupedNotifications).map(([dateKey, dayNotifications], groupIndex) => (
              <div key={dateKey}>
                {groupIndex > 0 && <Separator />}
                <div className="py-2">
                  <div className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {dateKey}
                  </div>
                  {dayNotifications.map((notification) => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      onMarkRead={handleMarkRead}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t">
        <Link
          href="/notifications"
          onClick={() => onOpenChange(false)}
          className="block px-4 py-2.5 text-center text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          View all notifications
        </Link>
      </div>
    </div>
  );
}
