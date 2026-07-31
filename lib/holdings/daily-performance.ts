/**
 * Per-calendar-day portfolio performance, reconstructed from daily closes.
 *
 * Pure arithmetic — no fetching, no React, no Supabase. Everything in and out
 * of this module is USD; callers scale into a display currency with a single
 * FX rate the way PortfolioPerformanceChart does, so percentages (a ratio of
 * two USD figures) never move when the user changes their display currency.
 *
 * ## Why this is reconstructed rather than read from a table
 *
 * Nothing stores a user's portfolio value over time, and `user_holdings` keeps
 * no buy ledger — `quantity` is overwritten on every purchase and
 * `date_purchased` only ever records the *first* buy. Share counts can
 * therefore only be projected backwards from today, backing out `holding_sales`
 * (the same technique PortfolioPerformanceChart uses for its P/L line).
 *
 * ## The rule that keeps a day honest
 *
 * For day D, **both sides of the diff use the same share count**: the shares
 * held as of the close of the previous trading day. Diffing "value today vs.
 * value yesterday" with each day's own share count would print a phantom crash
 * on every day the user sold and a phantom spike on every day they bought —
 * cash moving in and out is not performance. Pinning the count to the start of
 * the day makes each cell measure what the *positions* did.
 *
 * Residual inaccuracy from the missing buy ledger: a re-buy rescales earlier
 * days' currency amounts, because today's larger position gets projected back.
 * Percentages are unaffected in aggregate, since the scale factor appears in
 * both the numerator and the denominator.
 */

// ─── Inputs ───────────────────────────────────────────────────────────────────

export interface HoldingInput {
  symbol: string;
  company_name: string | null;
  quantity: number | null;
  /** YYYY-MM-DD. Falls back to created_at when unset (e.g. SnapTrade-synced rows). */
  date_purchased: string | null;
  /** ISO timestamp. */
  created_at: string;
}

export interface SaleInput {
  symbol: string;
  /** YYYY-MM-DD. */
  sale_date: string;
  quantity_sold: number;
}

/** Daily closes for one symbol, ascending by date. */
export interface SymbolCloses {
  /** YYYY-MM-DD. */
  date: string;
  close: number;
}

// ─── Outputs ──────────────────────────────────────────────────────────────────

export interface Contributor {
  symbol: string;
  name: string | null;
  /** shares × (close_D − close_prev), USD. */
  pnlUsd: number;
  /** The symbol's own price move that day, percent. */
  pricePct: number;
  shares: number;
}

export interface DailyPerformanceDay {
  /** YYYY-MM-DD. */
  date: string;
  /** Percent change of the portfolio that day. */
  pct: number;
  /** USD change of the portfolio that day. */
  pnlUsd: number;
  /** Portfolio value at the previous close — the basis `pct` is measured against. */
  prevValueUsd: number;
  /** Biggest movers that day, by absolute USD contribution. */
  contributors: Contributor[];
}

