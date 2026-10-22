// Types for holdings components

import type { UserHolding } from '@/lib/types/database';

export interface HoldingWithPrice extends UserHolding {
  currentPrice?: number;
  /** Price in USD, converted from the listing's currency, for portfolio sums. */
  currentPriceUSD?: number;
  /** Raw quote price in the listing's `trading_currency`. avg_price is stored in
   *  that same currency, so the positions table shows this beside it and the
   *  sell flow uses it to keep the realized-gain math in one currency. */
  currentPriceNative?: number;
  /** Today's move per share in the display currency (for portfolio totals). */
  dayChange?: number;
  /** Today's move per share in the listing's currency, beside currentPriceUSD. */
  dayChangeNative?: number;
  dayChangePercent?: number;
  marketValue?: number;
  unrealizedPL?: number;
  unrealizedPLPercent?: number;
  allocation?: number;
  logoUrl?: string | null;
  sector?: string | null;
  /** True when currentPrice/dayChange came from the last-known-price cache
   *  (no live tick and the REST batch quote missed this symbol), not a fresh
   *  quote this load — render dimmed as "last close" rather than live. */
  isPriceStale?: boolean;
}
