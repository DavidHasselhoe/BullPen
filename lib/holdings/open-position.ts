/**
 * Whether a user_holdings row is a position the user still has.
 *
 * Selling everything keeps the row at quantity 0 so sale history, undo and the
 * performance chart keep working, which means every "what do I hold" question
 * has to skip those rows. A null quantity is different: a tracked position
 * with no share count, and it counts as held.
 */
export function isOpenPosition(h: { quantity: number | null }): boolean {
  return h.quantity == null || h.quantity > 1e-9;
}

/** The same rule as a PostgREST filter: `.from('user_holdings').select(...).or(OPEN_POSITION_FILTER)`. */
export const OPEN_POSITION_FILTER = 'quantity.is.null,quantity.gt.0.000000001';
