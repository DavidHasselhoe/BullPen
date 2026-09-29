export interface DashboardWidget {
  id: string;
  label: string;
}

/**
 * The reorderable, hideable sections of Home, below the fixed greeting and
 * portfolio. Everything here is about the person looking at it; market-wide
 * modules live on Discover. Ids that were removed (market_context, hot_picks,
 * crypto_market, ...) are dropped from stored layouts by resolveWidgetOrder.
 *
 * `pick_up` was `recently_viewed`, which led the old default order: saving
 * Settings stored that order for accounts that never reordered anything, and
 * keeping the id would have put this section above the Brief for all of them.
 */
export const DASHBOARD_WIDGETS: DashboardWidget[] = [
  { id: 'daily_brief',     label: 'Daily Brief' },
  { id: 'coming_up',       label: 'Coming up for your stocks' },
  { id: 'your_news',       label: 'News about your stocks' },
  { id: 'pick_up',         label: 'Pick up where you left off' },
];

export const DEFAULT_ORDER: string[] = DASHBOARD_WIDGETS.map((w) => w.id);

const WIDGETS_BY_ID = new Map(DASHBOARD_WIDGETS.map((w) => [w.id, w]));

export function getWidget(id: string): DashboardWidget | undefined {
  return WIDGETS_BY_ID.get(id);
}

/**
 * Insert widgets that aren't in `known` yet (e.g. a widget added to
 * DASHBOARD_WIDGETS after a user last customized their layout) right after
 * their nearest canonical predecessor that IS present — not blindly at the
 * end, where a brand-new widget would be buried below everything a user
 * already reordered.
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
