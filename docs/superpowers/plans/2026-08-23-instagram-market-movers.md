# Instagram Market Movers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new daily-weekday Instagram content type — top 5 gainers / top 5 losers restricted to the S&P 500 + Nasdaq 100 universe — following the exact generate → stage → Discord-review → manual-publish pattern the `earnings_calendar`/`earnings_results` pipelines already use.

**Architecture:** New generator (`market-movers.ts`) fetches quotes for the 518-ticker `SIGNIFICANT_TICKERS` union via the existing batched `getStockQuotes`, credit-budgeted per chunk; ranks by `percent_change`; enriches the top/bottom 5 via the existing `attachCalendarMeta`; writes a short data-only caption via Claude. A new shared `MoversListSlide` render component (winners/losers, one component two call sites) slots into the existing Satori-based `slides.tsx`. `totalSlideCount`/`slideKindAt` change signature to accept the full slides object (not a bare company count) so they can express `market_movers`'s fixed 3-slide shape alongside the existing paginated shape. New GitHub Actions cron matches `check-price-moves`'s `30 21 * * 1-5` schedule exactly.

**Tech Stack:** Next.js API routes, `next/og` `ImageResponse` (Satori), Supabase (`instagram_posts`), TwelveData (`getStockQuotes`), Anthropic SDK, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-23-instagram-market-movers-design.md`

## Global Constraints

- No test framework in this repo — verification is `npm run lint` on touched files plus live manual smoke checks (this repo's existing convention: see `npm run trigger-instagram-earnings-results`, and the earnings-results commit's "Verified live against 2026-W34" precedent). Every task below substitutes a lint pass + a manual sanity step for the skill template's normal pytest cycle.
- Universe: `SIGNIFICANT_TICKERS` (S&P 500 + Nasdaq 100, 518 unique) — never `INSTAGRAM_ALLOWLIST`.
- Light theme only — reuse `BG`/`FG`/`MUTED`/`BRAND`/`BRAND_INK`/`MISSED_COLOR` constants already defined in `slides.tsx`, never introduce a dark-theme variant.
- No auto-publish for this content type (stage + Discord review only, matching `earnings_results`).
- No "why it moved" narrative — caption is data-only, no web search.
- Never use an em dash or en dash in any Claude-facing prompt or Claude-generated user-facing copy (existing house-style rule, already followed by every prompt in this pipeline).

---

## File Structure

| File | Change |
|---|---|
| `lib/instagram/content/shared.ts` | Modify — add `MARKET_DATA_DISCLAIMER`, `formatDateLabel` |
| `lib/instagram/content/schema.ts` | Modify — add `MarketMoverEntry`, `MarketMoversSlides`, `InstagramPostSlides` |
| `lib/instagram/render/slides.tsx` | Modify — `totalSlideCount`/`slideKindAt` signature change, new `SlideKind` values, new `MoversListSlide` + `MoverBar` components |
| `lib/instagram/publish.ts` | Modify — adopt new `totalSlideCount` signature |
| `app/api/instagram/render/[postId]/[slideIndex]/route.tsx` | Modify — adopt new signatures, add `market_movers` render branch |
| `app/api/cron/instagram-earnings-weekly/route.ts` | Modify — one-line `totalSlideCount` call-site update |
| `app/api/cron/instagram-earnings-results/route.ts` | Modify — one-line `totalSlideCount` call-site update |
| `lib/instagram/content/market-movers.ts` | Create — the generator |
| `app/api/cron/market-movers-daily/route.ts` | Create — the generation cron |
| `.github/workflows/cron-market-movers.yml` | Create — the schedule |
| `scripts/trigger-market-movers.ts` | Create — local manual trigger |
| `package.json` | Modify — add `trigger-market-movers` script |

---

### Task 1: Shared copy helpers

**Files:**
- Modify: `lib/instagram/content/shared.ts`

**Interfaces:**
- Produces: `MARKET_DATA_DISCLAIMER: string`, `formatDateLabel(dateStr: string): string`

- [ ] **Step 1: Add the new constant and function**

Append to the end of `lib/instagram/content/shared.ts`:

```ts
/**
 * Sibling to FIXED_DISCLAIMER, for content types built from BullPen's own
 * live price data rather than gathered report dates — market-movers.ts
 * doesn't touch anything Claude-sourced or third-party-report-date-based,
 * so FIXED_DISCLAIMER's "Report dates gathered from public sources" wording
 * doesn't apply.
 */
export const MARKET_DATA_DISCLAIMER = 'Not financial advice. Prices and % changes as of market close.';

/** Single-date sibling to formatWeekLabel, e.g. "Aug 24, 2026". Same
 *  UTC-noon-anchor trick as formatDateHeader in slides.tsx, so a plain
 *  YYYY-MM-DD string never shifts a day under a server's local timezone. */
export function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
```

- [ ] **Step 2: Lint**

Run: `npx eslint lib/instagram/content/shared.ts`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/instagram/content/shared.ts
git commit -m "feat: add market-data disclaimer and single-date label helper for Instagram content"
```

---

### Task 2: Schema types

**Files:**
- Modify: `lib/instagram/content/schema.ts`

**Interfaces:**
- Produces: `MarketMoverEntry`, `MarketMoversSlides`, `InstagramPostSlides` (type alias: `EarningsCalendarSlides | EarningsResultsSlides | MarketMoversSlides`)

- [ ] **Step 1: Add the new types**

Append to the end of `lib/instagram/content/schema.ts`:

```ts
/**
 * One Market Movers row — real TwelveData quote data only, never
 * LLM-derived. Shape stored verbatim in instagram_posts.slides for the
 * 'market_movers' content type.
 */
export interface MarketMoverEntry {
  symbol: string;
  name: string;
  changePercent: number; // signed: +13.70 or -8.60
  price: number;
  logoUrl: string | null;
}

export interface MarketMoversSlides {
  contentType: 'market_movers';
  dateLabel: string; // e.g. "Aug 24, 2026"
  winners: MarketMoverEntry[]; // exactly 5, sorted descending by changePercent
  losers: MarketMoverEntry[]; // exactly 5, sorted ascending by changePercent (most negative first)
  caption: string;
}

/** Every shape instagram_posts.slides can hold, keyed by contentType. */
export type InstagramPostSlides = EarningsCalendarSlides | EarningsResultsSlides | MarketMoversSlides;
```

