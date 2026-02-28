'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { Notification } from '@/lib/notifications/notifications-db';

/**
 * Formats a date as relative time (e.g., "2 minutes ago")
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return 'just now';
  } else if (diffMinutes < 60) {
    return `${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

interface NotificationItemProps {
  notification: Notification;
  onMarkRead: (notificationId: string) => void;
}

/**
 * NotificationItem
 * Displays a single notification with click handling
 */
export function NotificationItem({ notification, onMarkRead }: NotificationItemProps) {
  const handleClick = () => {
    if (!notification.is_read) {
      onMarkRead(notification.id);
    }
  };

  // Get link URL based on entity type
  const getLinkUrl = (): string => {
    if (notification.entity_type === 'stock' && notification.entity_id) {
      return `/stock/${notification.entity_id}`;
    }
    if (notification.entity_type === 'portfolio') {
      return '/holdings';
    }
    return '/';
  };

  // Get severity colors
  const getSeverityColor = () => {
    switch (notification.severity) {
      case 'critical':
        return 'border-l-red-500';
      case 'warning':
        return 'border-l-yellow-500';
      default:
        return 'border-l-blue-500';
    }
  };

  const linkUrl = getLinkUrl();

  return (
    <Link
      href={linkUrl}
      onClick={handleClick}
      className={cn(
        'block px-4 py-3 border-l-4 transition-colors hover:bg-accent/50',
        !notification.is_read ? 'bg-accent/30' : 'bg-transparent',
        getSeverityColor()
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className={cn(
              'text-sm font-medium',
              !notification.is_read ? 'text-foreground' : 'text-muted-foreground'
            )}>
              {notification.title}
            </h4>
            {!notification.is_read && (
              <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
            )}
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2">
            {notification.message}
          </p>
        </div>
        <div className="text-xs text-muted-foreground shrink-0">
          {formatRelativeTime(notification.created_at)}
        </div>
      </div>
    </Link>
  );
}
