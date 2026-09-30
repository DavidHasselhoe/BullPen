import type { HoldingSale } from '@/lib/types/database';
import type { HoldingWithPrice } from '@/components/holdings/types';

export interface TotalReturn {
  /** Open positions at today's prices minus what they cost. */
  unrealized: number;
  /** Locked in by every sale, including positions since removed. */
  realized: number;
  total: number;
  /** Everything put in: the open positions' cost plus the cost of every share sold. */
  invested: number;
  pct: number;
}

/**
 * The one definition of "total P/L" on My Holdings, shared by the stat card
 * and the performance chart's all-time view so the two cannot disagree (they
 * showed +$5,149 / +17.29% and +$5,134 / +16.6% side by side: the card
 * counted open positions only, the chart added sales and a different base).
 *
 * Display currency. Unrealized comes from the holdings page's own FX-aware
 * figures (cost at the purchase-date rate); sales carry no rate of their own,
 * so they convert at today's, the same way the chart converts its line.
 */
export function totalReturn(
  holdings: Pick<HoldingWithPrice, 'marketValue' | 'unrealizedPL'>[],
  sales: Pick<HoldingSale, 'realized_pl' | 'avg_cost_basis' | 'quantity_sold'>[] | undefined,
  fxRate: number,
): TotalReturn {
  let unrealized = 0;
  let openCost = 0;
  for (const h of holdings) {
    if (h.unrealizedPL === undefined || h.marketValue === undefined) continue;
    unrealized += h.unrealizedPL;
    openCost += h.marketValue - h.unrealizedPL;
  }
  let realized = 0;
  let soldCost = 0;
  for (const s of sales ?? []) {
    realized += s.realized_pl * fxRate;
    soldCost += s.avg_cost_basis * s.quantity_sold * fxRate;
  }
  const total = unrealized + realized;
  const invested = openCost + soldCost;
  return { unrealized, realized, total, invested, pct: invested > 0 ? (total / invested) * 100 : 0 };
}
