# Market Calendar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Market Calendar's four scrolling per-type tabs with a single personalized week grid — your holdings/watchlist events highlighted first, market-cap-ranked names filling the rest, full detail on click.

**Architecture:** A new `components/tools/calendar/` module owns all calendar-specific logic (types, formatting, data-fetching, day-grouping, and five presentational components); `app/tools/calendar/page.tsx` shrinks to a thin composition shell. Four backend routes gain a shared `market_cap` enrichment step so "notable" ranking is real, not alphabetical.

**Tech Stack:** Next.js App Router, React 19, TanStack Query, Tailwind CSS 4, shadcn/ui (`Dialog`, `Card`, `Skeleton`), Supabase (`screener_stats` read), existing TwelveData calendar client functions (unchanged).

## Global Constraints

- No test framework in this repo — one-off `tsx` scripts (`npx tsx scripts/<name>.ts`) for pure logic, manual browser verification (via the `run` skill) for anything React/UI. `npm run lint` is the primary code-quality gate; TypeScript build errors are intentionally suppressed (CLAUDE.md).
- No new colors, illustration, or gamification — DESIGN.md reserves Signal Emerald/Red for gain/loss + the landing accent. "Fun" comes from layout/hierarchy/motion only.
- All new motion must respect `prefers-reduced-motion` (already global, PRODUCT.md).
- Every price/percentage/financial figure renders in tabular Geist Mono (`font-mono tabular-nums`) per DESIGN.md's Tabular Numerals Rule.
- Gains/losses (and "this is yours" signaling) are never color-alone — pair with an icon/dot/label (PRODUCT.md accessibility requirement).
- Before treating the redesign as ship-ready, run `/impeccable polish app/tools/calendar/page.tsx` per CLAUDE.md's pre-ship gate for UI/UX-heavy work.

**Spec:** `docs/superpowers/specs/2026-07-30-market-calendar-redesign-design.md`

