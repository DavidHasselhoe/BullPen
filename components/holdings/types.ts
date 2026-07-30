// Types for holdings components

import type { UserHolding } from '@/lib/types/database';

export interface HoldingWithPrice extends UserHolding {
  currentPrice?: number;
  /** Raw USD price, unconverted — avg_price is always stored in USD, so the
   *  sell flow needs this instead of the display-currency `currentPrice`
   *  to keep the realized-gain math in one currency. */
  currentPriceUSD?: number;
  dayChange?: number;
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
