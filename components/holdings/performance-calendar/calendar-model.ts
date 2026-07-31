/**
 * View-model for the daily performance calendar: turning a sparse list of
 * priced days into a fixed month grid, and mapping a percentage onto the
 * colour ramp. Pure — no React, no data fetching.
 */

import { monthWeeks, todayET } from '@/lib/dates/calendar-format';
import {
  formatCurrency,
  getCurrencySymbol,
  type CurrencyCode,
} from '@/lib/currency/currency-conversion';
import type { DailyPerformanceDay } from '@/lib/holdings/daily-performance';

export type CellState =
  /** Padding for an adjacent month — renders as empty space. */
  | 'pad'
  /** In this month but hasn't happened yet. */
  | 'future'
  /** In the past, but nothing the user held traded (weekend, holiday, or the
   *  position didn't exist yet). Distinct from a 0.00% day. */
  | 'closed'
  | 'data';

export interface DayCellModel {
  /** YYYY-MM-DD, or null for a pad cell. */
  date: string | null;
  /** Day of month, or null for a pad cell. */
  dayOfMonth: number | null;
  state: CellState;
  isToday: boolean;
  data: DailyPerformanceDay | null;
}

/**
 * Lay a month out as Monday-first calendar weeks and attach each day's data.
 *
 * Every cell in the month gets a slot whether or not it has data, so the grid
 * keeps its shape from the 1st onward instead of growing as the month fills in.
 */
export function buildMonthGrid(
  monthKey: string,
  days: DailyPerformanceDay[]
): DayCellModel[][] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const today = todayET();

  return monthWeeks(monthKey).map((week) =>
    week.map((date): DayCellModel => {
      if (date === null) {
        return { date: null, dayOfMonth: null, state: 'pad', isToday: false, data: null };
      }
      const data = byDate.get(date) ?? null;
      const state: CellState = data ? 'data' : date > today ? 'future' : 'closed';
      return {
        date,
        dayOfMonth: Number(date.slice(8, 10)),
        state,
        isToday: date === today,
        data,
      };
    })
  );
}

/**
 * True if any Saturday or Sunday in the month grid has real portfolio data.
 *
 * Weekend cells already render as "closed" rather than a fake 0.00% for an
 * all-equities portfolio — nothing there was ever wrong. But an empty column
 * that can never fill in for that user is still dead weight in a grid meant
 * to show a month's shape at a glance. A portfolio holding crypto genuinely
 * trades weekends, so the columns aren't dropped unconditionally; they're
 * dropped only when the data itself says nothing is there to show. Monday-first
 * ordering (see monthWeeks) puts Saturday at index 5 and Sunday at index 6.
 */
export function monthHasWeekendData(weeks: DayCellModel[][]): boolean {
  return weeks.some((week) => week[5]?.state === 'data' || week[6]?.state === 'data');
}

// ─── Colour ramp ──────────────────────────────────────────────────────────────

/**
 * Magnitude bands for the diverging tint, in absolute percent.
 *
 * Below 0.25% reads as flat and gets no tint at all — "the portfolio barely
 * moved" is information, and tinting it would make an ordinary quiet month look
 * uniformly busy.
 *
 * The upper bands run to 5% rather than 3% because a concentrated portfolio
 * (say two volatile tech names) otherwise pins half its days to the top band
 * and the month renders as a flat wall of colour with no shape to read. Fixed
 * bands rather than per-month normalisation: a month's cells should mean the
 * same thing as last month's, and normalising would paint a quiet month's
 * +0.3% day as darkly as a violent month's +13% one.
 */
const BANDS = [0.25, 1, 2.5, 5] as const;

/**
 * Ascending tint ramps, written out as whole literal class names.
 *
 * These MUST stay literal. Tailwind scans source text for complete utility
 * strings, so building one as `'bg-gain' + '/25'` means `bg-gain/25` never
 * appears in any file and the utility is never generated — the cell silently
 * renders with no background at all.
 */
const GAIN_TINTS = ['bg-gain/10', 'bg-gain/20', 'bg-gain/30', 'bg-gain/45'] as const;
const LOSS_TINTS = ['bg-loss/10', 'bg-loss/20', 'bg-loss/30', 'bg-loss/45'] as const;

function bandFor(pct: number): number {
  const abs = Math.abs(pct);
  if (abs < BANDS[0]) return -1; // flat
  if (abs < BANDS[1]) return 0;
  if (abs < BANDS[2]) return 1;
  if (abs < BANDS[3]) return 2;
  return 3;
}

/**
 * Background class for a day's magnitude.
 *
 * Built on the `--gain`/`--loss` tokens rather than raw emerald/red, which is
 * what DESIGN.md's One Signal Rule asks for. Tints are safe on both sides of
 * the ramp because they sit behind text rather than carrying it.
 */
export function tintClass(pct: number): string {
  const band = bandFor(pct);
  if (band < 0) return 'bg-muted/30';
  return pct >= 0 ? GAIN_TINTS[band] : LOSS_TINTS[band];
}

