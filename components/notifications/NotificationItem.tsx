'use client';

import Link from 'next/link';
import { ArrowUpRight, ArrowDownRight, BarChart2, Sparkles, Bell, ChevronRight, Coins, CreditCard, GraduationCap, HeartPulse, Landmark, Star, Newspaper, Crown, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { ClampedText } from '@/components/ui/ClampedText';
import type { Notification } from '@/lib/notifications/notifications-db';
import { useQuery } from '@tanstack/react-query';
import { useClock } from '@/hooks/use-clock';
import { fmtClockDate } from '@/lib/dates/clock';
import { useCalendarPrefs } from '@/hooks/use-calendar-prefs';
import { ECONOMIC_KINDS, fmtReleaseTimeWithZone, type EconomicEvent } from '@/lib/market-data/economic-kinds';

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMin / 60);
  // Calendar days, like groupByRecency, so a row under "Earlier" never says "6d ago".
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(date); day.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - day.getTime()) / 86_400_000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return fmtClockDate(date, { month: 'short', day: 'numeric' });
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
      <CompanyLogo ticker={ticker} name={ticker} logoUrl={null} size={36} className="rounded-lg" />
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

/**
 * Glyph for everything that isn't a single stock move. Neutral on purpose:
 * emerald and red mean up and down (DESIGN.md One Signal Rule), and the old
 * per-type tiles spent six more colours, including emerald on dividends and
 * the same rose for a health score going up or down.
 */
const TYPE_ICONS: Partial<Record<Notification['type'], LucideIcon>> = {
  earnings: BarChart2,
  ai_insight: Sparkles,
  dividend: Coins,
  academy: GraduationCap,
  health_score: HeartPulse,
  weekly_pick: Star,
  institution_filing: Landmark,
  politician_trade: Landmark,
  daily_brief: Newspaper,
  referral: Crown,
  billing: CreditCard,
};

