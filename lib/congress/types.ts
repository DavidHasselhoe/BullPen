/**
 * Shared congressional-disclosure shapes.
 *
 * Lives in lib/ rather than being exported from a route so client components
 * can import the type without pulling a server module into the bundle.
 */

export interface CongressTradeRow {
  id: string;
  symbol: string | null;
  assetDescription: string;
  assetType: string | null;
  /** 'Buy' | 'Sell' | 'Exchange' as filed. */
  tradeType: string;
  /** The filed bracket verbatim, e.g. '$500,001 - $1,000,000'. */
  amountRange: string;
  amountLow: number | null;
  amountHigh: number | null;
  transactionDate: string;
  disclosureDate: string | null;
  daysToDisclose: number | null;
  sector: string | null;
}

/** The STOCK Act filing deadline. Past this, a disclosure was filed late. */
export const STOCK_ACT_DEADLINE_DAYS = 45;

export function isFiledLate(daysToDisclose: number | null): boolean {
  return (daysToDisclose ?? 0) > STOCK_ACT_DEADLINE_DAYS;
}

/**
 * Render a filed amount bracket compactly: '$500K - $1M'.
 *
 * The bracket stays a bracket. Both ends are always shown and never averaged
 * into one figure — a filing discloses a range, so a midpoint is a number
 * nobody filed. See feedback-never-ship-synthetic-numbers.
 *
 * The numeric bounds are preferred, but the vendor drops `amount_high` on some
 * rows while still stating it in the range string (31 of the first 200 stored
 * trades, e.g. '$1,000,001 - $5,000,000' with a null high). The filed string
 * is authoritative, so it is parsed as a fallback rather than letting a row
 * render raw and un-compacted beside its formatted neighbours.
 */
export function formatAmountRange(
  low: number | null,
  high: number | null,
  raw: string,
): string {
  const parsed = low == null || high == null ? parseRange(raw) : null;
  const lo = low ?? parsed?.low ?? null;
  const hi = high ?? parsed?.high ?? null;

  if (lo == null && hi == null) return raw;
  if (hi == null) return `${compactAmount(lo!)}+`;
  if (lo == null) return `up to ${compactAmount(hi)}`;
  return `${compactAmount(lo)} - ${compactAmount(hi)}`;
}

/** Pull both ends out of a filed bracket string like '$1,000,001 - $5,000,000'. */
function parseRange(raw: string): { low: number | null; high: number | null } | null {
  const nums = raw.match(/\$\s*([\d,]+)/g);
  if (!nums?.length) return null;
  const toNum = (s: string) => Number(s.replace(/[^\d]/g, ''));
  return {
    low: toNum(nums[0]),
    high: nums.length > 1 ? toNum(nums[1]) : null,
  };
}

/**
 * Brackets are filed at .001 boundaries ($15,001, $500,001). Rounding to the
 * nearest thousand is what makes '$500,001' read as '$500K' rather than
 * '$500.001K', and it never crosses into the next bracket.
 */
export function compactAmount(n: number): string {
  const rounded = Math.round(n / 1000) * 1000;
  if (rounded >= 1_000_000) {
    const m = rounded / 1_000_000;
    return `$${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  if (rounded >= 1000) return `$${Math.round(rounded / 1000)}K`;
  return `$${rounded.toLocaleString('en-US')}`;
}

export type TradeDirection = 'buy' | 'sell' | 'other';

/**
 * Collapse the filed trade_type onto a direction.
 *
 * The vendor uses FOUR words for two directions, and mixes them within a
 * single member: measured 2026-09-23, Pelosi's 100 stored trades are 40 'Buy',
 * 16 'Purchase', 33 'Sale', 10 'Unknown', 1 'Exchange'; Tuberville's are 58
 * 'Sell', 37 'Sale', 5 'Buy'. Matching only 'buy'/'sell' made a Sells filter
 * read 0 for a member with 33 disclosed sales.
 *
 * The verbatim trade_type stays stored — that is what was filed. This is a
 * presentation-layer reading of it, so a new vendor spelling changes one
 * function rather than a column and a backfill.
 */
export function tradeDirection(tradeType: string): TradeDirection {
  const t = tradeType.trim().toLowerCase();
  if (t.startsWith('buy') || t.startsWith('purchase')) return 'buy';
  if (t.startsWith('sell') || t.startsWith('sale')) return 'sell';
  return 'other';
}
