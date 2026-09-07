/** Shared formatter for institutional-holdings USD figures — used by both the
 *  holdings table and the allocation chart, so a $B/$M threshold change only
 *  has to happen in one place. */
export function fmtUsd(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}
