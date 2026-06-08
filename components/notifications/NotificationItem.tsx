'use client';

import Link from 'next/link';
import { TrendingUp, TrendingDown, BarChart2, Sparkles, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CompanyLogo } from '@/components/company/CompanyLogo';
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

/** Extract ticker symbols from a price-move message like "AVGO +12.6%, MU -7.7%" */
function parseTickersFromMessage(message: string): string[] {
  const matches = message.match(/\b([A-Z]{1,5})(?:\/[A-Z]{1,5})?\s[+-]/g) ?? [];
  return matches.map((m) => m.trim().split(/\s/)[0] ?? '').filter(Boolean).slice(0, 5);
}

/** Stacked company logo strip — up to 4 logos overlapping like an avatar group. */
function LogoStrip({ tickers, isGain }: { tickers: string[]; isGain: boolean }) {
  if (tickers.length === 0) {
    return (
      <div className={cn(
        'h-7 w-7 shrink-0 rounded-lg flex items-center justify-center',
        isGain ? 'bg-emerald-500/10' : 'bg-red-500/10',
      )}>
        {isGain
          ? <TrendingUp className="h-4 w-4 text-emerald-400" />
          : <TrendingDown className="h-4 w-4 text-red-400" />}
      </div>
    );
  }

  const shown = tickers.slice(0, 4);
  const LOGO_SIZE = 22;
  const OVERLAP = 8;
  const totalWidth = LOGO_SIZE + (shown.length - 1) * (LOGO_SIZE - OVERLAP);

  return (
    <div
      className="relative shrink-0 self-start mt-0.5"
      style={{ width: totalWidth, height: LOGO_SIZE }}
    >
      {shown.map((ticker, i) => (
        <div
          key={ticker}
          className="absolute rounded-full ring-2 ring-background overflow-hidden"
          style={{
            left: i * (LOGO_SIZE - OVERLAP),
            zIndex: shown.length - i,
            width: LOGO_SIZE,
            height: LOGO_SIZE,
          }}
        >
          <CompanyLogo name={ticker} ticker={ticker} logoUrl={null} size={LOGO_SIZE} />
        </div>
      ))}
    </div>
  );
}

function GenericIcon({ type, severity }: { type: Notification['type']; severity: Notification['severity'] }) {
  const base = 'h-4 w-4 shrink-0';
  if (type === 'earnings') return (
    <div className="mt-0.5 h-7 w-7 shrink-0 rounded-lg bg-blue-500/10 flex items-center justify-center">
      <BarChart2 className={cn(base, 'text-blue-400')} />
    </div>
  );
  if (type === 'ai_insight') return (
    <div className="mt-0.5 h-7 w-7 shrink-0 rounded-lg bg-violet-500/10 flex items-center justify-center">
      <Sparkles className={cn(base, 'text-violet-400')} />
    </div>
  );
  const isDown = severity === 'warning' || severity === 'critical';
  return (
    <div className={cn('mt-0.5 h-7 w-7 shrink-0 rounded-lg flex items-center justify-center', isDown ? 'bg-red-500/10' : 'bg-emerald-500/10')}>
      {isDown
        ? <TrendingDown className={cn(base, 'text-red-400')} />
        : <Bell className={cn(base, 'text-muted-foreground/60')} />}
    </div>
  );
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
      ? `/stock/${notification.entity_id.replace(/:.*$/, '')}`
      : notification.entity_type === 'portfolio'
        ? '/holdings'
        : null;

  // For price_move digest/portfolio notifications, show stacked logos from the message.
  // For single-stock price_move, show a logo for that one ticker.
  const isPriceMove = notification.type === 'price_move';
  const isDigest = notification.entity_type === 'portfolio';
  const isGain = !notification.entity_id?.includes('loss') &&
    (notification.severity !== 'warning' && notification.severity !== 'critical') &&
    !notification.title.toLowerCase().includes('down');

  let logoTickers: string[] = [];
  if (isPriceMove && isDigest) {
    logoTickers = parseTickersFromMessage(notification.message ?? '');
  } else if (isPriceMove && notification.entity_type === 'stock') {
    const sym = notification.entity_id?.split(':')[0];
    if (sym) logoTickers = [sym];
  }

  const iconEl = isPriceMove && logoTickers.length > 0
    ? <LogoStrip tickers={logoTickers} isGain={isGain} />
    : <GenericIcon type={notification.type} severity={notification.severity} />;

  const inner = (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40 cursor-pointer',
        !notification.is_read && 'bg-primary/[0.04]'
      )}
      onClick={handleClick}
    >
      {iconEl}

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
              {isDigest ? 'View holdings →' : 'View stock →'}
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

  if (stockHref && notification.type !== 'price_move' && notification.type !== 'earnings') {
    return <Link href={stockHref}>{inner}</Link>;
  }

  return inner;
}
