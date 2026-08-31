import type { RawTransaction } from './types';

/** Trims JS floating-point noise (e.g. 5.7384000000000005) for user-facing
 *  flag text — the underlying math stays full-precision, this is display
 *  only. */
function formatQty(n: number): string {
  return Number(n.toFixed(6)).toString();
}

export interface ExistingHolding {
  id: string;
  symbol: string;
  quantity: number;
  source: 'manual' | 'snaptrade';
}

export type ReplayOp =
  | { action: 'BUY'; securityKey: string; symbol: string; quantity: number; price: number; date: string; sourceLine: number }
  | { action: 'SELL'; securityKey: string; symbol: string; quantity: number; price: number; date: string; sourceLine: number };

export type ReplayFlagReason =
  | 'oversell'
  | 'sell_without_position'
  | 'synced_conflict';

export interface ReplayFlag {
  securityKey: string;
  sourceLine: number;
  reason: ReplayFlagReason;
  detail: string;
}

export interface SecurityProjection {
  securityKey: string;
  symbol: string;
  finalQuantity: number;
  weightedAvgCost: number;
  realizedPl: number;
}

export interface ReplayPlan {
  ops: ReplayOp[];
  flags: ReplayFlag[];
  projections: SecurityProjection[];
  blocked: boolean;
}

/**
 * Pure planner: transactions + the user's existing holdings in, an ordered
 * op list + blocking flags out. No DB access, no side effects — every
 * blocking condition (oversell, a sell with no prior buy, a sell against a
 * SnapTrade-synced holding that `sellHolding` would refuse) is caught here,
 * before any write happens, rather than discovered mid-replay at
 * transaction 31 of 54.
 */
export function planReplay(
  transactions: RawTransaction[],
  bySecurityKey: Map<string, { symbol: string; name: string | null }>,
  existingHoldings: Map<string, ExistingHolding> // keyed by resolved symbol
): ReplayPlan {
  // Nordnet-style exports are newest-first; detect file order from the
  // transactions themselves and replay chronologically regardless. A
  // same-day buy-then-sell replayed in the wrong direction produces a
  // phantom oversell, so the tiebreak preserves original file order for
  // same-date transactions when the file is descending.
  const firstDate = transactions[0]?.date;
  const lastDate = transactions[transactions.length - 1]?.date;
  const fileIsDescending = !!firstDate && !!lastDate && firstDate > lastDate;

  const sorted = [...transactions].sort((a, b) => {
    if (a.date !== b.date) return (a.date ?? '').localeCompare(b.date ?? '');
    const tiebreakA = fileIsDescending ? -a.sourceLine : a.sourceLine;
    const tiebreakB = fileIsDescending ? -b.sourceLine : b.sourceLine;
    return tiebreakA - tiebreakB;
  });

  const ops: ReplayOp[] = [];
  const flags: ReplayFlag[] = [];
  const running = new Map<string, { quantity: number; costBasis: number }>(); // costBasis = weighted avg

  // Seed running state from existing holdings, keyed by securityKey via the
  // resolved symbol lookup table the caller provides.
  for (const [securityKey, info] of bySecurityKey) {
    const existing = existingHoldings.get(info.symbol);
    if (existing) {
      running.set(securityKey, { quantity: existing.quantity, costBasis: 0 });
    }
  }

  for (const t of sorted) {
    const info = bySecurityKey.get(t.securityKey);
    if (!info) continue; // unresolved security — caller excludes these before planning
    // apply-mapping.ts never pushes a transaction with a null date/quantity/
    // price into `transactions` (those become rowErrors instead), but the
    // type itself doesn't encode that guarantee — narrow explicitly rather
    // than asserting with `!`.
    if (t.date == null || t.quantity == null || t.price == null) continue;
    const date = t.date;
    const quantity = t.quantity;
    const price = t.price;
    const symbol = info.symbol;
    const existing = existingHoldings.get(symbol);

    if (t.action === 'SELL' && existing && existing.source !== 'manual') {
      flags.push({
        securityKey: t.securityKey,
        sourceLine: t.sourceLine,
        reason: 'synced_conflict',
        detail: `${symbol} is synced from ${existing.source}; selling it here isn't supported.`,
      });
      continue;
    }

    const state = running.get(t.securityKey) ?? { quantity: 0, costBasis: 0 };

    if (t.action === 'BUY') {
      const newQuantity = state.quantity + quantity;
      const newCostBasis =
        state.quantity > 0
          ? (state.quantity * state.costBasis + quantity * price) / newQuantity
          : price;
      running.set(t.securityKey, { quantity: newQuantity, costBasis: newCostBasis });
      ops.push({ action: 'BUY', securityKey: t.securityKey, symbol, quantity, price, date, sourceLine: t.sourceLine });
      continue;
    }

    // SELL
    const EPSILON = 1e-6;
    if (state.quantity <= EPSILON) {
      flags.push({
        securityKey: t.securityKey,
        sourceLine: t.sourceLine,
        reason: 'sell_without_position',
        detail: `Sells ${formatQty(quantity)} shares of ${symbol}, but this file (plus your existing holdings) shows none bought yet.`,
      });
      continue;
    }
    if (quantity > state.quantity + EPSILON) {
      flags.push({
        securityKey: t.securityKey,
        sourceLine: t.sourceLine,
        reason: 'oversell',
        detail: `Sells ${formatQty(quantity)} shares of ${symbol}, but only ${formatQty(state.quantity)} were bought by this date.`,
      });
      continue;
    }
    running.set(t.securityKey, { quantity: state.quantity - quantity, costBasis: state.costBasis });
    ops.push({ action: 'SELL', securityKey: t.securityKey, symbol, quantity, price, date, sourceLine: t.sourceLine });
  }

  // Realized P/L for the dry-run projection — recomputed forward for
  // clarity rather than threaded through the loop above.
  const projectionState = new Map<string, { quantity: number; costBasis: number; realizedPl: number }>();
  for (const op of ops) {
    const s = projectionState.get(op.securityKey) ?? { quantity: 0, costBasis: 0, realizedPl: 0 };
    if (op.action === 'BUY') {
      const newQuantity = s.quantity + op.quantity;
      const newCostBasis = s.quantity > 0 ? (s.quantity * s.costBasis + op.quantity * op.price) / newQuantity : op.price;
      projectionState.set(op.securityKey, { quantity: newQuantity, costBasis: newCostBasis, realizedPl: s.realizedPl });
    } else {
      const realized = (op.price - s.costBasis) * op.quantity;
      projectionState.set(op.securityKey, { quantity: s.quantity - op.quantity, costBasis: s.costBasis, realizedPl: s.realizedPl + realized });
    }
  }

  const projections: SecurityProjection[] = Array.from(projectionState.entries()).map(([securityKey, s]) => ({
    securityKey,
    symbol: bySecurityKey.get(securityKey)?.symbol ?? '?',
    finalQuantity: s.quantity,
    weightedAvgCost: s.costBasis,
    realizedPl: s.realizedPl,
  }));

  return { ops, flags, projections, blocked: flags.length > 0 };
}
