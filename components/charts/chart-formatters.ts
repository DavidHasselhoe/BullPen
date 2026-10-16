import { fmtMonthDay, fmtTradingDate, MARKET_TIME_ZONE } from "@/lib/dates/clock";

// Every series this kit draws is market data stamped from candles, so a
// date-only label is the trading date, read in New York (a daily bar is
// midnight New York, still the previous evening in Chicago), worded in the
// user's language. Times of day go through lib/dates/clock instead.

/** "Oct 13": month, a space, day (the date pill splits on it). */
export const shortDateFmt = { format: (date: Date) => fmtMonthDay(date, MARKET_TIME_ZONE) };

export const weekdayDateFmt = {
  format: (date: Date) => fmtTradingDate(date, { weekday: "short", month: "short", day: "numeric" }),
};

// For ranges spanning a year or more (1Y/5Y/MAX) — "Wed, Jul 22" alone is
// ambiguous once the hovered point could be from any of several years.
export const weekdayDateWithYearFmt = {
  format: (date: Date) => fmtTradingDate(date, { weekday: "short", month: "short", day: "numeric", year: "numeric" }),
};

// `Intl.NumberFormat.prototype.format` is a bound getter — safe to extract.
export const intFmt = new Intl.NumberFormat("en-US").format;
