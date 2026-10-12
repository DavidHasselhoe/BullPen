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
