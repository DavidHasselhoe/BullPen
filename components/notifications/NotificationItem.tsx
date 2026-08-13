'use client';

import Link from 'next/link';
import { ArrowUpRight, ArrowDownRight, BarChart2, Sparkles, Bell, ChevronRight, Coins, GraduationCap, HeartPulse, Star, Newspaper } from 'lucide-react';
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
      'absolute -bottom-1 -right-1 z-10 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-background',
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
  if (type === 'dividend') return (
    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
      <Coins className={cn(base, 'text-emerald-400')} />
    </div>
  );
  if (type === 'academy') return (
    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
      <GraduationCap className={cn(base, 'text-amber-400')} />
    </div>
  );
  if (type === 'health_score') return (
    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-500/10">
      <HeartPulse className={cn(base, 'text-rose-400')} />
    </div>
  );
  if (type === 'weekly_pick') return (
    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
      <Star className={cn(base, 'text-amber-400')} />
    </div>
  );
  if (type === 'daily_brief') return (
    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
      <Newspaper className={cn(base, 'text-blue-400')} />
    </div>
  );
  return (
    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
      <Bell className={cn(base, 'text-muted-foreground/80')} />
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

/**
 * Where a notification "came from" — the place clicking the card navigates to,
 * plus a short label shown on the card.
 *
 * Note: price moves on a single held/watched stock aren't tagged with their
 * origin (holdings vs a specific watchlist) in the DB, so those link to the
 * stock itself — unambiguously what the notification is about.
 */
function notificationSource(n: Notification): { label: string; href: string } | null {
  // ai_insight entity_id carries a "kind:value" prefix so these route
  // before falling into the generic stock/portfolio checks below.
  if (n.type === 'ai_insight' && n.entity_id?.endsWith(':deep_dive')) {
    const sym = n.entity_id.replace(/:deep_dive$/, '');
    return { label: 'Deep Dive', href: `/tools/deep-dive/${sym}` };
  }
  if (n.type === 'ai_insight' && n.entity_id?.startsWith('portfolio_builder:')) {
    const id = n.entity_id.replace(/^portfolio_builder:/, '');
    return { label: 'Portfolio Builder', href: `/tools/portfolio-builder?id=${id}` };
  }
  if (n.type === 'weekly_pick' && n.entity_id?.startsWith('weekly_pick:')) {
    const date = n.entity_id.replace(/^weekly_pick:/, '');
    return { label: "Bull's Pick", href: `/picks/${date}` };
  }
  if (n.type === 'daily_brief') {
    return { label: 'Daily Brief', href: '/dashboard' };
  }

  // entity_type is typed narrower than runtime — the alert cron writes 'user_alert'.
  const et = n.entity_type as string | null;
  const sym = et === 'stock' && n.entity_id ? n.entity_id.replace(/:.*$/, '') : null;
  if (et === 'portfolio') return { label: 'My holdings', href: '/holdings' };
  if (et === 'user_alert') return { label: 'Price alerts', href: '/tools/alerts' };
  if (n.type === 'academy') return { label: 'Academy', href: '/academy' };
  if (sym) return { label: sym, href: `/stock/${sym}` };
  return null;
}

interface NotificationItemProps {
  notification: Notification;
  onMarkRead: (notificationId: string) => void;
}

export function NotificationItem({ notification, onMarkRead }: NotificationItemProps) {
  const source = notificationSource(notification);
  const handleClick = () => {
    if (!notification.is_read) onMarkRead(notification.id);
  };

  const body = (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40',
        source && 'cursor-pointer',
        !notification.is_read && 'bg-primary/[0.04]'
      )}
    >
      <NotificationIcon n={notification} />

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
          <span className="text-[10px] text-muted-foreground/85 shrink-0 tabular-nums">
            {formatRelativeTime(notification.created_at)}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground/85 leading-snug line-clamp-2">
          {notification.message}
        </p>
        {/* Source label — where this notification came from / where the card leads. */}
        {source && (
          <span className="inline-flex items-center gap-0.5 pt-0.5 text-[10px] font-medium text-muted-foreground/80">
            {source.label}
            <ChevronRight className="h-2.5 w-2.5" />
          </span>
        )}
      </div>
    </div>
  );

  // The whole card navigates to its source; clicking also marks it read.
  if (source) {
    return <Link href={source.href} onClick={handleClick} className="block">{body}</Link>;
  }
  return <div onClick={handleClick}>{body}</div>;
}
