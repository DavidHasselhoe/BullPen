'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ArrowUpRight, ArrowDownRight, BarChart2, Sparkles, Bell, ChevronRight, Coins, CreditCard, GraduationCap, HeartPulse, Landmark, Star, Newspaper, Crown, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { trackEvent } from '@/lib/analytics/track';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { ClampedText } from '@/components/ui/ClampedText';
import type { EarningsTodayParams, NotifMsg, Notification } from '@/lib/notifications/notifications-db';
import { useQuery } from '@tanstack/react-query';
import { useClock } from '@/hooks/use-clock';
import { fmtClockDate } from '@/lib/dates/clock';
import { intlLocale } from '@/lib/i18n/intl-locale';
import { useCalendarPrefs } from '@/hooks/use-calendar-prefs';
import { ECONOMIC_KINDS, economyHref, fmtReleaseTimeForViewer, type EconomicEvent, type EconomicKind } from '@/lib/market-data/economic-kinds';

function formatRelativeTime(dateString: string, language: string): string {
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMin / 60);
  // Calendar days, like groupByRecency, so a row under "Earlier" never says "6d ago".
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(date); day.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - day.getTime()) / 86_400_000);

  // Intl words it per language ("5h ago", "vor 5 Std.", "5 時間前"). Narrow only
  // for English: Norwegian's narrow form is a bare "-5 t".
  const locale = intlLocale(language);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: locale === 'en-US' ? 'narrow' : 'short' });
  if (diffMin < 1) return rtf.format(0, 'second');
  if (diffMin < 60) return rtf.format(-diffMin, 'minute');
  if (diffHr < 24) return rtf.format(-diffHr, 'hour');
  if (diffDays < 7) return rtf.format(-diffDays, 'day');
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

/**
 * Tickers in an earnings-today digest: from params, or for rows written
 * before 2026-10-22 from the title ("BE reports…") or message ("BE, WDC +2 more").
 */
function earningsTickers(n: Notification): string[] {
  if (n.params?.kind === 'earnings_today') return [...n.params.owned, ...n.params.watched];
  const one = leadingTicker(n.title);
  if (one) return [one];
  return (n.message ?? '').replace(/\s\+\d+ more$/, '').split(', ').filter((s) => /^[A-Z][A-Z0-9./-]{0,9}$/.test(s));
}

/** Title and message for an earnings-today digest, in the reader's language. */
function earningsTodayText(p: EarningsTodayParams, t: TFunction<'navigation'>, language: string) {
  const fmt = new Intl.ListFormat(intlLocale(language), { type: 'conjunction' });
  const list = (syms: string[]) => fmt.format(syms.length > 5 ? [...syms.slice(0, 4), t('notifEarningsMore', { n: syms.length - 4 })] : syms);
  const n = p.owned.length + p.watched.length;
  const title = n === 1 ? t('notifEarningsTodayOne', { symbol: p.owned[0] ?? p.watched[0] })
    : !p.watched.length ? t('notifEarningsTodayOwned', { n })
    : !p.owned.length ? t('notifEarningsTodayWatched', { n })
    : t('notifEarningsTodayMixed', { n });
  const message = [
    p.owned.length ? t('notifEarningsYouOwn', { list: n === 1 && p.name ? p.name : list(p.owned) }) : '',
    p.watched.length ? t('notifEarningsOnWatchlist', { list: n === 1 && p.name ? p.name : list(p.watched) }) : '',
  ].filter(Boolean).join(' ');
  return { title, message };
}

/** Words a stored NotifMsg in the reader's language. Lists use the reader's list format, `{ date }` a short date. */
function renderMsg(m: NotifMsg, t: TFunction, list: Intl.ListFormat, date: Intl.DateTimeFormat): string {
  const vars: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(m.vars ?? {})) {
    if (Array.isArray(v)) {
      const parts = v.map((x) => (typeof x === 'string' ? x : renderMsg(x, t, list, date)));
      vars[k] = k === 'sentences' ? parts.join(' ') : list.format(parts);
    } else if (typeof v === 'object') {
      vars[k] = date.format(new Date(`${v.date}T12:00:00Z`));
    } else {
      vars[k] = v;
    }
  }
  return t(m.key, vars);
}

