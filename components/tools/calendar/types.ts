import type {
  EarningsCalendarItem,
  DividendsCalendarItem,
  SplitsCalendarItem,
  IPOCalendarItem,
} from '@/lib/twelvedata/twelvedata-client';

export type EventType = 'earnings' | 'dividends' | 'splits' | 'ipo';

/** Server-attached enrichment, identical across all four event types. */
export interface CalendarMetaFields {
  market_cap: number | null;
  /**
   * Direct Supabase storage URL when the bucket has an object for this ticker,
   * null otherwise. Null is meaningful: CompanyLogo falls back to the
   * self-healing /api/logo proxy, which populates the bucket for next time.
   */
  logo_url: string | null;
}

export type EarningsItem = EarningsCalendarItem & CalendarMetaFields;
export type DividendItem = DividendsCalendarItem & CalendarMetaFields;
export type SplitItem = SplitsCalendarItem & CalendarMetaFields;
export type IPOItem = IPOCalendarItem & CalendarMetaFields;

export interface CalendarResponse<T> {
  success: boolean;
  data?: T[];
  error?: string;
  /** True total per date before the server's per-day cap, so "+N more" is honest. */
  day_totals?: Record<string, number>;
  /** True while some days in the range are still being filled in. */
  partial?: boolean;
  missing_dates?: string[];
}

export interface UnifiedEvent {
  type: EventType;
  symbol: string;
  name?: string;
  /** The day this event lands on — `date` for earnings/splits/ipo, `ex_dividend_date` for dividends. */
  date: string;
  marketCap: number | null;
  logoUrl: string | null;
  raw: EarningsItem | DividendItem | SplitItem | IPOItem;
}

export interface DayModel {
  date: string;
  /** This day's events matching the user's holdings/watchlist (type-filtered), unsliced. */
  mine: UnifiedEvent[];
  /** This day's other events, ranked by market cap desc (nulls last), unsliced. */
  others: UnifiedEvent[];
  /** `[...mine, ...others].slice(0, cellLimit)` — what a compact grid cell renders. */
  shown: UnifiedEvent[];
  /** Events beyond `shown`, including any the server capped away. Drives "+N more". */
  moreCount: number;
  /** True total for the day, server-capped rows included. */
  total: number;
  /** Per-type counts for the whole day, so non-earnings types stay discoverable
   *  even when earnings dominates the ranked list. */
  typeCounts: Record<EventType, number>;
}
