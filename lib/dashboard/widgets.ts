export interface DashboardWidget {
  id: string;
  label: string;
  requiresAuth?: boolean;
  requiresPro?: boolean;
}

export const DASHBOARD_WIDGETS: DashboardWidget[] = [
  { id: 'recently_viewed',   label: 'Recently viewed' },
  { id: 'daily_brief',       label: 'Daily Brief', requiresPro: true },
  { id: 'why_today',         label: 'Why Today?' },
  { id: 'market_context',    label: 'Market Context' },
  { id: 'earnings_calendar', label: 'Earnings calendar' },
  { id: 'hot_picks',         label: 'Hot Picks' },
  { id: 'crypto_market',     label: 'Crypto & Commodities' },
  { id: 'investing_quote',   label: 'Investing quote' },
];

export const DEFAULT_ORDER: string[] = DASHBOARD_WIDGETS.map((w) => w.id);

export interface MarketContextItem {
  id: string;
  label: string;
}

/**
 * The "Market Context" widget bundles four cards. Unlike the top-level
 * DASHBOARD_WIDGETS, these are visibility-only (no reordering) — Market Hours
 * and Tool Shortcuts share a layout column, and Top Movers/Market News share
 * a holdings-derived data mode, so a free drag order isn't meaningful here.
 */
export const MARKET_CONTEXT_ITEMS: MarketContextItem[] = [
  { id: 'market_hours',    label: 'Market Hours' },
  { id: 'tools_shortcuts', label: 'Tool Shortcuts' },
  { id: 'top_movers',      label: 'Top Movers' },
  { id: 'market_news',     label: 'Market News' },
];

const WIDGETS_BY_ID = new Map(DASHBOARD_WIDGETS.map((w) => [w.id, w]));

export function getWidget(id: string): DashboardWidget | undefined {
  return WIDGETS_BY_ID.get(id);
}

/**
 * Insert widgets that aren't in `known` yet (e.g. a widget added to
 * DASHBOARD_WIDGETS after a user last customized their layout) right after
 * their nearest canonical predecessor that IS present — not blindly at the
 * end. Otherwise a brand-new widget gets buried below everything a user
 * already reordered, including low-priority items like the investing quote,
 * for every account that customized their layout before the widget existed.
 */
export function mergeNewWidgets(known: string[]): string[] {
  const result = [...known];
  const present = new Set(known);
  for (let i = 0; i < DASHBOARD_WIDGETS.length; i++) {
    const id = DASHBOARD_WIDGETS[i].id;
    if (present.has(id)) continue;
    let insertAfterId: string | null = null;
    for (let j = i - 1; j >= 0; j--) {
      if (present.has(DASHBOARD_WIDGETS[j].id)) {
        insertAfterId = DASHBOARD_WIDGETS[j].id;
        break;
      }
    }
    const insertIndex = insertAfterId ? result.indexOf(insertAfterId) + 1 : 0;
    result.splice(insertIndex, 0, id);
    present.add(id);
  }
  return result;
}

/**
 * Apply persisted order/hidden against the canonical widget list:
 *  - drop unknown ids (resilience to renames/removals)
 *  - merge in new widgets the user hasn't seen yet, near their canonical position
 *  - drop hidden ids
 */
export function resolveWidgetOrder(
  storedOrder: string[] | undefined,
  hidden: string[] | undefined
): string[] {
  const order = Array.isArray(storedOrder) && storedOrder.length > 0 ? storedOrder : DEFAULT_ORDER;
  const known = order.filter((id) => WIDGETS_BY_ID.has(id));
  const merged = mergeNewWidgets(known);
  const hiddenSet = new Set(hidden ?? []);
  return merged.filter((id) => !hiddenSet.has(id));
}