export interface PeriodSummary {
  /** Compounded return over the period, percent. */
  pct: number;
  /** Summed USD change over the period. */
  pnlUsd: number;
  upDays: number;
  downDays: number;
  best: DailyPerformanceDay | null;
  worst: DailyPerformanceDay | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * The first day a holding counts, as YYYY-MM-DD.
 *
 * Dates stay strings throughout this module and are compared lexicographically,
 * which is exact for the YYYY-MM-DD format and sidesteps timezone parsing
 * entirely — no `new Date()` means no chance of a UTC/ET boundary shifting a
 * position's start across a day.
 */
function holdingStartDate(h: HoldingInput): string {
  return h.date_purchased ?? h.created_at.slice(0, 10);
}

/**
 * Shares held at the close of `date`: today's quantity, plus every sale that
 * hadn't happened yet. A sale dated exactly `date` already happened by that
 * close, so it is not added back.
 */
function sharesHeldAt(currentQty: number, sales: SaleInput[], date: string): number {
  let shares = currentQty;
  for (const sale of sales) {
    if (sale.sale_date > date) shares += sale.quantity_sold;
  }
  return shares;
}

// ─── Core ─────────────────────────────────────────────────────────────────────

export interface ComputeOptions {
  /** Only emit days within [from, to] inclusive. YYYY-MM-DD. */
  from: string;
  to: string;
  /** Max movers returned per day. */
  maxContributors?: number;
}

/**
 * Build the per-day series. `closes` must cover at least one trading day before
 * `from`, otherwise the first day of the window has no previous close to diff
 * against and is dropped.
 *
 * Days where no holding qualifies are omitted entirely rather than emitted as
 * 0.00% — "the market was closed" and "you broke even" are different facts and
 * the UI renders them differently.
 */
export function computeDailyPerformance(
  holdings: HoldingInput[],
  sales: SaleInput[],
  closes: Record<string, SymbolCloses[]>,
  options: ComputeOptions
): DailyPerformanceDay[] {
  const { from, to, maxContributors = 5 } = options;

  const salesBySymbol = new Map<string, SaleInput[]>();
  for (const sale of sales) {
    const list = salesBySymbol.get(sale.symbol);
    if (list) list.push(sale);
    else salesBySymbol.set(sale.symbol, [sale]);
  }

  // Only symbols we have both a holding row and price history for.
  const tracked = holdings
    .map((h) => ({
      holding: h,
      start: holdingStartDate(h),
      qty: h.quantity ?? 0,
      sales: salesBySymbol.get(h.symbol) ?? [],
      byDate: new Map((closes[h.symbol] ?? []).map((c) => [c.date, c.close])),
    }))
    .filter((t) => t.byDate.size > 0);

  if (tracked.length === 0) return [];

  // Union of every date any tracked symbol has a bar for, ascending. A day only
  // exists on the calendar if *something* the user holds traded that day, which
  // is what makes weekends light up for a crypto holder and stay dark for an
  // equities-only one — no hardcoded weekday check.
  const allDates = new Set<string>();
  for (const t of tracked) for (const d of t.byDate.keys()) allDates.add(d);
  const dates = [...allDates].sort();

  // Forward-fill state, carried across the walk. A symbol with no bar on D
  // (halted, or a stock inside a portfolio whose crypto trades that weekend)
  // keeps its previous close, so it contributes exactly 0 to the day instead of
  // dropping out of prevValue and distorting the denominator.
  const ff = new Map<string, number>();
  const days: DailyPerformanceDay[] = [];

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const prevDate = i > 0 ? dates[i - 1] : null;

    // Snapshot the forward-filled closes as they stood at the previous date
    // before advancing them to `date`.
    const prevCloses = new Map(ff);

    for (const t of tracked) {
      const close = t.byDate.get(date);
      if (close !== undefined) ff.set(t.holding.symbol, close);
    }

    if (prevDate === null || date < from || date > to) continue;

    let prevValue = 0;
    let currValue = 0;
    const contributors: Contributor[] = [];

    for (const t of tracked) {
      const symbol = t.holding.symbol;
      const prevClose = prevCloses.get(symbol);
      const currClose = ff.get(symbol);

      // Both sides or neither: a symbol that only has a close on one end of the
      // diff would manufacture its entire market value as a day's move.
      if (prevClose === undefined || currClose === undefined) continue;
      // The position has to have existed at the previous close.
      if (prevDate < t.start) continue;

      const shares = sharesHeldAt(t.qty, t.sales, prevDate);
      if (shares <= 0) continue;

      prevValue += shares * prevClose;
      currValue += shares * currClose;

      const pnl = shares * (currClose - prevClose);
      if (pnl !== 0) {
        contributors.push({
          symbol,
          name: t.holding.company_name,
          pnlUsd: pnl,
          pricePct: prevClose !== 0 ? ((currClose - prevClose) / prevClose) * 100 : 0,
          shares,
        });
      }
    }

    if (prevValue <= 0) continue;

    contributors.sort((a, b) => Math.abs(b.pnlUsd) - Math.abs(a.pnlUsd));

    days.push({
      date,
      pct: ((currValue - prevValue) / prevValue) * 100,
      pnlUsd: currValue - prevValue,
      prevValueUsd: prevValue,
      contributors: contributors.slice(0, maxContributors),
    });
  }

  return days;
}

/**
 * Roll a set of days up into one figure. Works for a week, a month, or any
 * other slice — the calendar uses it for both the week-total column and the
 * month header.
 *
 * The percent compounds rather than sums. Compounding is the correct
 * time-weighted return and, unlike summing daily percentages, it stays right
 * regardless of how the portfolio's size changed across the period — which
 * matters here precisely because the missing buy ledger means size changes are
 * the one thing we can't see.
 */
export function summarize(days: DailyPerformanceDay[]): PeriodSummary {
  let growth = 1;
  let pnlUsd = 0;
  let upDays = 0;
  let downDays = 0;
  let best: DailyPerformanceDay | null = null;
  let worst: DailyPerformanceDay | null = null;

  for (const day of days) {
    growth *= 1 + day.pct / 100;
    pnlUsd += day.pnlUsd;
    if (day.pct > 0) upDays++;
    else if (day.pct < 0) downDays++;
    if (!best || day.pct > best.pct) best = day;
    if (!worst || day.pct < worst.pct) worst = day;
  }

  return {
    pct: days.length > 0 ? (growth - 1) * 100 : 0,
    pnlUsd,
    upDays,
    downDays,
    best,
    worst,
  };
}