/** Namespaces other than navigation that a message's keys name ("alerts:describePriceAbove"). */
function extraNamespaces(m: NotifMsg | undefined, out = new Set<string>()): Set<string> {
  if (!m) return out;
  if (m.key.includes(':')) out.add(m.key.split(':')[0]);
  for (const v of Object.values(m.vars ?? {})) {
    if (Array.isArray(v)) v.forEach((x) => typeof x !== 'string' && extraNamespaces(x, out));
  }
  return out;
}

/**
 * Title and message in the reader's language. Rows without params (written
 * before 2026-10-22, or by a producer that stores English only) show their
 * stored text, and so does any row while a namespace it needs is loading.
 */
export function useNotificationText(n: Notification): { title: string; message: string } {
  const p = n.params;
  const extra = p?.kind === 'i18n' ? [...extraNamespaces(p.message, extraNamespaces(p.title))].sort() : [];
  const { t, i18n, ready } = useTranslation(['navigation', ...extra]);
  if (p?.kind === 'earnings_today') return earningsTodayText(p, t as TFunction<'navigation'>, i18n.language);
  if (p?.kind !== 'i18n' || !ready) return { title: n.title, message: n.message };
  const locale = intlLocale(i18n.language);
  const list = new Intl.ListFormat(locale, { type: 'conjunction' });
  const date = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  // A short date can end in its own period ("19. okt."), so one closing a
  // sentence read "19. okt..". No key has a real double period.
  const render = (m: NotifMsg) => renderMsg(m, t, list, date).replace(/\.\./g, '.');
  return {
    title: render(p.title),
    message: p.message ? render(p.message) : n.message,
  };
}

