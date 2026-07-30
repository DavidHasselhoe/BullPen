import type {
  EarningsCalendarItem,
  DividendsCalendarItem,
  SplitsCalendarItem,
  IPOCalendarItem,
} from '@/lib/twelvedata/twelvedata-client';

export type EventType = 'earnings' | 'dividends' | 'splits' | 'ipo';

export type EarningsItem = EarningsCalendarItem & { market_cap: number | null };
export type DividendItem = DividendsCalendarItem & { market_cap: number | null };
export type SplitItem = SplitsCalendarItem & { market_cap: number | null };
export type IPOItem = IPOCalendarItem & { market_cap: number | null };

export interface CalendarResponse<T> {
  success: boolean;
  data?: T[];
  error?: string;
}

export interface UnifiedEvent {
  type: EventType;
  symbol: string;
  name?: string;
  /** The day this event lands on — `date` for earnings/splits/ipo, `ex_dividend_date` for dividends. */
  date: string;
  marketCap: number | null;
  raw: EarningsItem | DividendItem | SplitItem | IPOItem;
}

export interface DayModel {
  date: string;
  /** Full list of this day's events matching the user's holdings/watchlist (type-filtered), unsliced. */
  mine: UnifiedEvent[];
  /** Full list of this day's non-personal events, sorted by market cap desc (nulls last), unsliced. */
  others: UnifiedEvent[];
  /** `[...mine, ...others].slice(0, CELL_LIMIT)` — what the compact grid cell renders. */
  shown: UnifiedEvent[];
  /** `total - shown.length` — drives the "+N more" pill. */
  moreCount: number;
  /** `mine.length + others.length`. */
  total: number;
}
