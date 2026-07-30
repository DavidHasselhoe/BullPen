# Market Calendar redesign

## Problem

`app/tools/calendar/page.tsx` shows earnings/dividends/splits/IPOs as four separate tabs, each rendering a single scrolling list grouped by day. It's generic (identical for every user, logged in or not), dense on busy days (Tuesday of a typical week has 40+ earnings), and requires heavy scrolling to get through a single week of one event type. The user wants it personalized ("actually useful") and restructured so a whole week is scannable without scrolling ("fun and easy to read").

## Non-goals

- **No new colors or illustration/gamification.** DESIGN.md reserves Signal Emerald/Red for gain/loss + the landing accent; this redesign stays inside that system — "fun" comes from layout, hierarchy, and motion, not a new palette.
- **No change to the underlying TwelveData calendar endpoints' data shape** beyond adding `market_cap` and (for dividends/splits/ipo) a `SIGNIFICANT_TICKERS` filter. Caching strategy (24h server-side, per CLAUDE.md's cost table) is unchanged.
- **No per-user calendar data.** Personalization is done client-side by cross-referencing the existing (unfiltered, market-wide) calendar responses against the user's already-fetched holdings/watchlist — no new "my calendar" endpoint.
- **No change to week navigation semantics** — "This week / Next week / +2w / +3w" segmented control stays as-is (already matches BullPen's product-button language, not part of what's broken).

## Architecture

```
app/tools/calendar/page.tsx  (thin shell: header, week selector, composes the pieces below)
        │
        ▼
components/tools/calendar/
  useCalendarWeek.ts   — 4 parallel useQuery calls (earnings/dividends/splits/ipo),
                         normalizes into UnifiedEvent[], builds the day model
  types.ts             — UnifiedEvent, EventType, DayModel
  format.ts            — date/number formatters + getWeekRange (moved from page.tsx as-is)
  YourWeekStrip.tsx     — "your" events for the visible week, chip row
  TypeFilterChips.tsx   — Earnings/Dividends/Splits/IPOs multi-toggle
  CalendarGrid.tsx      — 7-col grid (desktop) / 1-col list (mobile), renders DayCell per day
  DayCell.tsx           — compact per-day cell (mine-first, then top-3 by market cap, +N more)
  EventRows.tsx         — full-detail row renderers per type (today's existing row JSX,
                          extracted so DayDetailDialog can reuse it unchanged)
  DayDetailDialog.tsx   — Dialog (shadcn primitives, same pattern as HealthScoreHistoryModal)
                          showing one day's full list when a cell/pill is clicked
```

`page.tsx` shrinks to: header, week selector, `<YourWeekStrip>`, `<TypeFilterChips>`, `<CalendarGrid>`, `<DayDetailDialog>` (open state lifted to the page). The four per-type `*Tab` components and their standalone list rendering go away — their row JSX is not deleted, it's extracted into `EventRows.tsx` and reused by the dialog.

## Data flow