- [ ] **Step 2: Lint**

Run: `npx eslint lib/instagram/content/schema.ts`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/instagram/content/schema.ts
git commit -m "feat: add MarketMoversSlides schema and InstagramPostSlides union type"
```

---

### Task 3: Extend slide-count/kind plumbing to support market_movers (all call sites)

This is one atomic task, not split further — `totalSlideCount`/`slideKindAt` changing signature and their 4 call sites updating are not independently reviewable; leaving any call site on the old signature breaks that route at runtime (a bare number passed where `InstagramPostSlides` is expected does not have `.contentType`, so `slides.contentType === 'market_movers'` is always false and the code falls through to `slides.companies.length` on a number, throwing).

**Files:**
- Modify: `lib/instagram/render/slides.tsx`
- Modify: `lib/instagram/publish.ts`
- Modify: `app/api/cron/instagram-earnings-weekly/route.ts`
- Modify: `app/api/cron/instagram-earnings-results/route.ts`

**Interfaces:**
- Consumes: `InstagramPostSlides` (Task 2)
- Produces: `totalSlideCount(slides: InstagramPostSlides): number`, `slideKindAt(index: number, slides: InstagramPostSlides): SlideKind` where `SlideKind = 'hook' | 'list' | 'cta' | 'winners' | 'losers'`

- [ ] **Step 1: Update `slides.tsx`'s `SlideKind` type and import**

Add `MarketMoversSlides` and `InstagramPostSlides` to the existing type import at the top of `lib/instagram/render/slides.tsx`:

```ts
import type {
  EarningsSlideCompany,
  EarningsCalendarSlides,
  EarningsResultCompany,
  EarningsResultsSlides,
  MarketMoversSlides,
  InstagramPostSlides,
} from '@/lib/instagram/content/schema';
```

Change:

```ts
export type SlideKind = 'hook' | 'list' | 'cta';
```

to:

```ts
export type SlideKind = 'hook' | 'list' | 'cta' | 'winners' | 'losers';
```

- [ ] **Step 2: Rewrite `totalSlideCount` and `slideKindAt`**

Replace:

```ts
/** Total slide count for a given company count: hook + list page(s) + CTA. */
export function totalSlideCount(companyCount: number): number {
  return 1 + listSlideCount(companyCount) + 1;
}

/** Which kind of slide a given 0-indexed slide position is. */
export function slideKindAt(index: number, companyCount: number): SlideKind {
  const lists = listSlideCount(companyCount);
  if (index === 0) return 'hook';
  if (index === lists + 1) return 'cta';
  return 'list';
}
```

with:

```ts
/** Total slide count for a given post. market_movers is always a fixed 3
 *  slides (winners, losers, cta); earnings_calendar/earnings_results
 *  paginate their company list across a hook, 1+ list slides, and a CTA. */
export function totalSlideCount(slides: InstagramPostSlides): number {
  if (slides.contentType === 'market_movers') return 3;
  return 1 + listSlideCount(slides.companies.length) + 1;
}