function GenericIcon({ type }: { type: Notification['type'] }) {
  const Icon = TYPE_ICONS[type] ?? Bell;
  return (
    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
      <Icon className="h-4 w-4 shrink-0 text-foreground/75" aria-hidden />
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
const INDEX_PAGE_LABELS: Record<string, string> = { sp500: 'S&P 500', nasdaq100: 'Nasdaq-100', dow30: 'Dow 30' };

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
  if (n.type === 'ai_insight' && n.entity_id?.startsWith('risk_analysis:')) {
    const id = n.entity_id.replace(/^risk_analysis:/, '');
    return { label: 'Risk Analysis', href: `/holdings?riskAnalysisId=${id}` };
  }
  if (n.type === 'weekly_pick' && n.entity_id?.startsWith('weekly_pick:')) {
    const date = n.entity_id.replace(/^weekly_pick:/, '');
    return { label: "Bull's Pick", href: `/picks/${date}` };
  }
  if (n.type === 'daily_brief') {
    return { label: 'Daily Brief', href: '/dashboard' };
  }
  if (n.type === 'referral') {
    return { label: 'Your Pro perks', href: '/upgrade' };
  }
  if (n.type === 'billing') {
    return { label: 'Billing', href: '/upgrade' };
  }
  // entity_id is "institution:<slug>:<accession>" — the slug is the route.
  if (n.type === 'institution_filing' && n.entity_id?.startsWith('institution:')) {
    const slug = n.entity_id.split(':')[1];
    if (slug) return { label: '13F holdings', href: `/discover/institutions/${slug}` };
  }
  // Pro holdings/watchlist summary, not tied to one member.
  if (n.type === 'politician_trade' && n.entity_id?.startsWith('politician-holdings:')) {
    return { label: 'Washington Trading', href: '/discover/politicians' };
  }
  // entity_id is "politician:<slug>:<newest dc_trade_id>".
  if (n.type === 'politician_trade' && n.entity_id?.startsWith('politician:')) {
    const slug = n.entity_id.split(':')[1];
    if (slug) return { label: 'Washington Trading', href: `/discover/politicians/${slug}` };
  }

  // entity_id is "index-fund:<index>:<detected_on>": what a fund the user holds now owns.
  if (n.type === 'market' && n.entity_id?.startsWith('index-fund:')) {
    const id = n.entity_id.split(':')[1];
    const label = INDEX_PAGE_LABELS[id];
    if (label) return { label, href: `/discover/indexes/${id}` };
  }

  // entity_type is typed narrower than runtime — the alert cron writes 'user_alert'.
  const et = n.entity_type as string | null;
  // Earnings and ex-dividend digests are stored as 'portfolio' and used to
  // link to My holdings, even for a stock you only watch. One stock goes to
  // its page (ticker at the start of the title, or the whole message on rows
  // written before 2026-10-19); several go to the calendar.
  if ((n.type === 'earnings' || n.type === 'dividend') && et === 'portfolio') {
    const one = leadingTicker(n.title) ?? (/^[A-Z]{1,6}$/.test(n.message?.trim() ?? '') ? n.message.trim() : null);
    return one ? { label: one, href: `/stock/${one}` } : { label: 'Market Calendar', href: '/tools/calendar' };
  }
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

/**
 * Morning-of economic releases. Not a single Link like the other cards: each
 * release links out to where it is published, so the card holds several
 * links instead of being one. Times re-render in the reader's own zone; the
 * stored message (ET times) shows until the day's events load.
 */
function EconomicNotification({ notification, date, onRead }: { notification: Notification; date: string; onRead: () => void }) {
  useClock(); // re-render when the time zone or 12/24h clock changes
  // Same picks the cron used to decide this user gets notified.
  const { prefs } = useCalendarPrefs();
  const { data: events } = useQuery<EconomicEvent[]>({
    // Own key: the calendar caches the whole response under calendar-economic, this caches the array.
    queryKey: ['notification-economic', date],
    queryFn: async () => {
      const res = await fetch(`/api/calendar/economic?from=${date}&to=${date}`);
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error ?? 'Failed');
      return body.data;
    },
    staleTime: 60 * 60 * 1000,
  });

  return (
    <div
      onClick={onRead}
      className={cn('flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40', !notification.is_read && 'bg-primary/[0.04]')}
    >
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Landmark className="h-4 w-4 shrink-0 text-foreground/75" aria-hidden />
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <p className={cn('text-sm leading-snug', !notification.is_read ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground')}>
            {notification.title}
            {!notification.is_read && <span className="inline-block ml-1.5 h-1.5 w-1.5 rounded-full bg-primary align-middle" />}
          </p>
          <span className="shrink-0 pt-px text-xs tabular-nums text-muted-foreground">{formatRelativeTime(notification.created_at)}</span>
        </div>
        {events && events.some((e) => prefs.economicKinds.includes(e.kind)) ? (
          <ul className="space-y-0.5">
            {events.filter((e) => prefs.economicKinds.includes(e.kind)).map((e) => {
              const meta = ECONOMIC_KINDS[e.kind];
              return (
                <li key={e.id} className="flex flex-wrap items-center gap-x-1.5 text-sm leading-snug text-muted-foreground">
                  <a href={meta.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-medium text-foreground/85 hover:text-primary">
                    {meta.name}
                    <ArrowUpRight className="h-3 w-3" aria-hidden />
                  </a>
                  <span className="tabular-nums">{fmtReleaseTimeWithZone(e.release_at)}</span>
                  {meta.watchUrl && (
                    <a href={meta.watchUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground/85 hover:text-primary">
                      · Watch live
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm leading-snug text-muted-foreground">{notification.message}</p>
        )}
        <Link
          href={`/tools/calendar?view=week&date=${date}`}
          className="inline-flex items-center gap-0.5 pt-0.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Market Calendar
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

export function NotificationItem({ notification, onMarkRead }: NotificationItemProps) {
  // "economic:<date>" from notifyEconomicEventsToday.
  if (notification.entity_id?.startsWith('economic:')) {
    return (
      <EconomicNotification
        notification={notification}
        date={notification.entity_id.slice('economic:'.length)}
        onRead={() => { if (!notification.is_read) onMarkRead(notification.id); }}
      />
    );
  }
  return <StandardNotificationItem notification={notification} onMarkRead={onMarkRead} />;
}

function StandardNotificationItem({ notification, onMarkRead }: NotificationItemProps) {
  const source = notificationSource(notification);
  const unread = !notification.is_read;
  const handleClick = () => {
    if (unread) onMarkRead(notification.id);
  };

  // The title is the one interactive element; its ::after stretches over the
  // whole row so the card stays clickable. That leaves the message's Show more
  // free to be a real button (a button inside a link is invalid and navigates).
  const stretch = 'text-left after:absolute after:inset-0 after:content-[""] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring';
  const title = (
    <>
      {unread && <span className="sr-only">Unread: </span>}
      {notification.title}
    </>
  );

  return (
    <div
      className={cn(
        'relative flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40',
        unread && 'bg-primary/[0.04]'
      )}
    >
      <NotificationIcon n={notification} />

      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-start justify-between gap-3">
          <p className={cn('text-sm leading-snug', unread ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground')}>
            {source ? (
              <Link href={source.href} onClick={handleClick} className={stretch}>{title}</Link>
            ) : (
              <button type="button" onClick={handleClick} className={stretch}>{title}</button>
            )}
            {unread && <span aria-hidden className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle" />}
          </p>
          <span className="shrink-0 pt-px text-xs tabular-nums text-muted-foreground">
            {formatRelativeTime(notification.created_at)}
          </span>
        </div>
        {notification.message && (
          <ClampedText
            textClassName="text-sm leading-snug text-muted-foreground"
            toggleClassName="relative z-10"
          >
            {notification.message}
          </ClampedText>
        )}
        {source && (
          <span className="inline-flex items-center gap-0.5 pt-0.5 text-xs font-medium text-muted-foreground">
            {source.label}
            <ChevronRight className="h-3 w-3" />
          </span>
        )}
      </div>
    </div>
  );
}
