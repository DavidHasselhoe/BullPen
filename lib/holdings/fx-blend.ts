/**
 * A holding's purchase_fx_rate is what its whole cost basis converts to the
 * user's home currency at, so it must move with avg_price: the cost-weighted
 * average of every lot's rate. It used to keep the first lot's rate forever,
 * which priced 21 NVDA shares at the Oct 2024 USD/NOK rate (10.97) although
 * 11 were bought at 9.67, and showed -15.5% where the broker showed -8.3%.
 *
 * `addCost` is the lot's quantity x price in the trading currency; pass it
 * negative to take a lot back out (undoing an import).
 */
export function blendFxRate(cost: number, fx: number | null, addCost: number, addFx: number | null): number | null {
  if (fx == null) return addCost > 0 ? addFx : fx;
  if (addFx == null) return fx;
  const total = cost + addCost;
  if (total <= 0) return fx;
  const blended = (cost * fx + addCost * addFx) / total;
  return Number.isFinite(blended) && blended > 0 ? blended : fx;
}
