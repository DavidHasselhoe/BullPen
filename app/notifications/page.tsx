'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bell, Check, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useBackground } from '@/hooks/use-background';
import { useAuth } from '@/hooks/use-auth';
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from '@/hooks/use-notifications';
import { NotificationItem } from '@/components/notifications/NotificationItem';
import type { Notification } from '@/lib/notifications/notifications-db';

/** A short category label for filtering — derived from type + entity_type. */
function categoryOf(n: Notification): string {
  const et = n.entity_type as string | null;
  if (et === 'user_alert') return 'Alerts';
  switch (n.type) {
    case 'earnings': return 'Earnings';
    case 'dividend': return 'Dividends';
    case 'ai_insight': return 'AI';
    case 'academy': return 'Academy';
    case 'market': return 'Market';
    case 'price_move': return et === 'portfolio' ? 'Portfolio' : 'Stocks';
    default: return 'Other';
  }
}

const CATEGORY_ORDER = ['Portfolio', 'Stocks', 'Alerts', 'Earnings', 'Dividends', 'Academy', 'AI', 'Market', 'Other'];

function groupByDay(notifications: Notification[]): [string, Notification[]][] {
  const groups: Record<string, Notification[]> = {};
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);

  for (const n of notifications) {
    const d = new Date(n.created_at); d.setHours(0, 0, 0, 0);
    const key = d.getTime() === today.getTime()
      ? 'Today'
      : d.getTime() === yesterday.getTime()
        ? 'Yesterday'
        : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    (groups[key] ??= []).push(n);
  }
  return Object.entries(groups);
}

export default function NotificationsPage() {
  const { hasAnimatedBackground } = useBackground();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: notifications, isLoading } = useNotifications(200);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const [filter, setFilter] = useState<string>('All');
  const [unreadOnly, setUnreadOnly] = useState(false);

  const all = useMemo(() => notifications ?? [], [notifications]);
  const unreadCount = all.filter((n) => !n.is_read).length;

  // Category chips present in the data, in a stable order.
  const categories = useMemo(() => {
    const present = new Set(all.map(categoryOf));
    return CATEGORY_ORDER.filter((c) => present.has(c));
  }, [all]);

  const filtered = useMemo(() => {
    return all.filter((n) => {
      if (unreadOnly && n.is_read) return false;
      if (filter !== 'All' && categoryOf(n) !== filter) return false;
      return true;
    });
  }, [all, filter, unreadOnly]);

  const grouped = useMemo(() => groupByDay(filtered), [filtered]);

  const openSettings = () => window.dispatchEvent(new CustomEvent('settings:open', { detail: { tab: 'notifications' } }));

  return (
    <div className={cn('min-h-screen', !hasAnimatedBackground && 'bg-background')}>
      <main className="container mx-auto max-w-2xl px-4 py-6 sm:py-10">
        <Link
          href="/dashboard"
          className="group mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-0.5" />
          Home
        </Link>

        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Bell className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {unreadCount > 0 ? `${unreadCount} unread` : 'You’re all caught up'}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {unreadCount > 0 && (
              <Button variant="outline" size="sm" onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending} className="gap-1.5">
                <Check className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Mark all read</span>
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={openSettings} aria-label="Notification settings" title="Notification settings">
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Filters */}
        {all.length > 0 && (
          <div className="scrollbar-hide mb-4 flex items-center gap-1.5 overflow-x-auto pb-1">
            {['All', ...categories].map((c) => (
              <FilterChip key={c} label={c} active={filter === c} onClick={() => setFilter(c)} />
            ))}
            <span className="mx-1 h-4 w-px shrink-0 bg-border" />
            <FilterChip label="Unread" active={unreadOnly} onClick={() => setUnreadOnly((v) => !v)} />
          </div>
        )}

        {/* List */}
        {isLoading || authLoading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-start gap-3 px-1 py-2">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : !isAuthenticated ? (
          <EmptyState text="Sign in to see your notifications." />
        ) : filtered.length === 0 ? (
          <EmptyState
            text={all.length === 0 ? 'No notifications yet. Alerts, earnings, and portfolio updates will show up here.' : 'Nothing matches this filter.'}
            illustration={all.length === 0 ? '/illustrations/bull-sleeping.png' : '/illustrations/bull-shrug.png'}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border">
            {grouped.map(([day, items], gi) => (
              <div key={day}>
                {gi > 0 && <Separator />}
                <div className="bg-muted/20 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {day}
                </div>
                <div className="divide-y">
                  {items.map((n) => (
                    <NotificationItem key={n.id} notification={n} onMarkRead={(id) => markRead.mutate(id)} />
                  ))}
                </div>
              </div>
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
      className={cn(
        'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
        active ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
    >
      {label}
    </button>
  );
}

function EmptyState({ text, illustration = '/illustrations/bull-shrug.png' }: { text: string; illustration?: string }) {
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
