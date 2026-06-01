'use client';

import Link from 'next/link';
import { Bell, TrendingUp, TrendingDown, BarChart2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Notification } from '@/lib/notifications/notifications-db';

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function NotifIcon({ type, severity }: { type: Notification['type']; severity: Notification['severity'] }) {
  const base = 'h-4 w-4 shrink-0';
  if (type === 'price_move') {
    return severity === 'warning' || severity === 'critical'
      ? <TrendingDown className={cn(base, 'text-red-400')} />
      : <TrendingUp className={cn(base, 'text-emerald-400')} />;
  }
  if (type === 'earnings') return <BarChart2 className={cn(base, 'text-blue-400')} />;
  if (type === 'ai_insight') return <Sparkles className={cn(base, 'text-violet-400')} />;
  return <Bell className={cn(base, 'text-muted-foreground/60')} />;
}

interface NotificationItemProps {
  notification: Notification;
  onMarkRead: (notificationId: string) => void;
}

export function NotificationItem({ notification, onMarkRead }: NotificationItemProps) {
  const handleClick = () => {
    if (!notification.is_read) onMarkRead(notification.id);
  };

  const stockHref =
    notification.entity_type === 'stock' && notification.entity_id
      ? `/stock/${notification.entity_id}`
      : notification.entity_type === 'portfolio'
        ? '/holdings'
        : null;

  const inner = (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40 cursor-pointer',
        !notification.is_read && 'bg-primary/[0.04]'
      )}
      onClick={handleClick}
    >
      {/* Icon */}
      <div className={cn(
        'mt-0.5 h-7 w-7 shrink-0 rounded-lg flex items-center justify-center',
        notification.type === 'price_move'
          ? (notification.severity === 'warning' || notification.severity === 'critical' ? 'bg-red-500/10' : 'bg-emerald-500/10')
          : notification.type === 'earnings'
            ? 'bg-blue-500/10'
            : notification.type === 'ai_insight'
              ? 'bg-violet-500/10'
              : 'bg-muted'
      )}>
        <NotifIcon type={notification.type} severity={notification.severity} />
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-start justify-between gap-2">
          <p className={cn(
            'text-xs font-semibold leading-snug',
            !notification.is_read ? 'text-foreground' : 'text-muted-foreground'
          )}>
            {notification.title}
            {!notification.is_read && (
              <span className="inline-block ml-1.5 h-1.5 w-1.5 rounded-full bg-primary align-middle" />
            )}
          </p>
          <span className="text-[10px] text-muted-foreground/50 shrink-0 tabular-nums">
            {formatRelativeTime(notification.created_at)}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground/70 leading-snug line-clamp-2">
          {notification.message}
        </p>
        {/* Contextual footer links */}
        {notification.type === 'price_move' && stockHref && (
          <div className="flex items-center gap-3 pt-1">
            <Link
              href={stockHref}
              onClick={(e) => e.stopPropagation()}
              className="text-[10px] font-medium text-primary/70 hover:text-primary transition-colors"
            >
              View stock →
            </Link>
            <Link
              href="/tools/alerts"
              onClick={(e) => e.stopPropagation()}
              className="text-[10px] font-medium text-muted-foreground/50 hover:text-foreground transition-colors"
            >
              Manage alerts
            </Link>
          </div>
        )}
        {notification.type === 'earnings' && stockHref && (
          <Link
            href={stockHref}
            onClick={(e) => e.stopPropagation()}
            className="block pt-1 text-[10px] font-medium text-primary/70 hover:text-primary transition-colors"
          >
            View earnings →
          </Link>
        )}
      </div>
    </div>
  );

  // Wrap in a Link only for non-price_move types (price_move has its own sub-links)
  if (stockHref && notification.type !== 'price_move' && notification.type !== 'earnings') {
    return <Link href={stockHref}>{inner}</Link>;
  }

  return inner;
}