/** Which kind of slide a given 0-indexed slide position is, for a given post. */
export function slideKindAt(index: number, slides: InstagramPostSlides): SlideKind {
  if (slides.contentType === 'market_movers') {
    if (index === 0) return 'winners';
    if (index === 1) return 'losers';
    return 'cta';
  }
  const lists = listSlideCount(slides.companies.length);
  if (index === 0) return 'hook';
  if (index === lists + 1) return 'cta';
  return 'list';
}
```

- [ ] **Step 3: Update `altTextForSlide`'s type signature**

`altTextForSlide` already takes the full slides object (not a bare count), so only its parameter type needs widening. Change:

```ts
export function altTextForSlide(
  content: EarningsCalendarSlides | EarningsResultsSlides,
  slideIndex: number
): string {
```

to:

```ts
export function altTextForSlide(
  content: InstagramPostSlides,
  slideIndex: number
): string {
```

Inside the function body, add a `market_movers` branch before the existing `isResults` logic — insert right after the `kind` lookup:

```ts
export function altTextForSlide(
  content: InstagramPostSlides,
  slideIndex: number
): string {
  if (content.contentType === 'market_movers') {
    const kind = slideKindAt(slideIndex, content);
    if (kind === 'winners') return `Today's top S&P 500 and Nasdaq 100 gainers on BullPen: ${content.winners.map((w) => w.symbol).join(', ')}.`;
    if (kind === 'losers') return `Today's top S&P 500 and Nasdaq 100 losers on BullPen: ${content.losers.map((l) => l.symbol).join(', ')}.`;
    return 'Open the BullPen app to track every S&P 500 and Nasdaq 100 stock in real time.';
  }
  const kind = slideKindAt(slideIndex, content);
  const isResults = content.contentType === 'earnings_results';
  if (kind === 'hook') {
    return isResults
      ? `${content.headline} Earnings results for the week of ${content.weekLabel} on BullPen.`
      : `${content.headline} Earnings calendar for the week of ${content.weekLabel} on BullPen.`;
  }
  if (kind === 'cta') {
    return isResults
      ? 'Open the BullPen app to see the full earnings results recap and track these stocks.'
      : 'Open the BullPen app to see the full earnings calendar and set alerts for these stocks.';
  }
  const tickers = content.companies.map((c) => c.symbol).join(', ');
  return isResults
    ? `Earnings results for the week of ${content.weekLabel}: ${tickers}.`
    : `Companies reporting earnings the week of ${content.weekLabel}: ${tickers}.`;
}
```

(This replaces the whole existing function body — the old body's `const kind = slideKindAt(slideIndex, content.companies.length);` line and the `isResults` declaration both move/change as shown.)

- [ ] **Step 4: Update `lib/instagram/publish.ts`**

Change the import:

```ts
import { totalSlideCount, altTextForSlide } from '@/lib/instagram/render/slides';
```
stays the same (names unchanged, only their signatures changed).

Change the type import and the `InstagramPostRow` interface:

```ts
import type { EarningsCalendarSlides, EarningsResultsSlides } from '@/lib/instagram/content/schema';
```

to:

```ts
import type { InstagramPostSlides } from '@/lib/instagram/content/schema';
```

```ts
interface InstagramPostRow {
  id: string;
  status: string;
  caption: string;
  slides: EarningsCalendarSlides | EarningsResultsSlides;
  content_type: string;
  period_key: string;
}
```

to:

```ts
interface InstagramPostRow {
  id: string;
  status: string;
  caption: string;
  slides: InstagramPostSlides;
  content_type: string;
  period_key: string;
}
```

Change:

```ts
  const slideCount = totalSlideCount(post.slides.companies.length);
```

to:

```ts
  const slideCount = totalSlideCount(post.slides);
```

- [ ] **Step 5: Update `app/api/cron/instagram-earnings-weekly/route.ts`**

Change:

```ts
  const slideCount = totalSlideCount(content.companies.length);
```

to:

```ts
  const slideCount = totalSlideCount(content);
```

- [ ] **Step 6: Update `app/api/cron/instagram-earnings-results/route.ts`**

Change:

```ts
  const slideCount = totalSlideCount(content.companies.length);
```

to:

```ts
  const slideCount = totalSlideCount(content);
```

- [ ] **Step 7: Lint all five touched files**

Run: `npx eslint lib/instagram/render/slides.tsx lib/instagram/publish.ts app/api/cron/instagram-earnings-weekly/route.ts app/api/cron/instagram-earnings-results/route.ts`
Expected: no errors.

- [ ] **Step 8: Manual sanity check — confirm the earnings pipelines still compute correctly**

Run:
```bash
npx tsx -e "
import { totalSlideCount, slideKindAt } from './lib/instagram/render/slides';
const fakeCalendar = { contentType: 'earnings_calendar', headline: 'h', weekLabel: 'w', companies: new Array(24).fill({ symbol: 'X' }), overflowCount: 0, caption: 'c' } as any;
console.log('calendar total (24 companies):', totalSlideCount(fakeCalendar));
console.log('calendar kind[0]:', slideKindAt(0, fakeCalendar));
console.log('calendar kind[last]:', slideKindAt(totalSlideCount(fakeCalendar) - 1, fakeCalendar));
const fakeMovers = { contentType: 'market_movers', dateLabel: 'd', winners: [], losers: [], caption: 'c' } as any;
console.log('movers total:', totalSlideCount(fakeMovers));
console.log('movers kinds:', [0, 1, 2].map((i) => slideKindAt(i, fakeMovers)));
"
```
Expected output: `calendar total (24 companies): 3` (1 hook + 1 list slide since 24 <= COMPANIES_PER_LIST_SLIDE=30 + 1 cta), `calendar kind[0]: hook`, `calendar kind[last]: cta`, `movers total: 3`, `movers kinds: [ 'winners', 'losers', 'cta' ]`.

- [ ] **Step 9: Commit**

```bash
git add lib/instagram/render/slides.tsx lib/instagram/publish.ts app/api/cron/instagram-earnings-weekly/route.ts app/api/cron/instagram-earnings-results/route.ts
git commit -m "refactor: widen totalSlideCount/slideKindAt to take the full slides object

Needed so a fixed-shape content type (market_movers: always winners+losers+cta,
no hook, no pagination) can coexist with the existing paginated
hook+list+cta shape earnings_calendar/earnings_results use. All 4 call
sites updated in the same commit since a partial rollout would pass a bare
number where the function now expects the slides object."
```

---

### Task 4: MoversListSlide render component

**Files:**
- Modify: `lib/instagram/render/slides.tsx`

**Interfaces:**
- Consumes: `MarketMoverEntry` (Task 2), existing `BRAND`/`MISSED_COLOR`/`BG`/`FG`/`MUTED`/`BRAND_INK` constants, existing `Wordmark`/`SlideIndicator`/`CompanyBadge` components (all already defined earlier in this same file)
- Produces: `MoversListSlide({ title, subtitle, entries, positive, slideIndex, totalSlides })` — exported component

- [ ] **Step 1: Add the component**

Insert into `lib/instagram/render/slides.tsx`, after the closing brace of `EarningsResultsListSlide` and before the `BellIcon` function (i.e. before the CTA-slide-only icon section):

```tsx
// ── Market Movers (winners/losers) slide elements ──────────────────────────
// One component, two call sites (winners=positive, losers=!positive) — see
// MarketMoversSlides handling in the render route. Opens the carousel
// itself (no separate hook slide, per the reference design this was built
// from) rather than following the hook->list->cta shape the earnings posts
// use, since a fixed 5-row list needs no pagination.

/** Fixed track width for the % bar badge, sized to comfortably fit a
 *  5-character label ("+13.70%") inside even a floored 20%-width bar. */
const MOVER_BAR_TRACK_WIDTH = 380;
const MOVER_BAR_HEIGHT = 56;
/** Floor so the smallest mover's bar (relative to the largest on the same
 *  slide) never shrinks to an illegibly thin sliver. */
const MOVER_BAR_MIN_FRACTION = 0.2;

/** One winner/loser row's % badge — a filled, rounded-rect bar whose width
 *  scales with the move's size relative to the largest mover on the same
 *  slide, label right-aligned inside the fill. Both direction colors are
 *  meaningful here (gain vs loss), the same case DESIGN.md's One Signal
 *  Rule already carves out — see this file's header comment on
 *  MISSED_COLOR, which is reused here rather than defining a new red. */
function MoverBar({ changePercent, maxAbs, positive }: { changePercent: number; maxAbs: number; positive: boolean }) {
  const fraction = Math.max(MOVER_BAR_MIN_FRACTION, maxAbs > 0 ? Math.abs(changePercent) / maxAbs : MOVER_BAR_MIN_FRACTION);
  const width = Math.round(fraction * MOVER_BAR_TRACK_WIDTH);
  const color = positive ? BRAND : MISSED_COLOR;
  const sign = changePercent >= 0 ? '+' : '';
  return (
    <div style={{ display: 'flex', width: MOVER_BAR_TRACK_WIDTH, height: MOVER_BAR_HEIGHT, justifyContent: 'flex-end' }}>
      <div
        style={{
          display: 'flex', width, height: MOVER_BAR_HEIGHT, borderRadius: 10,
          backgroundColor: color, alignItems: 'center', justifyContent: 'flex-end',
          padding: '0 18px',
        }}
      >
        <span style={{ display: 'flex', fontFamily: 'Geist Mono', fontWeight: 700, fontSize: 24, color: positive ? BRAND_INK : '#ffffff' }}>
          {sign}{changePercent.toFixed(2)}%
        </span>
      </div>
    </div>
  );
}

interface MoversListSlideProps {
  title: string;
  subtitle: string;
  entries: MarketMoverEntry[];
  positive: boolean;
  slideIndex: number;
  totalSlides: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function MoversListSlide({ title, subtitle, entries, positive, slideIndex, totalSlides }: MoversListSlideProps): any {
  const maxAbs = Math.max(...entries.map((e) => Math.abs(e.changePercent)), 0.01);
  return (
    <div
      style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        padding: 80, backgroundColor: BG, color: FG,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Wordmark />
        <SlideIndicator index={slideIndex} total={totalSlides} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 40 }}>
        <div style={{ display: 'flex', fontFamily: 'Instrument Serif', fontStyle: 'italic', fontSize: 72, color: FG, marginBottom: 12 }}>
          {title}
        </div>
        <div style={{ display: 'flex', fontFamily: 'Geist Mono', fontSize: 22, color: MUTED }}>
          {subtitle}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {entries.map((entry) => (
          <div key={entry.symbol} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <CompanyBadge symbol={entry.symbol} logoUrl={entry.logoUrl} size={52} />
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
                <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 32, color: FG }}>
                  {entry.symbol}
                </span>
                <span style={{ display: 'flex', fontFamily: 'Geist', fontSize: 22, color: MUTED }}>
                  {entry.name}
                </span>
              </div>
            </div>
            <MoverBar changePercent={entry.changePercent} maxAbs={maxAbs} positive={positive} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Lint**

Run: `npx eslint lib/instagram/render/slides.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/instagram/render/slides.tsx
git commit -m "feat: add MoversListSlide render component for Instagram market movers"
```

---

### Task 5: Market Movers content generator

**Files:**
- Create: `lib/instagram/content/market-movers.ts`

**Interfaces:**
- Consumes: `MarketMoversSlides`, `MarketMoverEntry` (Task 2), `MARKET_DATA_DISCLAIMER`, `formatDateLabel` (Task 1), existing `FIXED_HASHTAGS`, `parseHookAndCaption` (`./schema`), existing `getStockQuotes`, `withRateLimitRetry` (`@/lib/twelvedata/twelvedata-client`), `waitForCronCreditBudget` (`@/lib/twelvedata/credit-budget`), `SIGNIFICANT_TICKERS` (`@/lib/market-data/significant-tickers`), `attachCalendarMeta` (`@/lib/market-data/calendar-market-cap`), `logAiCall` (`@/lib/billing/log-ai-call`)
- Produces: `generateMarketMoversContent(dateET: string): Promise<MarketMoversSlides>`

- [ ] **Step 1: Write the file**

```ts
/**
 * Market Movers content for the automated Instagram pipeline — today's top
 * 5 gainers and top 5 losers, restricted to the S&P 500 + Nasdaq 100
 * universe (SIGNIFICANT_TICKERS), NOT the broader INSTAGRAM_ALLOWLIST the
 * earnings posts use — a random small-cap's 100% pop isn't relevant to a
 * general audience the way a Nasdaq-100 name's 8% move is.
 *
 * WHICH stocks moved, and by how much, comes entirely from BullPen's own
 * TwelveData quotes (getStockQuotes's percent_change field) — never
 * web-searched or LLM-derived, unlike the earnings posts' report dates
 * (which BullPen doesn't own the data for). Company name + logo come from
 * attachCalendarMeta, the same cached screener_stats-backed lookup
 * earnings-calendar.ts uses.
 *
 * Always returns content — unlike the earnings generators, there is no
 * "quiet week, skip posting" case: with 518 tickers there's always a real
 * top 5/top 5 by rank.
 *
 * Claude never produces the ranking or the % numbers, only the caption
 * copy, grounded in the real list already computed above — same
 * "real data first, Claude only writes copy" rule as every other generator
 * in this pipeline.
 *
 * Claude cost: one short, non-web-search call (~$0.01/run) — see
 * lib/billing/log-ai-call.ts for where it's logged (feature:
 * 'instagram_content').
 */

import Anthropic from '@anthropic-ai/sdk';
import { getStockQuotes, withRateLimitRetry } from '@/lib/twelvedata/twelvedata-client';
import { waitForCronCreditBudget } from '@/lib/twelvedata/credit-budget';
import { SIGNIFICANT_TICKERS } from '@/lib/market-data/significant-tickers';
import { attachCalendarMeta } from '@/lib/market-data/calendar-market-cap';
import { logAiCall } from '@/lib/billing/log-ai-call';
import { parseHookAndCaption } from './schema';
import { MARKET_DATA_DISCLAIMER, FIXED_HASHTAGS, formatDateLabel } from './shared';
import type { MarketMoversSlides, MarketMoverEntry } from './schema';

const MODEL = 'claude-sonnet-4-6';
/** TwelveData /batch-safe chunk size — matches SEED_CHUNK in
 *  lib/market-data/seed-prices.ts and BATCH_CHUNK in
 *  app/api/quotes/batch/route.ts. */
const QUOTE_CHUNK_SIZE = 100;
const CREDITS_PER_QUOTE = 1;
const TOP_N = 5;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You write short, punchy Instagram copy for BullPen, a financial app for beginner-to-intermediate investors.

Voice: confident, clear, never hype-y. No emoji spam (0-1 max, only if it genuinely fits). Never use an em dash (—) or en dash (–) to connect clauses; use a period or comma instead.

DATA FIDELITY (critical): you are given today's real top 5 gainers and top 5 losers from the S&P 500 and Nasdaq 100. Use ONLY those company names, tickers, and % changes. Do not add, invent, or imply any other company or number, and do not speculate about WHY any stock moved. State only that it moved.

Output ONLY a JSON object with exactly two fields, nothing else, no markdown fences:
{
  "headline": "a punchy hook under 10 words, no ticker required",
  "caption": "a 2-3 sentence Instagram caption naming the day's single biggest gainer and biggest loser with their exact % change, ending with a soft call to action to check the full movers list on BullPen"
}`;

interface RankedQuote {
  symbol: string;
  changePercent: number;
  price: number;
}

interface MoverMetaInput {
  symbol: string;
  name?: string;
}

/**
 * Fetches a live quote for every S&P 500 + Nasdaq 100 ticker, chunked and
 * credit-budgeted the same way prefetch-market-data / screener-stats.ts /
 * calendar-days.ts do — 518 credits total exceeds CRON_CREDIT_SHARE (400)
 * in one unthrottled burst, so each 100-ticker chunk reserves before firing.
 * Sequential, not Promise.all, so chunks don't all queue on the shared
 * per-minute reservation counter simultaneously.
 */
async function fetchRankedQuotes(): Promise<RankedQuote[]> {
  const symbols = [...SIGNIFICANT_TICKERS];
  const ranked: RankedQuote[] = [];

  for (let i = 0; i < symbols.length; i += QUOTE_CHUNK_SIZE) {
    const chunk = symbols.slice(i, i + QUOTE_CHUNK_SIZE);
    await waitForCronCreditBudget(chunk.length * CREDITS_PER_QUOTE);
    try {
      const quotes = await withRateLimitRetry(() => getStockQuotes(chunk));
      for (const [symbol, quote] of quotes.entries()) {
        if (!quote || quote.c <= 0 || !isFinite(quote.dp)) continue;
        ranked.push({ symbol, changePercent: quote.dp, price: quote.c });
      }
    } catch (err) {
      console.error(`[market-movers] quote chunk failed (${chunk[0]}..${chunk[chunk.length - 1]}):`, err);
      // Non-fatal — other chunks still contribute to the ranking.
    }
  }

  return ranked;
}

async function writeCaption(
  winners: MarketMoverEntry[],
  losers: MarketMoverEntry[],
  dateLabel: string
): Promise<string> {
  const listText = [
    'Winners:',
    ...winners.map((w) => `- ${w.symbol} (${w.name}): +${w.changePercent.toFixed(2)}%`),
    'Losers:',
    ...losers.map((l) => `- ${l.symbol} (${l.name}): ${l.changePercent.toFixed(2)}%`),
  ].join('\n');

  const userPrompt = `${dateLabel}. Today's S&P 500 + Nasdaq 100 movers (use ONLY these):\n${listText}\n\nWrite the headline and caption now.`;

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  void logAiCall({
    userId: null,
    feature: 'instagram_content',
    model: MODEL,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    metadata: { contentType: 'market_movers', dateLabel },
  });

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude returned no text content for market-movers caption');
  }

  // headline is intentionally discarded — market_movers has no hook slide
  // to put it on (see MarketMoversSlides), but the prompt still asks for
  // it to reuse the exact same HookAndCaptionSchema/parseHookAndCaption
  // every other generator in this pipeline already validates against,
  // rather than adding a second near-duplicate schema for one field.
  const { caption } = parseHookAndCaption(textBlock.text);
  return `${caption}\n\n${MARKET_DATA_DISCLAIMER}\n\n${FIXED_HASHTAGS}`;
}

/**
 * Builds the full slide content for today's Market Movers carousel. Real
 * data first, Claude second, grounded in that data — see file header.
 */
export async function generateMarketMoversContent(dateET: string): Promise<MarketMoversSlides> {
  const ranked = await fetchRankedQuotes();

  const winnersRanked = [...ranked].sort((a, b) => b.changePercent - a.changePercent).slice(0, TOP_N);
  const losersRanked = [...ranked].sort((a, b) => a.changePercent - b.changePercent).slice(0, TOP_N);

  const winnersInput: MoverMetaInput[] = winnersRanked.map((r) => ({ symbol: r.symbol }));
  const losersInput: MoverMetaInput[] = losersRanked.map((r) => ({ symbol: r.symbol }));
  const [winnersMeta, losersMeta] = await Promise.all([
    attachCalendarMeta(winnersInput),
    attachCalendarMeta(losersInput),
  ]);

  const toEntry = (r: RankedQuote, meta: MoverMetaInput & { logo_url: string | null }): MarketMoverEntry => ({
    symbol: r.symbol,
    name: meta.name ?? r.symbol,
    changePercent: r.changePercent,
    price: r.price,
    logoUrl: meta.logo_url,
  });

  const winners = winnersRanked.map((r, i) => toEntry(r, winnersMeta[i]));
  const losers = losersRanked.map((r, i) => toEntry(r, losersMeta[i]));

  const dateLabel = formatDateLabel(dateET);
  const caption = await writeCaption(winners, losers, dateLabel);

  return {
    contentType: 'market_movers',
    dateLabel,
    winners,
    losers,
    caption,
  };
}
```

- [ ] **Step 2: Lint**

Run: `npx eslint lib/instagram/content/market-movers.ts`
Expected: no errors.

- [ ] **Step 3: Manual sanity check against real TwelveData + Supabase**

Run:
```bash
npx tsx -e "
import { config } from 'dotenv';
config({ path: '.env.local' });
import { generateMarketMoversContent } from './lib/instagram/content/market-movers';
generateMarketMoversContent('2026-08-24').then((r) => {
  console.log('dateLabel:', r.dateLabel);
  console.log('winners:', r.winners.map((w) => \`\${w.symbol} +\${w.changePercent.toFixed(2)}%\`));
  console.log('losers:', r.losers.map((l) => \`\${l.symbol} \${l.changePercent.toFixed(2)}%\`));
  console.log('caption:', r.caption);
}).catch((e) => { console.error(e); process.exit(1); });
"
```
Expected: exactly 5 winners (descending %, all positive on a normal day) and 5 losers (ascending %, all negative on a normal day), every symbol a recognizable S&P 500 / Nasdaq 100 name, a non-empty caption ending with the disclaimer and hashtags, no thrown error. This call costs real TwelveData credits (~518) and one Claude call (~$0.01) — run it once, not repeatedly.

- [ ] **Step 4: Commit**

```bash
git add lib/instagram/content/market-movers.ts
git commit -m "feat: add Market Movers Instagram content generator

Ranks S&P 500 + Nasdaq 100 by live TwelveData percent_change, credit-budgeted
per 100-ticker chunk against the shared cron reservation counter (518 credits
total exceeds the 400-credit cron share in one burst). Verified live against
2026-08-24: 5 winners, 5 losers, real symbols, non-empty caption."
```

---

### Task 6: Wire the render route for market_movers

**Files:**
- Modify: `app/api/instagram/render/[postId]/[slideIndex]/route.tsx`

**Interfaces:**
- Consumes: `totalSlideCount`, `slideKindAt` (Task 3), `MoversListSlide` (Task 4), `InstagramPostSlides` (Task 2)

- [ ] **Step 1: Replace the whole file**

```tsx
/**
 * GET /api/instagram/render/[postId]/[slideIndex]
 *
 * Renders one slide of a staged Instagram post as a PNG. This is the URL
 * Instagram's own Graph API servers fetch (as `image_url`) when building a
 * media container — see lib/instagram/client.ts. Same technique as
 * app/api/og/share/[id]/route.tsx: next/og's ImageResponse, Node runtime.
 *
 * Only serves 'ready' or 'published' posts — a 'draft'/'failed' row (still
 * mid-generation, or one that never got reviewed) 404s, so nothing
 * unreviewed is ever publicly fetchable by slide URL alone.
 */

import { ImageResponse } from 'next/og';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import {
  SLIDE_WIDTH,
  SLIDE_HEIGHT,
  COMPANIES_PER_LIST_SLIDE,
  loadSlideFonts,
  slideKindAt,
  totalSlideCount,
  HookSlide,
  EarningsListSlide,
  EarningsResultsListSlide,
  MoversListSlide,
  CTASlide,
} from '@/lib/instagram/render/slides';
import type { EarningsCalendarSlides, EarningsResultsSlides, InstagramPostSlides } from '@/lib/instagram/content/schema';

export const runtime = 'nodejs';

interface InstagramPostRow {
  status: string;
  content_type: string;
  slides: unknown;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ postId: string; slideIndex: string }> }
): Promise<Response> {
  const { postId, slideIndex: slideIndexParam } = await context.params;
  const slideIndex = parseInt(slideIndexParam, 10);
  if (!Number.isFinite(slideIndex) || slideIndex < 0) {
    return NextResponse.json({ error: 'invalid_slide_index' }, { status: 400 });
  }

  const supabase = createServerClient();
  // instagram_posts is new — the generated Supabase Database type doesn't
  // carry it yet, so an untyped select infers as `never` (same issue
  // lib/ai/picks/ground-candidates.ts hit for screener_universe; same fix
  // app/api/screener/refresh/route.ts uses for screener_universe writes).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: post } = await db
    .from('instagram_posts')
    .select('status, content_type, slides')
    .eq('id', postId)
    .maybeSingle() as { data: InstagramPostRow | null };

  if (!post || (post.status !== 'ready' && post.status !== 'published')) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  if (
    post.content_type !== 'earnings_calendar' &&
    post.content_type !== 'earnings_results' &&
    post.content_type !== 'market_movers'
  ) {
    // Only content types built so far — a future content type would branch here.
    return NextResponse.json({ error: 'unsupported_content_type' }, { status: 500 });
  }

  const slides = post.slides as unknown as InstagramPostSlides;
  const total = totalSlideCount(slides);
  if (slideIndex >= total) {
    return NextResponse.json({ error: 'slide_index_out_of_range' }, { status: 404 });
  }

  const fonts = await loadSlideFonts();
  const kind = slideKindAt(slideIndex, slides);

  let element: React.ReactElement;
  if (slides.contentType === 'market_movers') {
    if (kind === 'winners') {
      element = (
        <MoversListSlide
          title="Daily Winners"
          subtitle={`S&P 500 & Nasdaq 100 · ${slides.dateLabel}`}
          entries={slides.winners}
          positive
          slideIndex={slideIndex}
          totalSlides={total}
        />
      );
    } else if (kind === 'losers') {
      element = (
        <MoversListSlide
          title="Daily Losers"
          subtitle={`S&P 500 & Nasdaq 100 · ${slides.dateLabel}`}
          entries={slides.losers}
          positive={false}
          slideIndex={slideIndex}
          totalSlides={total}
        />
      );
    } else {
      element = <CTASlide slideIndex={slideIndex} totalSlides={total} />;
    }
  } else {
    const isResults = slides.contentType === 'earnings_results';
    const companyCount = slides.companies.length;

    if (kind === 'hook') {
      const pillText = isResults
        ? `${(slides as EarningsResultsSlides).beatCount} OF ${companyCount} BEAT ESTIMATES`
        : undefined;
      element = (
        <HookSlide
          headline={slides.headline}
          weekLabel={slides.weekLabel}
          companyCount={companyCount}
          slideIndex={slideIndex}
          totalSlides={total}
          pillText={pillText}
        />
      );
    } else if (kind === 'cta') {
      element = <CTASlide slideIndex={slideIndex} totalSlides={total} />;
    } else {
      const listSlideIdx = slideIndex - 1;
      const pageCompanies = slides.companies.slice(
        listSlideIdx * COMPANIES_PER_LIST_SLIDE,
        (listSlideIdx + 1) * COMPANIES_PER_LIST_SLIDE
      );
      element = isResults ? (
        <EarningsResultsListSlide
          companies={pageCompanies as EarningsResultsSlides['companies']}
          overflowCount={slides.overflowCount}
          slideIndex={slideIndex}
          totalSlides={total}
        />
      ) : (
        <EarningsListSlide
          companies={pageCompanies as EarningsCalendarSlides['companies']}
          overflowCount={slides.overflowCount}
          slideIndex={slideIndex}
          totalSlides={total}
        />
      );
    }
  }

  return new ImageResponse(element, {
    width: SLIDE_WIDTH,
    height: SLIDE_HEIGHT,
    fonts,
    // 1 hour — see the 2026-08-17 mascot z-index bug this comment already
    // documents in git history: a same-URL cache with no version key meant
    // a code fix silently never took effect for an already-cached post.
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
```

- [ ] **Step 2: Lint**

Run: `npx eslint "app/api/instagram/render/[postId]/[slideIndex]/route.tsx"`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/api/instagram/render/[postId]/[slideIndex]/route.tsx"
git commit -m "feat: render market_movers slides (winners/losers/cta) in the Instagram slide route"
```

---

### Task 7: Market Movers generation cron route

**Files:**
- Create: `app/api/cron/market-movers-daily/route.ts`

**Interfaces:**
- Consumes: `generateMarketMoversContent` (Task 5), `totalSlideCount` (Task 3)

- [ ] **Step 1: Write the file**

```ts
/**
 * Instagram Market Movers Daily Generation Cron
 * GET /api/cron/market-movers-daily
 *
 * Runs weekdays at 21:30 UTC, after US market close (see
 * .github/workflows/cron-market-movers.yml — same schedule as
 * check-price-moves, chosen for the same "reliably after close in both
 * EDT/EST" reason; nothing in this codebase hardcodes a fixed UTC close
 * time). Generates today's top-5-gainers/top-5-losers carousel (S&P 500 +
 * Nasdaq 100 only), stages it in instagram_posts (status: 'ready'), and
 * posts a Discord preview — no auto-publish yet, same review-then-manual-
 * publish flow as instagram-earnings-results. This route itself never
 * calls the Instagram API.
 *
 * Idempotent per ET trading day (period_key), scoped to this content_type.
 * Unlike the earnings posts, there is no "skip if nothing happened" case —
 * there's always a top 5/top 5 by rank, so this always stages a post.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logSecurityEvent } from '@/lib/security/security-events';
import { createServerClient } from '@/lib/supabase/client';
import { generateMarketMoversContent } from '@/lib/instagram/content/market-movers';
import { totalSlideCount } from '@/lib/instagram/render/slides';
import { postToDiscord } from '@/lib/discord/post-message';
import { instagramBioLink } from '@/lib/instagram/utm-link';
import type { MarketMoversSlides } from '@/lib/instagram/content/schema';

export const maxDuration = 60;

const CONTENT_TYPE = 'market_movers';

/** Today's date in ET as YYYY-MM-DD — the daily idempotency key for this
 *  content type, sibling to isoWeekKey's weekly key for the earnings posts.
 *  en-CA locale formats as YYYY-MM-DD directly, no manual reformatting. */
function todayEtDateKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/market-movers-daily' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any; // instagram_posts isn't in the generated Database type yet

  const periodKey = todayEtDateKey();

  // ── Idempotency ──────────────────────────────────────────────────────────
  const { data: existing } = await db
    .from('instagram_posts')
    .select('id, status')
    .eq('content_type', CONTENT_TYPE)
    .eq('period_key', periodKey)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ success: true, skipped: true, periodKey, reason: 'already_exists', status: existing.status });
  }

  // ── Generate ─────────────────────────────────────────────────────────────
  let content: MarketMoversSlides;
  try {
    content = await generateMarketMoversContent(periodKey);
  } catch (err) {
    console.error('[market-movers-daily] content generation failed:', err);
    return NextResponse.json(
      { success: false, error: 'content_generation_failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }

  // ── Persist ──────────────────────────────────────────────────────────────
  const { data: inserted, error: insertError } = await db
    .from('instagram_posts')
    .insert({
      content_type: CONTENT_TYPE,
      period_key: periodKey,
      status: 'ready',
      slides: content,
      caption: content.caption,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    console.error('[market-movers-daily] insert failed:', insertError);
    return NextResponse.json({ success: false, error: insertError?.message ?? 'insert_failed' }, { status: 500 });
  }

  const postId = inserted.id as string;

  // ── Review notification ─────────────────────────────────────────────────
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bullpen.no';
  const slideCount = totalSlideCount(content);
  const previewLinks = Array.from({ length: slideCount }, (_, i) =>
    `[Slide ${i + 1}](${appUrl}/api/instagram/render/${postId}/${i})`
  ).join(' · ');

  const bioLink = instagramBioLink(CONTENT_TYPE, periodKey);
  const topGainer = content.winners[0];
  const topLoser = content.losers[0];

  const webhookUrl = process.env.DISCORD_INSTAGRAM_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      await postToDiscord(webhookUrl, {
        embeds: [
          {
            title: `Market movers ready for review — ${content.dateLabel}`,
            description: `Top gainer: ${topGainer.symbol} +${topGainer.changePercent.toFixed(2)}%. Top loser: ${topLoser.symbol} ${topLoser.changePercent.toFixed(2)}%. ${slideCount} slides.\n\n${previewLinks}\n\n**Caption:**\n${content.caption}`,
            color: 0x34d399,
            fields: [
              { name: 'Publish', value: `\`npm run instagram-publish -- --id=${postId}\`` },
              { name: 'Bio link (if publishing)', value: bioLink },
            ],
            timestamp: new Date().toISOString(),
          },
        ],
      });
    } catch (err) {
      // Never fail the cron over a notification failure — the row is already
      // staged and can still be published manually by id.
      console.error('[market-movers-daily] Discord notification failed:', err);
    }
  } else {
    console.warn('[market-movers-daily] DISCORD_INSTAGRAM_WEBHOOK_URL not set, skipping review notification');
  }

  return NextResponse.json({
    success: true,
    postId,
    periodKey,
    dateLabel: content.dateLabel,
    topGainer: `${topGainer.symbol} +${topGainer.changePercent.toFixed(2)}%`,
    topLoser: `${topLoser.symbol} ${topLoser.changePercent.toFixed(2)}%`,
    slideCount,
  });
}
```

- [ ] **Step 2: Lint**

Run: `npx eslint app/api/cron/market-movers-daily/route.ts`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/cron/market-movers-daily/route.ts
git commit -m "feat: add Market Movers Instagram generation cron route"
```

---

### Task 8: GitHub Actions schedule, trigger script, npm entry

**Files:**
- Create: `.github/workflows/cron-market-movers.yml`
- Create: `scripts/trigger-market-movers.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `GET /api/cron/market-movers-daily` (Task 7)

- [ ] **Step 1: Write the GitHub Actions workflow**

```yaml
name: Cron — Instagram Market Movers

# Weekdays at 21:30 UTC (post US market close) — same schedule as
# check-price-moves, chosen for the same reason (reliably after close in
# both EDT/EST; nothing in this codebase hardcodes a fixed UTC close time).
# Generates + stages today's top-5-gainers/top-5-losers carousel (S&P 500 +
# Nasdaq 100 only) and posts a Discord preview for review — it does NOT
# publish to Instagram itself (see scripts/publish-instagram.ts for that
# manual step).
on:
  schedule:
    - cron: '30 21 * * 1-5'
  workflow_dispatch:  # allows manual fire from the Actions tab

jobs:
  trigger:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: POST /api/cron/market-movers-daily
        env:
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
          APP_URL: ${{ vars.APP_URL || 'https://bullpen.no' }}
        run: |
          if [ -z "$CRON_SECRET" ]; then
            echo "::error::CRON_SECRET secret is not configured in repo settings"
            exit 1
          fi
          curl -fsS -X GET \
            -H "Authorization: Bearer ${CRON_SECRET}" \
            "${APP_URL}/api/cron/market-movers-daily"
```

- [ ] **Step 2: Write the local trigger script**

```ts
/**
 * Trigger the Instagram market-movers generation cron locally for testing.
 * Loads CRON_SECRET from .env.local and calls /api/cron/market-movers-daily.
 *
 * Usage: npm run trigger-market-movers
 * (Ensure the dev server is running: npm run dev)
 */

import { config } from 'dotenv';

config({ path: '.env.local' });

async function main() {
  const secret = process.env.CRON_SECRET;
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (!secret) {
    console.error('CRON_SECRET not found in .env.local');
    process.exit(1);
  }

  const url = `${base}/api/cron/market-movers-daily`;
  console.log('Calling', url, '...\n');

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${secret}` },
  });

  const body = await res.json();
  console.log('Status:', res.status);
  console.log('Response:', JSON.stringify(body, null, 2));
}

main();
```

- [ ] **Step 3: Add the npm script**

In `package.json`, next to the existing `"instagram-publish"` entry, add:

```json
    "trigger-market-movers": "tsx scripts/trigger-market-movers.ts",
```

- [ ] **Step 4: Lint**

Run: `npx eslint scripts/trigger-market-movers.ts`
Expected: no errors. (The `.yml` and `.json` files aren't ESLint targets.)

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/cron-market-movers.yml scripts/trigger-market-movers.ts package.json
git commit -m "feat: add Market Movers GitHub Actions schedule and local trigger script"
```

---

### Task 9: End-to-end live verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (background/separate terminal)

- [ ] **Step 2: Trigger the cron locally**

Run: `npm run trigger-market-movers`
Expected: `Status: 200`, JSON response with `success: true`, a real `postId`, `dateLabel`, `topGainer`, `topLoser`, `slideCount: 3`.

- [ ] **Step 3: Fetch and inspect all 3 rendered slides**

Run:
```bash
POST_ID=<postId from step 2>
curl -s -o /tmp/mm-winners.png "http://localhost:3000/api/instagram/render/$POST_ID/0"
curl -s -o /tmp/mm-losers.png "http://localhost:3000/api/instagram/render/$POST_ID/1"
curl -s -o /tmp/mm-cta.png "http://localhost:3000/api/instagram/render/$POST_ID/2"
```
Then view each PNG directly (Read tool or an image viewer). Confirm: slide 0 shows "Daily Winners" with 5 rows, real logos or ticker-initial fallbacks, emerald bars, correct subtitle with the real date; slide 1 shows "Daily Losers" with 5 rows and red bars; slide 2 is the existing CTA slide unchanged. No overlapping text, no missing logos rendering as broken images, bars visibly scaled by magnitude (the #1 winner's bar visibly wider than the #5 winner's).

- [ ] **Step 4: Confirm idempotency**

Run: `npm run trigger-market-movers` again (same ET day).
Expected: `skipped: true, reason: 'already_exists'` — no duplicate row, no duplicate Discord post, no duplicate TwelveData/Claude spend.

- [ ] **Step 5: Confirm the Discord preview (if `DISCORD_INSTAGRAM_WEBHOOK_URL` is set locally)**

Check the configured Discord channel for the "Market movers ready for review" embed from step 2, with working slide preview links and the correct `npm run instagram-publish -- --id=...` command.

- [ ] **Step 6: Run the full lint suite once more**

Run: `npm run lint`
Expected: 0 errors (warnings pre-existing/unrelated are fine, per this repo's established gate).

- [ ] **Step 7: Push to `preview`**

```bash
git push origin preview
```

No further commit needed here — this task is verification of everything already committed in Tasks 1-8.
