'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bell, Check, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useBackground } from '@/hooks/use-background';
import { useAuth } from '@/hooks/use-auth';
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, useMarkAllNotificationsSeen } from '@/hooks/use-notifications';
import { NotificationItem } from '@/components/notifications/NotificationItem';
import { NotificationsError } from '@/components/notifications/NotificationsError';
import { NOTIFICATION_CATEGORIES, categoryOf, groupByRecency, type NotificationCategory } from '@/components/notifications/notification-groups';
import { AuthGate } from '@/components/ui/AuthGate';

export default function NotificationsPage() {
  const { hasAnimatedBackground } = useBackground();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: notifications, isLoading, isError, refetch, isRefetching } = useNotifications(200);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const markAllSeen = useMarkAllNotificationsSeen();

  const [filter, setFilter] = useState<NotificationCategory | 'all'>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);

  const all = useMemo(() => notifications ?? [], [notifications]);
  const unreadCount = all.filter((n) => !n.is_read).length;
  const unseenCount = all.filter((n) => !n.is_read && !n.is_seen).length;

  // Being on this page counts as seeing everything: clear the bell badge,
  // but leave rows unread until they are clicked.
  useEffect(() => {
    if (unseenCount > 0 && !markAllSeen.isPending) markAllSeen.mutate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unseenCount]);

  // Only chips that would show something.
  const categories = useMemo(() => {
    const present = new Set(all.map(categoryOf));
    return NOTIFICATION_CATEGORIES.filter((c) => present.has(c.id));
  }, [all]);

  const filtered = useMemo(
    () => all.filter((n) => (!unreadOnly || !n.is_read) && (filter === 'all' || categoryOf(n) === filter)),
    [all, filter, unreadOnly]
  );
  const grouped = useMemo(() => groupByRecency(filtered), [filtered]);

  const openSettings = () => window.dispatchEvent(new CustomEvent('settings:open', { detail: { tab: 'notifications' } }));

  // The shared gate, like Holdings and Watchlist. (This page is untranslated.)
  if (!authLoading && !isAuthenticated) {
    return (
      <AuthGate
        source="notifications"
        icon={<Bell className="h-7 w-7" />}
        title="Your alerts and updates, in one place"
        description="Price alerts, earnings dates and big moves in the stocks you follow."
      />
    );
  }

  return (
    <div className={cn('min-h-screen', !hasAnimatedBackground && 'bg-background')}>
      <main className="container mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <Link
          href="/dashboard"
          className="group mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-0.5" />
          Home
        </Link>

        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {isError ? ' ' : unreadCount > 0 ? `${unreadCount} unread` : 'You’re all caught up'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                aria-label="Mark all read"
                className="h-9 gap-1.5"
              >
                <Check className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Mark all read</span>
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={openSettings} aria-label="Notification settings" title="Notification settings">
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {all.length > 0 && (
          <div className="scrollbar-hide -mx-1 mb-4 flex items-center gap-1.5 overflow-x-auto px-1 py-1.5">
            <FilterChip label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
            {categories.map((c) => (
              <FilterChip key={c.id} label={c.label} active={filter === c.id} onClick={() => setFilter(c.id)} />
            ))}
            <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border" />
            <FilterChip label="Unread" active={unreadOnly} onClick={() => setUnreadOnly((v) => !v)} />
          </div>
        )}

        {isLoading || authLoading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-start gap-3 px-1 py-2">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3.5 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-xl border">
            <NotificationsError onRetry={() => refetch()} retrying={isRefetching} />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            text={
              all.length === 0
                ? 'No notifications yet. Price alerts, earnings dates and big moves in your stocks will show up here.'
                : unreadOnly && filter === 'all'
                  ? 'Nothing unread. You’re all caught up.'
                  : 'Nothing here with this filter.'
            }
            illustration={all.length === 0 ? '/illustrations/bull-sleeping.webp' : '/illustrations/bull-shrug.webp'}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border">
            {grouped.map(([label, items], gi) => (
              <section key={label} aria-labelledby={`notif-group-${gi}`} className={cn(gi > 0 && 'border-t')}>
                <h2 id={`notif-group-${gi}`} className="px-4 pb-1 pt-4 text-xs font-medium text-muted-foreground">
                  {label}
                </h2>
                <div className="divide-y divide-border/60">
                  {items.map((n) => (
                    <NotificationItem key={n.id} notification={n} onMarkRead={(id) => markRead.mutate(id)} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        // 32px pill, with the hit area stretched to 44px for touch.
        'relative h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-[""]',
        active ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
    >
      {label}
    </button>
  );
}

function EmptyState({ text, illustration }: { text: string; illustration: string }) {
  return (
    <div className="rounded-xl border border-dashed py-16 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={illustration}
        alt=""
        aria-hidden
        className="mx-auto mb-4 h-auto w-28 select-none opacity-90 dark:opacity-80 dark:invert"
      />
      <p className="mx-auto max-w-xs px-6 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