/**
 * Text colour for a signed figure.
 *
 * Deliberately NOT `--gain`/`--loss`: those don't flip by colour scheme, and
 * globals.css documents that emerald-400 measures 1.92:1 against white. The
 * `--picks-*` pair does flip and was already validated for contrast and
 * colour-vision-deficiency separation in both modes, so it's reused here rather
 * than minting a third pair.
 */
export function textClass(pct: number): string {
  if (bandFor(pct) < 0) return 'text-muted-foreground';
  return pct >= 0 ? 'text-[var(--cal-up)]' : 'text-[var(--cal-down)]';
}

/**
 * Text colours for a figure sitting *inside* a tinted cell.
 *
 * Coloured numerals on a same-hue fill fight each other: measured in-browser,
 * emerald text on a 45%-emerald tint came out at 2.97:1 and the muted currency
 * line at 2.46:1, both under WCAG AA. On the strong bands the fill is already
 * unmistakably green or red, so the numerals hand off to a neutral that has
 * real contrast in both themes and let the cell's own colour carry direction —
 * the sign is still printed either way, so nothing depends on perceiving hue.
 */
export function cellTextClass(pct: number): { primary: string; secondary: string } {
  const band = bandFor(pct);
  if (band < 0) {
    return { primary: 'text-muted-foreground', secondary: 'text-muted-foreground/70' };
  }
  // The secondary line is a shaded foreground rather than --muted-foreground on
  // every tinted cell: measured, muted grey over a pale light-mode tint lands at
  // 3.84:1, and at 12px that's normal text needing 4.5:1.
  if (band >= 2) {
    return { primary: 'text-foreground', secondary: 'text-foreground/70' };
  }
  return {
    primary: pct >= 0 ? 'text-[var(--cal-up)]' : 'text-[var(--cal-down)]',
    secondary: 'text-foreground/70',
  };
}

/**
 * Direction colour by sign alone, for figures that aren't percentages.
 *
 * `textClass` bins by magnitude against percent-scaled thresholds, so feeding it
 * a currency amount would call a $0.20 move "flat" and a $5 move significant.
 * Amounts get coloured by sign only.
 */
export function signClass(value: number): string {
  if (value === 0) return 'text-muted-foreground';
  return value > 0 ? 'text-[var(--cal-up)]' : 'text-[var(--cal-down)]';
}

// ─── Formatting ───────────────────────────────────────────────────────────────

/**
 * Signed currency, e.g. `+$412` / `-$588`.
 *
 * `formatCurrency` has no notion of a sign for positive values, but the calendar
 * needs one everywhere: PRODUCT.md forbids conveying direction by colour alone,
 * so the sign is what makes a cell readable without perceiving hue.
 */
export function fmtSignedCurrency(
  value: number,
  currency: CurrencyCode,
  opts: { round?: boolean } = {}
): string {
  const round = opts.round ?? true;
  const magnitude = formatCurrency(Math.abs(value), currency, { round });
  return `${value < 0 ? '-' : '+'}${magnitude}`;
}

/** Signed percent to a fixed 2dp, e.g. `+0.84%`. */
export function fmtSignedPercent(pct: number): string {
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
}

/**
 * Signed percent rounded to whole units, e.g. `+13%` / `-8%` / `0%`.
 *
 * Seven columns at 375px leave about 34px of text width per cell — four
 * monospace characters. `-8.17%` needs six and simply truncates, which loses
 * the one number the cell exists to show. Phones get the rounded figure; the
 * exact value is one tap away in the day popover, and `sm` up shows it inline.
 * Anything under half a percent reads as `0%`, matching the untinted cell.
 */
export function fmtShortPercent(pct: number): string {
  if (Math.abs(pct) < 0.5) return '0%';
  return `${pct > 0 ? '+' : '-'}${Math.round(Math.abs(pct))}%`;
}

/**
 * Signed currency compacted to fit a calendar cell, e.g. `+$412` / `-kr12.1K`.
 *
 * A day cell is roughly ten monospace characters wide, and the full ISO
 * formatting (`-NOK 12,149`) overruns that on any three-letter currency — it
 * truncated to `-NOK 12,…` in practice, which is worse than useless. The symbol
 * plus compact notation keeps the magnitude readable at a glance; the exact
 * figure is one click away in the day popover.
 */
export function fmtCompactSignedCurrency(value: number, currency: CurrencyCode): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '+';
  const magnitude =
    abs >= 1000
      ? new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(abs)
      : String(Math.round(abs));
  return `${sign}${getCurrencySymbol(currency)}${magnitude}`;
}

/**
 * Screen-reader phrasing for a day, e.g.
 * "Tuesday, July 7. Down 1.20 percent, minus $588."
 *
 * Spelled out rather than read as raw glyphs, since "−1.20%" is announced
 * inconsistently across screen readers.
 */
export function dayAriaLabel(
  fullDate: string,
  pct: number,
  amount: number,
  currency: CurrencyCode
): string {
  const direction = pct > 0 ? 'Up' : pct < 0 ? 'Down' : 'Flat';
  const money = formatCurrency(Math.abs(amount), currency, { round: true });
  const signWord = amount < 0 ? 'minus' : 'plus';
  return `${fullDate}. ${direction} ${Math.abs(pct).toFixed(2)} percent, ${signWord} ${money}.`;
}
