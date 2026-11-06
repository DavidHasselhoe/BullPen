// Where a notification links to. Server-safe (no React, no i18n runtime) so the
// push sender and the card share one answer.
import { economyHref, type EconomicKind } from '@/lib/market-data/economic-kinds';
import type { Notification } from '@/lib/notifications/notifications-db';

/** Leading ticker from a title like "MU moved +9.9% today" or "AAPL hit $150". */
export function leadingTicker(title: string): string | null {
  return title.match(/^([A-Z]{1,6}(?:\/[A-Z]{1,6})?)\b/)?.[1] ?? null;
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

export function notificationSource(n: Notification, t: (key: string) => string): { label: string; href: string } | null {
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
  // entity_id is "saved-screen:<preset id>:<date>"; the screener reopens that screen.
  if (n.type === 'saved_screen' && n.entity_id?.startsWith('saved-screen:')) {
    return { label: t('notifSourceScreener'), href: `/tools/screener?screen=${n.entity_id.split(':')[1]}` };
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
  // Pro payday / locked-in notes (lib/dividends/payday-notifications.ts) open the dividend hub.
  if (n.type === 'dividend' && n.entity_id?.startsWith('portfolio:dividend_income')) {
    return { label: t('notifSourceHoldings'), href: '/holdings#dividends' };
  }
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

/** The in-app path a notification opens, or null when it has no destination. */
export function notificationHref(
  n: Pick<Notification, 'type' | 'entity_type' | 'entity_id' | 'title' | 'message'>,
): string | null {
  return notificationSource(n as Notification, (k) => k)?.href ?? null;
}