**One correction found during planning (flagging since it deviates from the spec's literal wording):** the spec says to filter dividends/splits/**ipo** calendar responses to `SIGNIFICANT_TICKERS` (S&P 500 + Nasdaq 100), mirroring what `earnings/route.ts` already does. That's wrong for IPOs specifically — `SIGNIFICANT_TICKERS` is index membership, and a company IPO-ing this week has by definition never been in an index yet. Filtering IPOs by it would filter out every IPO, every week. Task 1 below filters **dividends and splits only**; the IPO route gets market-cap enrichment (which will mostly resolve to `null`, same as the spec already expects) but no ticker-universe filter.

---

## File Structure

```
lib/market-data/calendar-market-cap.ts        [new]  attachMarketCap() — shared market_cap enrichment
app/api/calendar/earnings/route.ts            [edit] add attachMarketCap
app/api/calendar/dividends/route.ts           [edit] add SIGNIFICANT_TICKERS filter + attachMarketCap
app/api/calendar/splits/route.ts              [edit] add SIGNIFICANT_TICKERS filter + attachMarketCap
app/api/calendar/ipo/route.ts                 [edit] add attachMarketCap only (see correction above)

components/tools/calendar/types.ts            [new]  EventType, UnifiedEvent, DayModel, item types
components/tools/calendar/format.ts           [new]  date/number formatters (moved from page.tsx + weekDatesBetween)
components/tools/calendar/day-model.ts        [new]  buildDayModel() — pure grouping/ranking, no React/query deps
components/tools/calendar/useCalendarWeek.ts  [new]  the 4 parallel useQuery calls + UnifiedEvent normalization
components/tools/calendar/EventRows.tsx       [new]  CompactEventRow (grid cell) + DetailEventRow (dialog)
components/tools/calendar/DayCell.tsx         [new]  one grid cell
components/tools/calendar/CalendarGrid.tsx    [new]  responsive 7-col/1-col grid container
components/tools/calendar/YourWeekStrip.tsx   [new]  personalized chip row above the grid
components/tools/calendar/TypeFilterChips.tsx [new]  Earnings/Dividends/Splits/IPOs multi-toggle
components/tools/calendar/DayDetailDialog.tsx [new]  full-day list, opened by clicking a cell

app/tools/calendar/page.tsx                   [rewrite] thin shell composing everything above

scripts/test-calendar-market-cap.ts           [new]  verifies attachMarketCap against real screener_stats data
scripts/test-calendar-day-model.ts            [new]  verifies buildDayModel's grouping/ranking/filter logic
package.json                                  [edit] register both scripts under "test-calendar-market-cap" / "test-calendar-day-model"
```

The four existing per-type tab components (`EarningsTab`, `DividendsTab`, `SplitsTab`, `IPOTab`) and their helpers (`DayHeader`, `EmptyState`, `LoadingRows`, `TimeTag`) are deleted as part of the page rewrite (Task 10) — their row-rendering JSX isn't lost, it's carried into `EventRows.tsx` (Task 4) first.

---

### Task 1: Backend — market cap enrichment + universe filtering

**Files:**
- Create: `lib/market-data/calendar-market-cap.ts`
- Modify: `app/api/calendar/earnings/route.ts`
- Modify: `app/api/calendar/dividends/route.ts`
- Modify: `app/api/calendar/splits/route.ts`
- Modify: `app/api/calendar/ipo/route.ts`
- Test: `scripts/test-calendar-market-cap.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `attachMarketCap<T extends { symbol: string }>(items: T[]): Promise<(T & { market_cap: number | null })[]>` — every later task that touches calendar API responses assumes `market_cap: number | null` is present on each item.

- [ ] **Step 1: Write the verification script (will fail — function doesn't exist yet)**

Create `scripts/test-calendar-market-cap.ts`:

```ts
// Verifies attachMarketCap: known S&P 500 tickers get a real market_cap,
// an unknown ticker gets null, and an empty input short-circuits to [].
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { attachMarketCap } from '../lib/market-data/calendar-market-cap';

async function main() {
  const empty = await attachMarketCap([]);
  if (empty.length !== 0) throw new Error(`Expected [] for empty input, got ${JSON.stringify(empty)}`);

  const input = [
    { symbol: 'AAPL' },
    { symbol: 'MSFT' },
    { symbol: 'ZZZNOTREAL' },
  ];
  const result = await attachMarketCap(input);
  console.log(result);

  const aapl = result.find((r) => r.symbol === 'AAPL');
  const msft = result.find((r) => r.symbol === 'MSFT');
  const unknown = result.find((r) => r.symbol === 'ZZZNOTREAL');

  if (!aapl || typeof aapl.market_cap !== 'number' || aapl.market_cap <= 0) {
    throw new Error(`Expected AAPL to have a positive market_cap, got ${aapl?.market_cap}`);
  }
  if (!msft || typeof msft.market_cap !== 'number' || msft.market_cap <= 0) {
    throw new Error(`Expected MSFT to have a positive market_cap, got ${msft?.market_cap}`);
  }
  if (!unknown || unknown.market_cap !== null) {
    throw new Error(`Expected unknown ticker to resolve to market_cap null, got ${unknown?.market_cap}`);
  }

  console.log('PASS: attachMarketCap resolves known tickers and nulls out unknown/empty input');
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx tsx scripts/test-calendar-market-cap.ts`
Expected: FAIL — `Cannot find module '../lib/market-data/calendar-market-cap'` (or equivalent import error).

- [ ] **Step 3: Implement `attachMarketCap`**

Create `lib/market-data/calendar-market-cap.ts`:

```ts
import { createServerClient } from '@/lib/supabase/client';

interface MarketCapRow {
  ticker: string;
  market_cap: number | null;
}

/**
 * Attaches each item's market cap from screener_stats in one batched query.
 * A ticker screener_stats has never seen (e.g. a pre-IPO company) resolves to
 * `market_cap: null` rather than failing the whole batch. Items with a falsy
 * `symbol` (some pre-ticker IPO entries have an empty string — the pre-redesign
 * IPOTab already guarded against this with `ipo.symbol ? ... : '—'`) also
 * resolve to `null` instead of throwing.
 */
export async function attachMarketCap<T extends { symbol: string }>(
  items: T[]
): Promise<(T & { market_cap: number | null })[]> {
  if (items.length === 0) return [];

  const symbols = [...new Set(items.filter((item) => item.symbol).map((item) => item.symbol.toUpperCase()))];
  const supabase = createServerClient();
  const { data } = await supabase
    .from('screener_stats')
    .select('ticker, market_cap')
    .in('ticker', symbols);

  const capByTicker = new Map(
    ((data ?? []) as MarketCapRow[]).map((row) => [row.ticker, row.market_cap])
  );

  return items.map((item) => ({
    ...item,
    market_cap: item.symbol ? (capByTicker.get(item.symbol.toUpperCase()) ?? null) : null,
  }));
}
```

- [ ] **Step 4: Run the script again to confirm it passes**

Run: `npx tsx scripts/test-calendar-market-cap.ts`
Expected: PASS, prints the 3-item array with AAPL/MSFT showing real market caps and ZZZNOTREAL showing `null`.

- [ ] **Step 5: Wire it into `earnings/route.ts`**

In `app/api/calendar/earnings/route.ts`, replace:

```ts
import { getEarningsCalendarRange, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { SIGNIFICANT_TICKERS } from '@/lib/market-data/significant-tickers';
import { NASDAQ100_TICKERS } from '@/lib/market-data/nasdaq100';
import { getCached, setCached } from '@/lib/cache/market-data-cache';

const NASDAQ100_SET = new Set(NASDAQ100_TICKERS);
// Earnings dates are announced weeks in advance and almost never change intraday.
const EARNINGS_CACHE_TTL_SECONDS = 24 * 60 * 60;

interface EarningsRow { symbol: string; date: string }
interface EarningsResponse { success: true; data: EarningsRow[] }
```

with:

```ts
import { getEarningsCalendarRange, TwelveDataRateLimitError, type EarningsCalendarItem } from '@/lib/twelvedata/twelvedata-client';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { SIGNIFICANT_TICKERS } from '@/lib/market-data/significant-tickers';
import { NASDAQ100_TICKERS } from '@/lib/market-data/nasdaq100';
import { getCached, setCached } from '@/lib/cache/market-data-cache';
import { attachMarketCap } from '@/lib/market-data/calendar-market-cap';

const NASDAQ100_SET = new Set(NASDAQ100_TICKERS);
// Earnings dates are announced weeks in advance and almost never change intraday.
const EARNINGS_CACHE_TTL_SECONDS = 24 * 60 * 60;

type EarningsRow = EarningsCalendarItem & { market_cap: number | null };
interface EarningsResponse { success: true; data: EarningsRow[] }
```

(The old `EarningsRow` only declared `{symbol, date}` even though the route actually returned every `EarningsCalendarItem` field — this was already a type/runtime mismatch before this change; the new definition is accurate.)

Then replace:

```ts
    const raw = await getEarningsCalendarRange(from, to, country);
    const data = raw
      .filter((item) => SIGNIFICANT_TICKERS.has(item.symbol))
      .sort((a, b) => {
        const aTier = NASDAQ100_SET.has(a.symbol) ? 0 : 1;
        const bTier = NASDAQ100_SET.has(b.symbol) ? 0 : 1;
        if (aTier !== bTier) return aTier - bTier;
        const dateCmp = a.date.localeCompare(b.date);
        if (dateCmp !== 0) return dateCmp;
        return a.symbol.localeCompare(b.symbol);
      });

    const body: EarningsResponse = { success: true, data };
```

with:

```ts
    const raw = await getEarningsCalendarRange(from, to, country);
    const sorted = raw
      .filter((item) => SIGNIFICANT_TICKERS.has(item.symbol))
      .sort((a, b) => {
        const aTier = NASDAQ100_SET.has(a.symbol) ? 0 : 1;
        const bTier = NASDAQ100_SET.has(b.symbol) ? 0 : 1;
        if (aTier !== bTier) return aTier - bTier;
        const dateCmp = a.date.localeCompare(b.date);
        if (dateCmp !== 0) return dateCmp;
        return a.symbol.localeCompare(b.symbol);
      });
    const data = await attachMarketCap(sorted);

    const body: EarningsResponse = { success: true, data };
```

- [ ] **Step 6: Wire it into `dividends/route.ts` (with the `SIGNIFICANT_TICKERS` filter)**

In `app/api/calendar/dividends/route.ts`, replace:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getDividendsCalendar, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { getCached, setCached } from '@/lib/cache/market-data-cache';
```

with:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getDividendsCalendar, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { getCached, setCached } from '@/lib/cache/market-data-cache';
import { SIGNIFICANT_TICKERS } from '@/lib/market-data/significant-tickers';
import { attachMarketCap } from '@/lib/market-data/calendar-market-cap';
```

and replace:

```ts
  try {
    const data = await getDividendsCalendar(from, to);
    void setCached(cacheKey, '_market', 'dividends_calendar', data, CACHE_TTL_SECONDS);
```

with:

```ts
  try {
    const raw = await getDividendsCalendar(from, to);
    const data = await attachMarketCap(raw.filter((item) => SIGNIFICANT_TICKERS.has(item.symbol)));
    void setCached(cacheKey, '_market', 'dividends_calendar', data, CACHE_TTL_SECONDS);
```

- [ ] **Step 7: Wire it into `splits/route.ts` (with the `SIGNIFICANT_TICKERS` filter)**

Same edit pattern in `app/api/calendar/splits/route.ts` — add the same two imports, then replace:

```ts
  try {
    const data = await getSplitsCalendar(from, to);
    void setCached(cacheKey, '_market', 'splits_calendar', data, CACHE_TTL_SECONDS);
```

with:

```ts
  try {
    const raw = await getSplitsCalendar(from, to);
    const data = await attachMarketCap(raw.filter((item) => SIGNIFICANT_TICKERS.has(item.symbol)));
    void setCached(cacheKey, '_market', 'splits_calendar', data, CACHE_TTL_SECONDS);
```

- [ ] **Step 8: Wire it into `ipo/route.ts` (market cap only — no ticker filter, see the correction note above)**

In `app/api/calendar/ipo/route.ts`, add only:

```ts
import { attachMarketCap } from '@/lib/market-data/calendar-market-cap';
```

and replace:

```ts
  try {
    const data = await getIPOCalendar(from, to);
    void setCached(cacheKey, '_market', 'ipo_calendar', data, CACHE_TTL_SECONDS);
```

with:

```ts
  try {
    const raw = await getIPOCalendar(from, to);
    const data = await attachMarketCap(raw);
    void setCached(cacheKey, '_market', 'ipo_calendar', data, CACHE_TTL_SECONDS);
```

- [ ] **Step 9: Register the script and manually verify all four routes**

In `package.json`, add near the other `test-*` entries:

```json
"test-calendar-market-cap": "tsx scripts/test-calendar-market-cap.ts",
```

Run: `npm run dev`, then in another terminal:

```bash
curl "http://localhost:3000/api/calendar/earnings?from=2026-08-03&to=2026-08-09" | head -c 500
curl "http://localhost:3000/api/calendar/dividends?from=2026-08-03&to=2026-08-09" | head -c 500
curl "http://localhost:3000/api/calendar/splits?from=2026-08-03&to=2026-08-09" | head -c 500
curl "http://localhost:3000/api/calendar/ipo?from=2026-08-03&to=2026-08-09" | head -c 500
```

Expected: every item in every response now has a `market_cap` field (`number` or `null`); dividends/splits items are all from well-known large caps (no obscure OTC symbols); IPO items are present even though most/all show `market_cap: null` (expected — pre-listing companies aren't in `screener_stats` yet).

- [ ] **Step 10: Commit**

```bash
git add lib/market-data/calendar-market-cap.ts app/api/calendar/earnings/route.ts app/api/calendar/dividends/route.ts app/api/calendar/splits/route.ts app/api/calendar/ipo/route.ts scripts/test-calendar-market-cap.ts package.json
git commit -m "feat(calendar): enrich calendar responses with market cap, filter dividends/splits to significant tickers"
```

---

### Task 2: Frontend foundation — types and formatters

**Files:**
- Create: `components/tools/calendar/types.ts`
- Create: `components/tools/calendar/format.ts`

**Interfaces:**
- Consumes: `EarningsCalendarItem`, `DividendsCalendarItem`, `SplitsCalendarItem`, `IPOCalendarItem` from `@/lib/twelvedata/twelvedata-client` (unchanged existing types).
- Produces: `EventType`, `EarningsItem`, `DividendItem`, `SplitItem`, `IPOItem`, `CalendarResponse<T>`, `UnifiedEvent`, `DayModel` (all from `types.ts`); `getWeekRange`, `todayStr`, `fmtDayHeader`, `fmtShortDate`, `fmtWeekRange`, `weekDatesBetween`, `fmtEPS`, `fmtRevenue` (all from `format.ts`) — every later task imports from these two files.

There's no separate test step for this task — it's pure type/function definitions exercised by Task 3's test script and every later task's manual verification.

- [ ] **Step 1: Create `types.ts`**

```ts
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
```

- [ ] **Step 2: Create `format.ts`**

```ts
/** Returns the ISO week range for a given offset. Uses UTC to avoid DST/timezone issues. */
export function getWeekRange(offsetWeeks = 0) {
  const now = new Date();
  const dow = now.getUTCDay(); // 0 = Sun
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  const monday = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(),
    now.getUTCDate() - daysSinceMonday + offsetWeeks * 7,
  ));
  const sunday = new Date(Date.UTC(
    monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 6,
  ));
  return {
    from: monday.toISOString().slice(0, 10),
    to: sunday.toISOString().slice(0, 10),
  };
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Formats a YYYY-MM-DD string as "Mon, May 26". Uses noon UTC to avoid timezone boundary issues. */
export function fmtDayHeader(d: string): string {
  const dt = new Date(d + 'T12:00:00Z');
  return dt.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

/** Formats a YYYY-MM-DD string as "May 26". */
export function fmtShortDate(d: string): string {
  const dt = new Date(d + 'T12:00:00Z');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Formats a week range as "May 25 – 31" or "May 26 – Jun 2". */
export function fmtWeekRange(from: string, to: string): string {
  const f = new Date(from + 'T12:00:00Z');
  const t = new Date(to + 'T12:00:00Z');
  const mf = f.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const mt = t.toLocaleDateString('en-US', {
    month: f.getUTCMonth() === t.getUTCMonth() ? undefined : 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return `${mf} – ${mt}`;
}

/** Every date string (YYYY-MM-DD) between `from` and `to`, inclusive. */
export function weekDatesBetween(from: string, to: string): string[] {
  const start = new Date(from + 'T12:00:00Z');
  const end = new Date(to + 'T12:00:00Z');
  const dates: string[] = [];
  for (const d = new Date(start); d.getTime() <= end.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

export function fmtEPS(n: number): string {
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `-$${abs}` : `$${abs}`;
}

export function fmtRevenue(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString('en-US')}`;
}
```

(`timeOrder` from the old `page.tsx` is intentionally not carried over — nothing in the new design sorts by BMO/AMC anymore; ranking is by market cap. See Task 3.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit components/tools/calendar/types.ts components/tools/calendar/format.ts 2>&1 | head -30`
Expected: no errors referencing these two files (unrelated pre-existing repo errors, if any, are fine — CLAUDE.md notes TS build errors are already suppressed project-wide).

- [ ] **Step 4: Commit**

```bash
git add components/tools/calendar/types.ts components/tools/calendar/format.ts
git commit -m "feat(calendar): add unified event types and formatters for calendar redesign"
```

---

### Task 3: Data engine — `buildDayModel` (pure) and `useCalendarWeek` (fetching)

**Files:**
- Create: `components/tools/calendar/day-model.ts`
- Create: `components/tools/calendar/useCalendarWeek.ts`
- Test: `scripts/test-calendar-day-model.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `EventType`, `UnifiedEvent`, `DayModel`, `CalendarResponse`, `EarningsItem`, `DividendItem`, `SplitItem`, `IPOItem` (from `./types`, Task 2).
- Produces: `buildDayModel(events: UnifiedEvent[], weekDates: string[], mySymbols: Set<string>, typeFilter: Set<EventType>): DayModel[]` (from `day-model.ts`) and `useCalendarWeek(from: string, to: string): { events: UnifiedEvent[]; isLoading: boolean }` (from `useCalendarWeek.ts`) — Task 10's page calls both directly.

`day-model.ts` deliberately has zero React/TanStack imports so it can be exercised by a plain `tsx` script — that's what Steps 1-4 below test. `useCalendarWeek.ts` is the React-Query-dependent half; it has no automated test (no React testing library in this repo) and is verified in Task 10's browser check instead.

- [ ] **Step 1: Write the failing test**

Create `scripts/test-calendar-day-model.ts`:

```ts
// Verifies buildDayModel: mine-first ordering, market-cap ranking of the rest,
// the 3-item cell cap + moreCount math, empty days, and type filtering.
import { buildDayModel } from '../components/tools/calendar/day-model';
import type { UnifiedEvent, EventType } from '../components/tools/calendar/types';

function ev(overrides: Pick<UnifiedEvent, 'symbol' | 'date' | 'type'> & Partial<UnifiedEvent>): UnifiedEvent {
  return { name: undefined, marketCap: null, raw: {} as never, ...overrides };
}

const weekDates = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09'];
const allTypes = new Set<EventType>(['earnings', 'dividends', 'splits', 'ipo']);

const events: UnifiedEvent[] = [
  ev({ symbol: 'AAPL', date: '2026-08-04', type: 'earnings', marketCap: 3_000_000_000_000 }),
  ev({ symbol: 'MSFT', date: '2026-08-04', type: 'earnings', marketCap: 2_900_000_000_000 }),
  ev({ symbol: 'SMALLCO', date: '2026-08-04', type: 'earnings', marketCap: 1_000_000 }),
  ev({ symbol: 'MYHOLD', date: '2026-08-04', type: 'earnings', marketCap: 5_000_000 }),
  ev({ symbol: 'NOMKTCAP', date: '2026-08-04', type: 'ipo', marketCap: null }),
];

function main() {
  // Busy day: my holding surfaces first, then the two mega-caps by market cap, rest overflow.
  const mySymbols = new Set(['MYHOLD']);
  const days = buildDayModel(events, weekDates, mySymbols, allTypes);
  const day = days.find((d) => d.date === '2026-08-04');
  if (!day) throw new Error('Expected a DayModel for 2026-08-04');
  if (day.total !== 5) throw new Error(`Expected total 5, got ${day.total}`);
  if (day.shown.length !== 3) throw new Error(`Expected 3 shown (cell limit), got ${day.shown.length}`);
  if (day.moreCount !== 2) throw new Error(`Expected moreCount 2, got ${day.moreCount}`);
  if (day.shown[0].symbol !== 'MYHOLD') throw new Error(`Expected MYHOLD shown first, got ${day.shown[0].symbol}`);
  if (day.shown[1].symbol !== 'AAPL' || day.shown[2].symbol !== 'MSFT') {
    throw new Error(`Expected AAPL then MSFT by market cap after MYHOLD, got ${day.shown.map((e) => e.symbol)}`);
  }
  if (day.mine.length !== 1 || day.others.length !== 4) {
    throw new Error(`Expected mine=1/others=4, got mine=${day.mine.length}/others=${day.others.length}`);
  }

  // Empty day.
  const emptyDay = days.find((d) => d.date === '2026-08-03');
  if (!emptyDay || emptyDay.total !== 0 || emptyDay.shown.length !== 0) {
    throw new Error('Expected an empty DayModel for 2026-08-03');
  }

  // Type filter: excluding ipo drops NOMKTCAP, leaving 4 events that day.
  const earningsOnly = buildDayModel(events, weekDates, new Set(), new Set(['earnings']));
  const filteredDay = earningsOnly.find((d) => d.date === '2026-08-04')!;
  if (filteredDay.total !== 4) throw new Error(`Expected 4 events after excluding ipo, got ${filteredDay.total}`);

  console.log('PASS: buildDayModel groups, ranks, caps, and filters correctly');
}

main();
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx tsx scripts/test-calendar-day-model.ts`
Expected: FAIL — `Cannot find module '../components/tools/calendar/day-model'`.

- [ ] **Step 3: Implement `day-model.ts`**

```ts
import type { EventType, UnifiedEvent, DayModel } from './types';

/** Max rows a compact grid cell shows before collapsing the rest into "+N more". */
const CELL_LIMIT = 3;

/**
 * Groups events by day, splits each day into "mine" (matches mySymbols) vs.
 * "others" (ranked by market cap, nulls last), and precomputes the compact
 * cell's `shown`/`moreCount` so DayCell has no business logic of its own.
 * Pure — safe to call from a script or a component.
 */
export function buildDayModel(
  events: UnifiedEvent[],
  weekDates: string[],
  mySymbols: Set<string>,
  typeFilter: Set<EventType>,
): DayModel[] {
  const filtered = events.filter((e) => typeFilter.has(e.type));

  return weekDates.map((date) => {
    const dayEvents = filtered.filter((e) => e.date === date);
    const mine = dayEvents.filter((e) => mySymbols.has(e.symbol.toUpperCase()));
    const others = dayEvents
      .filter((e) => !mySymbols.has(e.symbol.toUpperCase()))
      .sort((a, b) => (b.marketCap ?? -1) - (a.marketCap ?? -1));
    const shown = [...mine, ...others].slice(0, CELL_LIMIT);

    return {
      date,
      mine,
      others,
      shown,
      moreCount: dayEvents.length - shown.length,
      total: dayEvents.length,
    };
  });
}
```

- [ ] **Step 4: Run the test again to confirm it passes**

Run: `npx tsx scripts/test-calendar-day-model.ts`
Expected: PASS, prints `PASS: buildDayModel groups, ranks, caps, and filters correctly`.

- [ ] **Step 5: Implement `useCalendarWeek.ts`**

```ts
'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  EarningsItem,
  DividendItem,
  SplitItem,
  IPOItem,
  UnifiedEvent,
  CalendarResponse,
} from './types';

async function fetchCalendar<T>(url: string): Promise<CalendarResponse<T>> {
  const res = await fetch(url);
  return res.json();
}

/**
 * Fires all four calendar endpoints unconditionally (the grid needs every
 * type at once, unlike the old per-tab fetch-on-select behavior) and
 * normalizes the results into one flat, typed event list.
 */
export function useCalendarWeek(from: string, to: string) {
  const earningsQ = useQuery<CalendarResponse<EarningsItem>>({
    queryKey: ['calendar-earnings', from, to],
    queryFn: () => fetchCalendar<EarningsItem>(`/api/calendar/earnings?from=${from}&to=${to}`),
    staleTime: 60 * 60 * 1000,
  });
  const dividendsQ = useQuery<CalendarResponse<DividendItem>>({
    queryKey: ['calendar-dividends', from, to],
    queryFn: () => fetchCalendar<DividendItem>(`/api/calendar/dividends?from=${from}&to=${to}`),
    staleTime: 60 * 60 * 1000,
  });
  const splitsQ = useQuery<CalendarResponse<SplitItem>>({
    queryKey: ['calendar-splits', from, to],
    queryFn: () => fetchCalendar<SplitItem>(`/api/calendar/splits?from=${from}&to=${to}`),
    staleTime: 60 * 60 * 1000,
  });
  const ipoQ = useQuery<CalendarResponse<IPOItem>>({
    queryKey: ['calendar-ipo', from, to],
    queryFn: () => fetchCalendar<IPOItem>(`/api/calendar/ipo?from=${from}&to=${to}`),
    staleTime: 60 * 60 * 1000,
  });

  const events = useMemo<UnifiedEvent[]>(() => {
    const out: UnifiedEvent[] = [];
    for (const e of earningsQ.data?.data ?? []) {
      out.push({ type: 'earnings', symbol: e.symbol, name: e.name, date: e.date, marketCap: e.market_cap, raw: e });
    }
    for (const d of dividendsQ.data?.data ?? []) {
      out.push({ type: 'dividends', symbol: d.symbol, name: d.name, date: d.ex_dividend_date, marketCap: d.market_cap, raw: d });
    }
    for (const s of splitsQ.data?.data ?? []) {
      out.push({ type: 'splits', symbol: s.symbol, name: s.name, date: s.date, marketCap: s.market_cap, raw: s });
    }
    for (const i of ipoQ.data?.data ?? []) {
      out.push({ type: 'ipo', symbol: i.symbol, name: i.name, date: i.date, marketCap: i.market_cap, raw: i });
    }
    return out;
  }, [earningsQ.data, dividendsQ.data, splitsQ.data, ipoQ.data]);

  const isLoading = earningsQ.isLoading || dividendsQ.isLoading || splitsQ.isLoading || ipoQ.isLoading;

  return { events, isLoading };
}
```

- [ ] **Step 6: Register the script and type-check**

In `package.json`, add:

```json
"test-calendar-day-model": "tsx scripts/test-calendar-day-model.ts",
```

Run: `npx tsc --noEmit components/tools/calendar/day-model.ts components/tools/calendar/useCalendarWeek.ts 2>&1 | head -30`
Expected: no errors referencing these two files.

- [ ] **Step 7: Commit**

```bash
git add components/tools/calendar/day-model.ts components/tools/calendar/useCalendarWeek.ts scripts/test-calendar-day-model.ts package.json
git commit -m "feat(calendar): add day-model grouping/ranking engine and the 4-in-1 calendar fetch hook"
```

---

### Task 4: `EventRows.tsx` — compact and detail row renderers

**Files:**
- Create: `components/tools/calendar/EventRows.tsx`

**Interfaces:**
- Consumes: `UnifiedEvent`, `EarningsItem`, `DividendItem`, `SplitItem`, `IPOItem`, `EventType` (from `./types`); `fmtEPS`, `fmtRevenue`, `fmtShortDate` (from `./format`).
- Produces: `CompactEventRow({ event, isMine }: { event: UnifiedEvent; isMine: boolean })` — used by Task 5 (`DayCell`); `DetailEventRow({ event }: { event: UnifiedEvent })` — used by Task 9 (`DayDetailDialog`).

This file's content is almost entirely today's existing per-tab row JSX (from the pre-redesign `EarningsTab`/`DividendsTab`/`SplitsTab`/`IPOTab` bodies), ported unchanged into one type-switching component plus one new compact variant. No behavior test — visual verification happens in Task 9/10's browser check.

- [ ] **Step 1: Create the file**

```tsx
'use client';

import Link from 'next/link';
import type { ElementType } from 'react';
import { TrendingUp, DollarSign, Scissors, Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { fmtEPS, fmtRevenue, fmtShortDate } from './format';
import type { UnifiedEvent, EventType, EarningsItem, DividendItem, SplitItem, IPOItem } from './types';

const TYPE_ICONS: Record<EventType, ElementType> = {
  earnings: TrendingUp,
  dividends: DollarSign,
  splits: Scissors,
  ipo: Rocket,
};

function TimeTag({ time }: { time?: string }) {
  if (time === 'BMO' || time === 'pre_market') {
    return (
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 uppercase tracking-wide leading-none">
        BMO
      </span>
    );
  }
  if (time === 'AMC' || time === 'after_close') {
    return (
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 uppercase tracking-wide leading-none">
        AMC
      </span>
    );
  }
  return null;
}

const IPO_STATUS_COLORS: Record<string, string> = {
  expected: 'bg-sky-500/10 text-sky-400',
  priced: 'bg-emerald-500/10 text-emerald-400',
  filed: 'bg-muted/60 text-muted-foreground',
  withdrawn: 'bg-red-500/10 text-red-400',
};

// ─── Compact (grid cell) ──────────────────────────────────────────────────────

function compactMetric(event: UnifiedEvent): string | null {
  if (event.type === 'earnings') {
    const e = event.raw as EarningsItem;
    return e.eps_estimate != null ? fmtEPS(e.eps_estimate) : null;
  }
  if (event.type === 'dividends') {
    const d = event.raw as DividendItem;
    return d.dividend_amount != null ? `$${d.dividend_amount.toFixed(2)}` : null;
  }
  if (event.type === 'splits') {
    const s = event.raw as SplitItem;
    return s.ratio ?? null;
  }
  const ipo = event.raw as IPOItem;
  if (ipo.price_from != null) return `$${ipo.price_from}${ipo.price_to != null ? `–${ipo.price_to}` : ''}`;
  return null;
}

/** One-line row for a compact grid cell (DayCell). */
export function CompactEventRow({ event, isMine }: { event: UnifiedEvent; isMine: boolean }) {
  const Icon = TYPE_ICONS[event.type];
  const metric = compactMetric(event);
  return (
    <div className="flex items-center gap-1.5 text-[11px] min-w-0">
      {isMine && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" aria-hidden />}
      <Icon className="h-3 w-3 text-muted-foreground/70 shrink-0" aria-hidden />
      <span className="font-bold font-mono text-foreground truncate">{event.symbol}</span>
      {metric && <span className="ml-auto text-muted-foreground/85 tabular-nums shrink-0">{metric}</span>}
    </div>
  );
}

// ─── Detail (day dialog) ──────────────────────────────────────────────────────

/** Full-detail row — same visual language as the pre-redesign per-type list rows. Used inside DayDetailDialog. */
export function DetailEventRow({ event }: { event: UnifiedEvent }) {
  if (event.type === 'earnings') {
    const e = event.raw as EarningsItem;
    return (
      <div className="flex items-center justify-between gap-2 sm:gap-4 py-2.5 px-2 -mx-2 rounded-lg hover:bg-muted/20 transition-colors group">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={slugToAssetPath(e.symbol)}
            className="font-bold text-sm font-mono text-foreground hover:text-primary transition-colors shrink-0 w-14 focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            {e.symbol}
          </Link>
          <div className="min-w-0 flex-1">
            {e.name && <p className="text-xs text-muted-foreground truncate leading-tight">{e.name}</p>}
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <TimeTag time={e.time} />
              {e.fiscal_quarter && (
                <span className="text-[9px] text-muted-foreground/80 font-mono leading-none">{e.fiscal_quarter}</span>
              )}
            </div>
          </div>
        </div>
        <div className="text-right text-xs shrink-0 space-y-0.5">
          {e.eps_estimate != null ? (
            <div>
              <span className="text-muted-foreground/80">EPS est. </span>
              <span className={cn('font-semibold tabular-nums', e.eps_estimate < 0 ? 'text-red-400' : 'text-foreground')}>
                {fmtEPS(e.eps_estimate)}
              </span>
            </div>
          ) : (
            <span className="text-muted-foreground/80">—</span>
          )}
          {e.revenue_estimate != null && (
            <div className="text-[10px] text-muted-foreground/80">Rev {fmtRevenue(e.revenue_estimate)}</div>
          )}
        </div>
      </div>
    );
  }

  if (event.type === 'dividends') {
    const d = event.raw as DividendItem;
    return (
      <div className="flex items-center justify-between gap-2 sm:gap-4 py-2.5 px-2 -mx-2 rounded-lg hover:bg-muted/20 transition-colors group">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={slugToAssetPath(d.symbol)}
            className="font-bold text-sm font-mono text-foreground hover:text-primary transition-colors shrink-0 w-14 focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            {d.symbol}
          </Link>
          <div className="min-w-0">
            {d.name && <p className="text-xs text-muted-foreground truncate">{d.name}</p>}
            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground/85 flex-wrap">
              {d.payment_date && <span>Pay {fmtShortDate(d.payment_date)}</span>}
              {d.frequency && <span className="capitalize px-1 bg-muted/60 rounded">{d.frequency}</span>}
            </div>
          </div>
        </div>
        {d.dividend_amount != null && (
          <span className="text-sm font-semibold tabular-nums text-emerald-500 shrink-0">
            ${d.dividend_amount.toFixed(4)}
          </span>
        )}
      </div>
    );
  }

  if (event.type === 'splits') {
    const s = event.raw as SplitItem;
    return (
      <div className="flex items-center justify-between gap-2 sm:gap-4 py-2.5 px-2 -mx-2 rounded-lg hover:bg-muted/20 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={slugToAssetPath(s.symbol)}
            className="font-bold text-sm font-mono text-foreground hover:text-primary transition-colors shrink-0 w-14 focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            {s.symbol}
          </Link>
          {s.name && <p className="text-xs text-muted-foreground truncate">{s.name}</p>}
        </div>
        {s.ratio && (
          <span className="text-xs font-bold font-mono text-foreground shrink-0 bg-muted px-2 py-0.5 rounded">
            {s.ratio}
          </span>
        )}
      </div>
    );
  }

  // ipo
  const ipo = event.raw as IPOItem;
  return (
    <div className="flex items-center justify-between gap-2 sm:gap-4 py-2.5 px-2 -mx-2 rounded-lg hover:bg-muted/20 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        {ipo.symbol ? (
          <Link
            href={slugToAssetPath(ipo.symbol)}
            className="font-bold text-sm font-mono text-foreground hover:text-primary transition-colors shrink-0 w-14 focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            {ipo.symbol}
          </Link>
        ) : (
          <span className="font-bold text-sm font-mono text-muted-foreground shrink-0 w-14">—</span>
        )}
        <div className="min-w-0">
          {ipo.name && <p className="text-xs text-muted-foreground truncate">{ipo.name}</p>}
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {ipo.exchange && <span className="text-[10px] text-muted-foreground/80">{ipo.exchange}</span>}
            {ipo.status && (
              <span className={cn(
                'text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide leading-none capitalize',
                IPO_STATUS_COLORS[ipo.status.toLowerCase()] ?? 'bg-muted/60 text-muted-foreground',
              )}>
                {ipo.status}
              </span>
            )}
          </div>
        </div>
      </div>
      {(ipo.price_from != null || ipo.price_to != null) && (
        <div className="text-right text-xs shrink-0">
          <span className="font-semibold tabular-nums text-foreground">
            {ipo.price_from != null ? `$${ipo.price_from}` : ''}
            {ipo.price_from != null && ipo.price_to != null ? ' – ' : ''}
            {ipo.price_to != null ? `$${ipo.price_to}` : ''}
          </span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Lint**

Run: `npx eslint components/tools/calendar/EventRows.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/tools/calendar/EventRows.tsx
git commit -m "feat(calendar): extract compact and detail event row renderers"
```

---

### Task 5: `DayCell.tsx`

**Files:**
- Create: `components/tools/calendar/DayCell.tsx`

**Interfaces:**
- Consumes: `DayModel` (from `./types`), `CompactEventRow` (from `./EventRows`, Task 4), `fmtDayHeader` (from `./format`).
- Produces: `DayCell({ model, today, mySymbols, onOpenDay }: { model: DayModel; today: string; mySymbols: Set<string>; onOpenDay: (date: string) => void })` — used by Task 6 (`CalendarGrid`).

- [ ] **Step 1: Create the file**

```tsx
'use client';

import { cn } from '@/lib/utils';
import { CompactEventRow } from './EventRows';
import { fmtDayHeader } from './format';
import type { DayModel } from './types';

interface DayCellProps {
  model: DayModel;
  today: string;
  mySymbols: Set<string>;
  onOpenDay: (date: string) => void;
}

export function DayCell({ model, today, mySymbols, onOpenDay }: DayCellProps) {
  const isToday = model.date === today;

  if (model.total === 0) {
    return (
      <div className="flex flex-col gap-1 rounded-lg p-2 min-h-[104px]">
        <span className={cn(
          'text-[10px] font-bold uppercase tracking-wide',
          isToday ? 'text-primary' : 'text-muted-foreground/70',
        )}>
          {fmtDayHeader(model.date)}
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpenDay(model.date)}
      className={cn(
        'flex flex-col gap-1.5 rounded-lg p-2 min-h-[104px] text-left border transition-all hover:shadow-md hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isToday ? 'bg-primary/[0.06] border-primary/30' : 'border-border/50 hover:border-border',
      )}
    >
      <span className={cn(
        'text-[10px] font-bold uppercase tracking-wide',
        isToday ? 'text-primary' : 'text-muted-foreground/70',
      )}>
        {fmtDayHeader(model.date)}
      </span>
      <div className="flex flex-col gap-1">
        {model.shown.map((event, i) => (
          <CompactEventRow
            key={`${event.type}-${event.symbol}-${i}`}
            event={event}
            isMine={mySymbols.has(event.symbol.toUpperCase())}
          />
        ))}
      </div>
      {model.moreCount > 0 && (
        <span className="text-[10px] text-muted-foreground/80 font-medium mt-auto pt-0.5">
          +{model.moreCount} more
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 2: Lint**

Run: `npx eslint components/tools/calendar/DayCell.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/tools/calendar/DayCell.tsx
git commit -m "feat(calendar): add DayCell compact grid cell component"
```

---

### Task 6: `CalendarGrid.tsx`

**Files:**
- Create: `components/tools/calendar/CalendarGrid.tsx`

**Interfaces:**
- Consumes: `DayCell` (from `./DayCell`, Task 5), `DayModel` (from `./types`).
- Produces: `CalendarGrid({ days, today, mySymbols, onOpenDay }: { days: DayModel[]; today: string; mySymbols: Set<string>; onOpenDay: (date: string) => void })` — used by Task 10's page.

- [ ] **Step 1: Create the file**

```tsx
'use client';

import { DayCell } from './DayCell';
import type { DayModel } from './types';

interface CalendarGridProps {
  days: DayModel[];
  today: string;
  mySymbols: Set<string>;
  onOpenDay: (date: string) => void;
}

/** Real 7-column week grid at `sm` and up; a single stacked column below it. */
export function CalendarGrid({ days, today, mySymbols, onOpenDay }: CalendarGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
      {days.map((model) => (
        <DayCell
          key={model.date}
          model={model}
          today={today}
          mySymbols={mySymbols}
          onOpenDay={onOpenDay}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Lint**

Run: `npx eslint components/tools/calendar/CalendarGrid.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/tools/calendar/CalendarGrid.tsx
git commit -m "feat(calendar): add responsive CalendarGrid container"
```

---

### Task 7: `YourWeekStrip.tsx`

**Files:**
- Create: `components/tools/calendar/YourWeekStrip.tsx`

**Interfaces:**
- Consumes: `DayModel`, `EventType` (from `./types`), `fmtDayHeader` (from `./format`), `slugToAssetPath` (from `@/lib/assets/asset-type`, existing).
- Produces: `YourWeekStrip({ days }: { days: DayModel[] })` — used by Task 10's page. Renders `null` when there are no personal events in range (no empty-state clutter for logged-out/new users — the page only mounts this component when `isAuthenticated` anyway, per Task 10).

- [ ] **Step 1: Create the file**

```tsx
'use client';

import Link from 'next/link';
import type { ElementType } from 'react';
import { TrendingUp, DollarSign, Scissors, Rocket } from 'lucide-react';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { fmtDayHeader } from './format';
import type { DayModel, EventType } from './types';

const TYPE_LABELS: Record<EventType, string> = {
  earnings: 'Earnings',
  dividends: 'Ex-dividend',
  splits: 'Split',
  ipo: 'IPO',
};

const TYPE_ICONS: Record<EventType, ElementType> = {
  earnings: TrendingUp,
  dividends: DollarSign,
  splits: Scissors,
  ipo: Rocket,
};

/** Horizontally-scrollable chip row of the user's own holdings/watchlist events this week. */
export function YourWeekStrip({ days }: { days: DayModel[] }) {
  const items = days.flatMap((day) => day.mine.map((event) => ({ event, date: day.date })));
  if (items.length === 0) return null;

  return (
    <div className="mb-6 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {items.map(({ event, date }, i) => {
        const Icon = TYPE_ICONS[event.type];
        return (
          <Link
            key={`${event.type}-${event.symbol}-${i}`}
            href={slugToAssetPath(event.symbol)}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-emerald-500/50"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
            <Icon className="h-3 w-3 text-muted-foreground/80" aria-hidden />
            <span className="font-bold font-mono">{event.symbol}</span>
            <span className="text-muted-foreground/85">{TYPE_LABELS[event.type]}</span>
            <span className="text-muted-foreground/70">{fmtDayHeader(date)}</span>
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Lint**

Run: `npx eslint components/tools/calendar/YourWeekStrip.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/tools/calendar/YourWeekStrip.tsx
git commit -m "feat(calendar): add YourWeekStrip personalized highlight row"
```

---

### Task 8: `TypeFilterChips.tsx`

**Files:**
- Create: `components/tools/calendar/TypeFilterChips.tsx`

**Interfaces:**
- Consumes: `EventType` (from `./types`).
- Produces: `TypeFilterChips({ active, onToggle }: { active: Set<EventType>; onToggle: (type: EventType) => void })` — used by Task 10's page.

- [ ] **Step 1: Create the file**

```tsx
'use client';

import type { ElementType } from 'react';
import { TrendingUp, DollarSign, Scissors, Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EventType } from './types';

const TYPES: { key: EventType; label: string; icon: ElementType }[] = [
  { key: 'earnings', label: 'Earnings', icon: TrendingUp },
  { key: 'dividends', label: 'Dividends', icon: DollarSign },
  { key: 'splits', label: 'Splits', icon: Scissors },
  { key: 'ipo', label: 'IPOs', icon: Rocket },
];

interface TypeFilterChipsProps {
  active: Set<EventType>;
  onToggle: (type: EventType) => void;
}

export function TypeFilterChips({ active, onToggle }: TypeFilterChipsProps) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {TYPES.map(({ key, label, icon: Icon }) => {
        const isActive = active.has(key);
        return (
          <button
            key={key}
            type="button"
            onClick={() => onToggle(key)}
            aria-pressed={isActive}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border transition-all',
              isActive
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/20',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Lint**

Run: `npx eslint components/tools/calendar/TypeFilterChips.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/tools/calendar/TypeFilterChips.tsx
git commit -m "feat(calendar): add TypeFilterChips multi-toggle"
```

---

### Task 9: `DayDetailDialog.tsx`

**Files:**
- Create: `components/tools/calendar/DayDetailDialog.tsx`

**Interfaces:**
- Consumes: `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle` (from `@/components/ui/dialog`, existing shadcn primitives — same ones `HealthScoreHistoryModal.tsx` already uses); `DetailEventRow` (from `./EventRows`, Task 4); `fmtDayHeader` (from `./format`); `DayModel` (from `./types`).
- Produces: `DayDetailDialog({ model, onOpenChange }: { model: DayModel | null; onOpenChange: (open: boolean) => void })` — used by Task 10's page. `model === null` means closed; passing a `DayModel` opens it.

- [ ] **Step 1: Create the file**

```tsx
'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DetailEventRow } from './EventRows';
import { fmtDayHeader } from './format';
import type { DayModel } from './types';

interface DayDetailDialogProps {
  model: DayModel | null;
  onOpenChange: (open: boolean) => void;
}

export function DayDetailDialog({ model, onOpenChange }: DayDetailDialogProps) {
  return (
    <Dialog open={model !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{model ? fmtDayHeader(model.date) : ''}</DialogTitle>
        </DialogHeader>
        {model && (
          <div className="divide-y divide-border/40">
            {[...model.mine, ...model.others].map((event, i) => (
              <DetailEventRow key={`${event.type}-${event.symbol}-${i}`} event={event} />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Lint**

Run: `npx eslint components/tools/calendar/DayDetailDialog.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/tools/calendar/DayDetailDialog.tsx
git commit -m "feat(calendar): add DayDetailDialog full-day list view"
```

---

### Task 10: Page assembly — rewrite `app/tools/calendar/page.tsx`

**Files:**
- Modify (full rewrite): `app/tools/calendar/page.tsx`

**Interfaces:**
- Consumes everything produced by Tasks 2, 3, 6, 7, 8, 9: `getWeekRange`, `todayStr`, `fmtWeekRange`, `weekDatesBetween` (`./format`); `useCalendarWeek` (`./useCalendarWeek`); `buildDayModel` (`./day-model`); `YourWeekStrip`, `TypeFilterChips`, `CalendarGrid`, `DayDetailDialog`; `EventType` (`./types`); existing `useHoldings()` (`@/hooks/use-holdings`), `useWatchlist()` (`@/hooks/use-watchlist`), `useAuth()` (`@/hooks/use-auth`), `useBackground()` (`@/hooks/use-background`).
- Produces: the page itself — nothing downstream depends on it.

This is where the old `EarningsTab`/`DividendsTab`/`SplitsTab`/`IPOTab`, `DayHeader`, `EmptyState`, `LoadingRows`, `TimeTag`, and the old inline `getWeekRange`/`todayStr`/etc. helpers are deleted from this file — they've already been carried into `format.ts` (Task 2) and `EventRows.tsx` (Task 4).

- [ ] **Step 1: Replace the entire file**

```tsx
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useBackground } from '@/hooks/use-background';
import { useHoldings } from '@/hooks/use-holdings';
import { useWatchlist } from '@/hooks/use-watchlist';
import { useAuth } from '@/hooks/use-auth';
import { getWeekRange, todayStr, fmtWeekRange, weekDatesBetween } from '@/components/tools/calendar/format';
import { useCalendarWeek } from '@/components/tools/calendar/useCalendarWeek';
import { buildDayModel } from '@/components/tools/calendar/day-model';
import { YourWeekStrip } from '@/components/tools/calendar/YourWeekStrip';
import { TypeFilterChips } from '@/components/tools/calendar/TypeFilterChips';
import { CalendarGrid } from '@/components/tools/calendar/CalendarGrid';
import { DayDetailDialog } from '@/components/tools/calendar/DayDetailDialog';
import type { EventType } from '@/components/tools/calendar/types';

const WEEK_OFFSETS = [0, 1, 2, 3];
const WEEK_LABELS = ['This week', 'Next week', '+2w', '+3w'];
const ALL_TYPES: EventType[] = ['earnings', 'dividends', 'splits', 'ipo'];

export default function CalendarPage() {
  const { hasAnimatedBackground } = useBackground();
  const { isAuthenticated } = useAuth();
  const [weekOffset, setWeekOffset] = useState(0);
  const [typeFilter, setTypeFilter] = useState<Set<EventType>>(new Set(ALL_TYPES));
  const [openDate, setOpenDate] = useState<string | null>(null);

  const { from, to } = getWeekRange(weekOffset);
  const today = todayStr();
  const weekDates = useMemo(() => weekDatesBetween(from, to), [from, to]);

  const { events, isLoading } = useCalendarWeek(from, to);

  const { data: holdings } = useHoldings();
  const { data: watchlist } = useWatchlist();
  const mySymbols = useMemo(() => {
    const set = new Set<string>();
    for (const h of holdings ?? []) set.add(h.symbol.toUpperCase());
    for (const w of watchlist ?? []) set.add(w.symbol.toUpperCase());
    return set;
  }, [holdings, watchlist]);

  const days = useMemo(
    () => buildDayModel(events, weekDates, mySymbols, typeFilter),
    [events, weekDates, mySymbols, typeFilter],
  );

  const openModel = days.find((d) => d.date === openDate) ?? null;

  function toggleType(type: EventType) {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      // Never let every chip turn off — that would silently blank the whole grid.
      return next.size === 0 ? new Set(ALL_TYPES) : next;
    });
  }

  return (
    <div className={cn('min-h-screen', hasAnimatedBackground ? '' : 'bg-background')}>
      <main className="container mx-auto max-w-5xl py-10 px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mb-8">
          <Link
            href="/tools"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-5 group"
          >
            <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-0.5" />
            All tools
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 shrink-0">
              <CalendarDays className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Market Calendar</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Earnings, dividends, splits & IPOs</p>
            </div>
          </div>
        </div>

        {/* Week selector */}
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {WEEK_OFFSETS.map((offset) => (
              <button
                key={offset}
                onClick={() => setWeekOffset(offset)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition-all border',
                  weekOffset === offset
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/20',
                )}
              >
                {WEEK_LABELS[offset]}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground/85 tabular-nums font-mono">
            {fmtWeekRange(from, to)}
          </span>
        </div>

        {/* Type filters */}
        <div className="mb-6">
          <TypeFilterChips active={typeFilter} onToggle={toggleType} />
        </div>

        {/* Personalized highlight strip */}
        {isAuthenticated && <YourWeekStrip days={days} />}

        <Card>
          <CardContent className="pt-5 px-4 sm:px-5 pb-5">
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
                {weekDates.map((d) => (
                  <Skeleton key={d} className="min-h-[104px] rounded-lg" />
                ))}
              </div>
            ) : (
              <CalendarGrid days={days} today={today} mySymbols={mySymbols} onOpenDay={setOpenDate} />
            )}
          </CardContent>
        </Card>

        <DayDetailDialog model={openModel} onOpenChange={(open) => { if (!open) setOpenDate(null); }} />

      </main>
    </div>
  );
}
```

- [ ] **Step 2: Lint**

Run: `npx eslint app/tools/calendar/page.tsx`
Expected: no errors.

- [ ] **Step 3: Full project lint**

Run: `npm run lint`
Expected: 0 errors (warnings acceptable, per CLAUDE.md).

- [ ] **Step 4: Browser verification**

Use the `run` skill (or `npm run dev` + manual navigation) to check `/tools/calendar`:
- Signed out: no "Your Week" strip; every day cell falls back to market-cap-ranked names.
- Signed in with at least one holding/watchlist symbol that has an event this week or next: the strip appears above the grid, and that symbol's cell row shows the emerald dot and appears first among that day's rows.
- Click a busy day (or its "+N more" pill): `DayDetailDialog` opens with the full list for that date, scrollable if long.
- Toggle each type filter chip off/on: the grid, strip, and (if open) the dialog all narrow/widen consistently; turning off the last remaining chip snaps back to all-on instead of blanking the grid.
- Resize below `sm` (640px): grid collapses to a single stacked column.
- Click through "This week" / "Next week" / "+2w" / "+3w": data and the visible date range both update.
- With OS/browser "reduce motion" enabled, confirm the cell hover lift and dialog open/close no longer animate.

- [ ] **Step 5: Delete now-unused old code — confirm nothing references it**

Run: `grep -rn "EarningsTab\|DividendsTab\|SplitsTab\|IPOTab" app/ components/ 2>/dev/null`
Expected: no matches (the rewrite in Step 1 already removed all of it — this just confirms no other file imported these from `page.tsx`, which wasn't possible since they were unexported locals, but confirms clean removal).

- [ ] **Step 6: Commit**

```bash
git add app/tools/calendar/page.tsx
git commit -m "feat(calendar): rewrite Market Calendar as a personalized week grid"
```

---

### Task 11: Pre-ship polish pass

**Files:** none new — this task reviews the surface built in Tasks 1-10.

Per CLAUDE.md: "Before committing UI/UX-heavy work... invoke the impeccable skill's polish command on the changed surface." This redesign qualifies (new page layout, new components, visual hierarchy decisions) — this is the gate between "functionally done" and "shipped."

- [ ] **Step 1: Run the polish pass**

Run the `/impeccable polish app/tools/calendar/page.tsx` command (loads `PRODUCT.md`/`DESIGN.md` automatically) and address anything it flags — spacing/alignment consistency, interaction-state coverage (focus rings, hover, active/pressed), copy consistency, loading/transition smoothness.

- [ ] **Step 2: Final full-project lint**

Run: `npm run lint`
Expected: 0 errors.

- [ ] **Step 3: Commit any polish fixes**

```bash
git add -A
git commit -m "polish(calendar): pre-ship pass on Market Calendar redesign"
```

(Skip this commit entirely if the polish pass found nothing to change.)

---

## Self-Review Notes

- **Spec coverage:** every section of `2026-07-30-market-calendar-redesign-design.md` maps to a task — Architecture → Tasks 2-10 (file structure matches exactly), Data flow steps 1-6 → Tasks 3/7/9/10, Backend changes → Task 1 (with the IPO correction documented above), Visual design → Tasks 5/7/10 (today-highlight, emerald "mine" dot, hover/lift, responsive collapse, reduced-motion), Error handling → Task 10's loading skeleton + `buildDayModel`'s empty-array-safe design (a failed query's `.data` is `undefined`, and `?? []` in `useCalendarWeek` already covers it), Testing/Verification → Task 10 Step 4 + Task 11.
- **Placeholder scan:** no TBD/TODO markers; every step has real, complete code.
- **Type consistency:** `DayModel { date, mine, others, shown, moreCount, total }` is defined once in Task 2 and used with those exact field names in Tasks 3, 5, 6, 7, 9, 10 — checked for drift. `buildDayModel`'s signature `(events, weekDates, mySymbols, typeFilter)` matches its Task 3 definition and its Task 10 call site. `useCalendarWeek`'s return `{ events, isLoading }` matches its one call site in Task 10.
