'use client';

import Link from 'next/link';
import { ArrowUpRight, ArrowDownRight, BarChart2, Sparkles, Bell } from 'lucide-react';
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

/** Extract ticker symbols from a digest message like "AVGO +12.6%, MU -7.7%". */
function parseTickersFromMessage(message: string): string[] {
  const matches = message.match(/\b([A-Z]{1,5})(?:\/[A-Z]{1,5})?\s[+-]/g) ?? [];
  return matches.map((m) => m.trim().split(/\s/)[0] ?? '').filter(Boolean).slice(0, 5);
}

/** Leading ticker from a title like "MU moved +9.9% today" or "AAPL hit $150". */
function leadingTicker(title: string): string | null {
  return title.match(/^([A-Z]{1,6}(?:\/[A-Z]{1,6})?)\b/)?.[1] ?? null;
}

type Direction = 'up' | 'down' | null;

/**
 * Direction of a price-move notification, read from the REAL data — never from
 * severity (severity reflects magnitude, so a big +9.9% gain is "warning" too).
 */
function moveDirection(n: Notification): Direction {
  if (n.type !== 'price_move') return null;
  if (n.entity_id?.includes('digest_gain')) return 'up';
  if (n.entity_id?.includes('digest_loss')) return 'down';
  const m = n.title.match(/(-?\d+(?:\.\d+)?)\s*%/);  // "+9.9%" → up, "-7.7%" → down
  if (m) return parseFloat(m[1]) < 0 ? 'down' : 'up';
  return null;
}

/** Small colored corner badge showing move direction. Parent must be `relative`. */
function DirectionBadge({ direction }: { direction: Direction }) {
  if (!direction) return null;
  const up = direction === 'up';
  return (
    <span className={cn(
      'absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-background',
      up ? 'bg-emerald-500' : 'bg-red-500',
    )}>
      {up
        ? <ArrowUpRight className="h-2.5 w-2.5 text-white" />
        : <ArrowDownRight className="h-2.5 w-2.5 text-white" />}
    </span>
  );
}

/** Single company logo + direction badge — the icon for a one-stock notification. */
function MoveLogo({ ticker, direction }: { ticker: string; direction: Direction }) {
  return (
    <div className="relative mt-0.5 shrink-0">
      <CompanyLogo ticker={ticker} name={ticker} logoUrl={null} size={34} className="rounded-lg" />
      <DirectionBadge direction={direction} />
    </div>
  );
}

/** Overlapping logo stack for a multi-stock digest, with one direction badge. */
function LogoStack({ tickers, direction }: { tickers: string[]; direction: Direction }) {
  const shown = tickers.slice(0, 4);
  const SIZE = 30;
  const OVERLAP = 10;
  const width = SIZE + (shown.length - 1) * (SIZE - OVERLAP);
  return (
    <div className="relative mt-0.5 shrink-0" style={{ width, height: SIZE }}>
      {shown.map((ticker, i) => (
        <div
          key={ticker}
          className="absolute overflow-hidden rounded-full ring-2 ring-background"
          style={{ left: i * (SIZE - OVERLAP), zIndex: shown.length - i, width: SIZE, height: SIZE }}
        >
          <CompanyLogo ticker={ticker} name={ticker} logoUrl={null} size={SIZE} />
        </div>
      ))}
      <DirectionBadge direction={direction} />
    </div>
  );
}

/** Icon for non-stock notifications (earnings, AI) or a neutral fallback. */
function GenericIcon({ type }: { type: Notification['type'] }) {
  const base = 'h-4 w-4 shrink-0';
  if (type === 'earnings') return (
    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
      <BarChart2 className={cn(base, 'text-blue-400')} />
    </div>
  );
  if (type === 'ai_insight') return (
    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
      <Sparkles className={cn(base, 'text-violet-400')} />
    </div>
  );
  return (
    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
      <Bell className={cn(base, 'text-muted-foreground/60')} />
    </div>
  );
}

/** Choose the icon: company logo(s) for stock moves, themed glyph otherwise. */
function NotificationIcon({ n }: { n: Notification }) {
  const direction = moveDirection(n);

  if (n.type === 'price_move' && n.entity_type === 'portfolio') {
    const tickers = parseTickersFromMessage(n.message ?? '');
    return tickers.length > 0
      ? <LogoStack tickers={tickers} direction={direction} />
      : <GenericIcon type={n.type} />;
  }

  if (n.type === 'price_move') {
    // Single stock — symbol from entity_id (price moves) or the title (user alerts).
    const sym = n.entity_type === 'stock' ? n.entity_id?.split(':')[0] : leadingTicker(n.title);
    return sym ? <MoveLogo ticker={sym} direction={direction} /> : <GenericIcon type={n.type} />;
  }

  return <GenericIcon type={n.type} />;
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

  const isDigest = notification.entity_type === 'portfolio';
  const iconEl = <NotificationIcon n={notification} />;

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
