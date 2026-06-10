export interface DashboardWidget {
  id: string;
  label: string;
  requiresAuth?: boolean;
  requiresPro?: boolean;
}

export const DASHBOARD_WIDGETS: DashboardWidget[] = [
  { id: 'recently_viewed',   label: 'Recently viewed' },
  { id: 'daily_brief',       label: 'Daily Brief', requiresPro: true },
  { id: 'market_context',    label: 'Market Context' },
  { id: 'earnings_calendar', label: 'Earnings calendar' },
  { id: 'hot_picks',         label: 'Hot Picks' },
  { id: 'crypto_market',     label: 'Crypto & Commodities' },
  { id: 'investing_quote',   label: 'Investing quote' },
];

export const DEFAULT_ORDER: string[] = DASHBOARD_WIDGETS.map((w) => w.id);

const WIDGETS_BY_ID = new Map(DASHBOARD_WIDGETS.map((w) => [w.id, w]));

export function getWidget(id: string): DashboardWidget | undefined {
  return WIDGETS_BY_ID.get(id);
}

/**
 * Apply persisted order/hidden against the canonical widget list:
 *  - drop unknown ids (resilience to renames/removals)
 *  - append new widgets the user hasn't seen yet (to the bottom)
 *  - drop hidden ids
 */
export function resolveWidgetOrder(
  storedOrder: string[] | undefined,
  hidden: string[] | undefined
): string[] {
  const order = Array.isArray(storedOrder) && storedOrder.length > 0 ? storedOrder : DEFAULT_ORDER;
  const known = order.filter((id) => WIDGETS_BY_ID.has(id));
  for (const w of DASHBOARD_WIDGETS) {
    if (!known.includes(w.id)) known.push(w.id);
  }
  const hiddenSet = new Set(hidden ?? []);
  return known.filter((id) => !hiddenSet.has(id));
}