1. **Fetch.** `useCalendarWeek(from, to)` fires all four calendar queries unconditionally (not gated by an active tab, since the grid needs all types at once). Each keeps its existing `staleTime: 60 * 60 * 1000` and server-side 24h cache — this is a real behavior change (today only the active tab's endpoint is hit), but every one of these routes already caches the date-range response server-side and shared across all users, so the added cost is one cache-fill per date range per day, not per page view.
2. **Normalize.** Each response is mapped into a `UnifiedEvent`:
   ```ts
   type EventType = 'earnings' | 'dividends' | 'splits' | 'ipo';
   interface UnifiedEvent {
     type: EventType;
     symbol: string;
     name?: string;
     date: string;               // earnings/splits/ipo: `date`; dividends: `ex_dividend_date`
     marketCap: number | null;   // from the new API-side enrichment
     raw: EarningsCalendarItem | DividendsCalendarItem | SplitsCalendarItem | IPOCalendarItem;
   }
   ```
3. **Personalize.** `useHoldings()` + `useWatchlist()` (already-existing hooks, both `enabled: isAuthenticated`) build `mySymbols: Set<string>` (holdings ∪ watchlist, uppercased). Empty/unauthenticated just yields an empty set — no special-casing needed downstream.
4. **Group + rank.** For each of the 7 visible dates, partition that day's (type-filtered) events into `mine` (symbol ∈ mySymbols) and `others` (sorted by `marketCap` desc, nulls last). `DayCell` shows all of `mine` first, then fills remaining slots up to 3 total from `others`, then a "+N more" pill for whatever's left (N = day total − shown).
5. **Your Week strip.** Flattens `mine` across the whole visible range (respecting the active type filter), sorted by date, rendered as a horizontally-scrollable chip row, e.g. `AAPL · Earnings · Thu`. Not rendered at all if the set is empty (no empty-state clutter for logged-out/new users) — the grid's per-cell market-cap fallback already covers that case.
6. **Day detail.** Clicking a `DayCell` (or its "+N more" pill) opens `DayDetailDialog` with that date's full (type-filtered) event list, grouped by type, rendered via the extracted `EventRows` components — visually identical to today's list rows, just scoped to one day.

## Backend changes

- **New shared helper** `lib/market-data/calendar-market-cap.ts`:
  ```ts
  export async function attachMarketCap<T extends { symbol: string }>(
    items: T[]
  ): Promise<(T & { market_cap: number | null })[]>
  ```
  One batched `screener_stats` query (`select ticker, market_cap where ticker in (...)`), mapped back onto each item. IPO calendar items will mostly resolve to `null` (pre-listing companies aren't in `screener_stats` yet) — expected, and fine, since IPO weeks are low-volume so the "+N more" overflow problem barely applies there; nulls just sort last.
- **`app/api/calendar/dividends/route.ts`, `.../splits/route.ts`, `.../ipo/route.ts`**: add the same `SIGNIFICANT_TICKERS` filter `earnings/route.ts` already applies, then run the response through `attachMarketCap`. Today these three return TwelveData's full global feed (hundreds of micro-cap/OTC names) — filtering them down is a correctness fix for "readable, not noisy," not just a personalization nice-to-have.
- **`app/api/calendar/earnings/route.ts`**: already filtered to `SIGNIFICANT_TICKERS`; just add the `attachMarketCap` pass.

## Visual design

Per DESIGN.md — no new hues, no gamification:
- Type icons reuse the existing set (`TrendingUp`/`DollarSign`/`Scissors`/`Rocket`) at low-opacity tint on both the compact cell rows and the filter chips.
- Today's grid column gets a persistent subtle highlight (background tint + border), not just a "Today" badge.
- Rows in `mine` get a small Signal-Emerald dot — reusing the existing gain/loss color for "this is yours," not introducing a new meaning for it.
- Cards/cells follow the existing flat-at-rest, `shadow-md` + lift-on-hover vocabulary (`DESIGN.md` §4); day-cell click reuses the existing `Dialog` open/close transition.
- Responsive: `grid-cols-1 sm:grid-cols-7` — one column (today's list-like stacking, just with the new mixed-type compact rows) below `sm`, real 7-column week grid at `sm` and up.
- All motion respects `prefers-reduced-motion` (already global per `PRODUCT.md`/`app/globals.css`).

## Error handling

- Each of the four queries fails/rate-limits independently (unchanged per-route error shapes). `useCalendarWeek` treats a failed type as an empty contribution — the grid still renders using whatever succeeded, rather than blanking the whole page for one bad endpoint.
- `useHoldings()`/`useWatchlist()` failures or empty results just yield an empty `mySymbols` set — no dedicated error UI, the market-cap-fallback path already covers it.
- Empty day (zero events after filtering): quiet placeholder — date header only, muted, no card chrome suggesting something broke.

## Testing / Verification

No test framework in this repo (per CLAUDE.md — one-off `tsx` scripts only, no UI test suite). Verification is manual:
- `npm run lint`
- Browser check via the `run` skill: load `/tools/calendar` signed out (no Your Week strip, cells fall back to top-3-by-market-cap), signed in with holdings/watchlist overlapping this week's events (strip appears, matching cells show the emerald-dot rows first), click a busy day's "+N more" (dialog opens with full list), toggle type filter chips (grid + strip + dialog all narrow consistently), resize to mobile width (grid collapses to single column), verify "This week/Next week/+2w/+3w" still swaps data correctly, verify reduced-motion setting suppresses the added hover/transition motion.
