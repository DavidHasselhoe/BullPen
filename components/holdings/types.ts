// Types for holdings components

import type { UserHolding } from '@/lib/types/database';

export interface HoldingWithPrice extends UserHolding {
  currentPrice?: number;
  dayChange?: number;
  dayChangePercent?: number;
  marketValue?: number;
  unrealizedPL?: number;
  unrealizedPLPercent?: number;
  allocation?: number;
  logoUrl?: string | null;
  sector?: string | null;
}