/** Choose the icon: company logo(s) for stock moves, themed glyph otherwise. */
function NotificationIcon({ n }: { n: Notification }) {
  const direction = moveDirection(n);

  if (n.type === 'earnings' && n.entity_type === 'portfolio') {
    const tickers = earningsTickers(n);
    if (tickers.length === 1) return <MoveLogo ticker={tickers[0]} direction={null} />;
    if (tickers.length > 1) return <LogoStack tickers={tickers} direction={null} />;
  }

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

function notificationSource(n: Notification, t: TFunction<'navigation'>): { label: string; href: string } | null {
  // ai_insight entity_id carries a "kind:value" prefix so these route
  // before falling into the generic stock/portfolio checks below.
  if (n.type === 'ai_insight' && n.entity_id?.endsWith(':deep_dive')) {
    const sym = n.entity_id.replace(/:deep_dive$/, '');
    return { label: t('notifSourceDeepDive'), href: `/tools/deep-dive/${sym}` };
  }
  if (n.type === 'ai_insight' && n.entity_id?.startsWith('portfolio_builder:')) {
    const id = n.entity_id.replace(/^portfolio_builder:/, '');
    return { label: t('notifSourcePortfolioBuilder'), href: `/tools/portfolio-builder?id=${id}` };
  }
  if (n.type === 'ai_insight' && n.entity_id?.startsWith('risk_analysis:')) {
    const id = n.entity_id.replace(/^risk_analysis:/, '');
    return { label: t('notifSourceRiskAnalysis'), href: `/holdings?riskAnalysisId=${id}` };
  }
  if (n.type === 'weekly_pick' && n.entity_id?.startsWith('weekly_pick:')) {
    const date = n.entity_id.replace(/^weekly_pick:/, '');
    return { label: t('notifSourceWeeklyPick'), href: `/picks/${date}` };
  }
  if (n.type === 'daily_brief') {
    return { label: t('notifSourceDailyBrief'), href: '/dashboard' };
  }
  if (n.type === 'referral') {
    return { label: t('notifSourceProPerks'), href: '/upgrade' };
  }
  if (n.type === 'billing') {
    return { label: t('notifSourceBilling'), href: '/upgrade' };
  }
  // entity_id is "institution:<slug>:<accession>" — the slug is the route.
  if (n.type === 'institution_filing' && n.entity_id?.startsWith('institution:')) {
    const slug = n.entity_id.split(':')[1];
    if (slug) return { label: t('notifSource13f'), href: `/discover/institutions/${slug}` };
  }
  // Pro holdings/watchlist summary, not tied to one member.
  if (n.type === 'politician_trade' && n.entity_id?.startsWith('politician-holdings:')) {
    return { label: t('notifSourceWashington'), href: '/discover/politicians' };
  }
  // entity_id is "politician:<slug>:<newest dc_trade_id>".
  if (n.type === 'politician_trade' && n.entity_id?.startsWith('politician:')) {
    const slug = n.entity_id.split(':')[1];
    if (slug) return { label: t('notifSourceWashington'), href: `/discover/politicians/${slug}` };
  }

  // entity_id is "index-fund:<index>:<detected_on>": what a fund the user holds now owns.
  if (n.type === 'market' && n.entity_id?.startsWith('index-fund:')) {
    const id = n.entity_id.split(':')[1];
    const label = INDEX_PAGE_LABELS[id];
    if (label) return { label, href: `/discover/indexes/${id}` };
  }

  // entity_id is "economic-result:<kind>:<event id>": what a release printed.
  if (n.type === 'market' && n.entity_id?.startsWith('economic-result:')) {
    const kind = n.entity_id.split(':')[1] as EconomicKind;
    return { label: t('notifSourceEconomy'), href: economyHref(kind) ?? '/tools/economy' };
  }

  // entity_type is typed narrower than runtime — the alert cron writes 'user_alert'.
  const et = n.entity_type as string | null;
  // Earnings and ex-dividend digests are stored as 'portfolio' and used to
  // link to My holdings, even for a stock you only watch. One stock goes to
  // its page (ticker at the start of the title, or the whole message on rows
  // written before 2026-10-19); several go to the calendar.
  if ((n.type === 'earnings' || n.type === 'dividend') && et === 'portfolio') {
    const one = leadingTicker(n.title) ?? (/^[A-Z]{1,6}$/.test(n.message?.trim() ?? '') ? n.message.trim() : null);
    return one ? { label: one, href: `/stock/${one}` } : { label: t('notifSourceCalendar'), href: '/tools/calendar' };
  }
  const sym = et === 'stock' && n.entity_id ? n.entity_id.replace(/:.*$/, '') : null;
  if (et === 'portfolio') return { label: t('notifSourceHoldings'), href: '/holdings' };
  if (et === 'user_alert') return { label: t('notifSourcePriceAlerts'), href: '/tools/alerts' };
  if (n.type === 'academy') {
    const course = n.entity_id?.match(/^academy:new_course:(.+)$/)?.[1];
    return { label: t('notifSourceAcademy'), href: course ? `/academy/${course}` : '/academy' };
  }
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
  // 'tools' for the release-time wording shared with the economic calendar.
  const { t, i18n } = useTranslation(['navigation', 'tools']);
  const { title } = useNotificationText(notification);
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
            {title}
            {!notification.is_read && <span className="inline-block ml-1.5 h-1.5 w-1.5 rounded-full bg-primary align-middle" />}
          </p>
          <span className="shrink-0 pt-px text-xs tabular-nums text-muted-foreground">{formatRelativeTime(notification.created_at, i18n.language)}</span>
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
                  <span className="tabular-nums">{fmtReleaseTimeForViewer(e.release_at, t)}</span>
                  {meta.watchUrl && (
                    <a href={meta.watchUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground/85 hover:text-primary">
                      · {t('notifWatchLive')}
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
          {t('notifSourceCalendar')}
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
        onRead={() => {
          trackEvent('notification_clicked', { type: notification.type, was_unread: !notification.is_read, has_link: false });
          if (!notification.is_read) onMarkRead(notification.id);
        }}
      />
    );
  }
  return <StandardNotificationItem notification={notification} onMarkRead={onMarkRead} />;
}

function StandardNotificationItem({ notification, onMarkRead }: NotificationItemProps) {
  const { t, i18n } = useTranslation('navigation');
  const source = notificationSource(notification, t);
  const unread = !notification.is_read;
  const text = useNotificationText(notification);
  const handleClick = () => {
    trackEvent('notification_clicked', { type: notification.type, was_unread: unread, has_link: !!source });
    if (unread) onMarkRead(notification.id);
  };

  // The title is the one interactive element; its ::after stretches over the
  // whole row so the card stays clickable. That leaves the message's Show more
  // free to be a real button (a button inside a link is invalid and navigates).
  const stretch = 'text-left after:absolute after:inset-0 after:content-[""] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring';
  const title = (
    <>
      {unread && <span className="sr-only">{t('notifUnreadPrefix')} </span>}
      {text.title}
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
            {formatRelativeTime(notification.created_at, i18n.language)}
          </span>
        </div>
        {text.message && (
          <ClampedText
            textClassName="text-sm leading-snug text-muted-foreground"
            toggleClassName="relative z-10"
          >
            {text.message}
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
