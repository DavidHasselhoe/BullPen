/**
 * Derives buy/sell chart markers from a user's holding + sale history for one
 * ticker. Shared by both chart surfaces (the main stock-page chart and the
 * fullscreen advanced chart) so the "what counts as a trade" rule lives in
 * exactly one place.
 *
 * Buy data is limited to a single point: `date_purchased`/`avg_price` on
 * `user_holdings`, set once when a position first opens and never updated on
 * later top-ups (there is no per-purchase log, only a running average). Sells
 * are full fidelity — one `holding_sales` row per sale, each with its own
 * date/price/quantity.
 */

export interface TransactionMarkerInput {
  date_purchased: string | null;
  avg_price: number | null;
  quantity: number | null;
}

export interface SaleMarkerInput {
  sale_date: string;
  sale_price: number;
  quantity_sold: number;
}

export interface TransactionMarker {
  /** Unix seconds, midday UTC — matches how earnings markers stamp a date-only value. */
  tsSeconds: number;
  price: number;
  kind: 'buy' | 'sell';
  quantity: number | null;
  /** ISO date (YYYY-MM-DD), for display. */
  dateStr: string;
}

function dateToTsSeconds(isoDate: string): number {
  return Math.floor(new Date(`${isoDate}T12:00:00Z`).getTime() / 1000);
}

export function buildTransactionMarkers(
  holding: TransactionMarkerInput | undefined,
  sales: SaleMarkerInput[]
): TransactionMarker[] {
  const markers: TransactionMarker[] = [];
  if (holding?.date_purchased && holding.avg_price != null) {
    markers.push({
      tsSeconds: dateToTsSeconds(holding.date_purchased),
      price: holding.avg_price,
      kind: 'buy',
      quantity: holding.quantity,
      dateStr: holding.date_purchased,
    });
  }
  for (const s of sales) {
    markers.push({
      tsSeconds: dateToTsSeconds(s.sale_date),
      price: s.sale_price,
      kind: 'sell',
      quantity: s.quantity_sold,
      dateStr: s.sale_date,
    });
  }
  return markers.sort((a, b) => a.tsSeconds - b.tsSeconds);
}
