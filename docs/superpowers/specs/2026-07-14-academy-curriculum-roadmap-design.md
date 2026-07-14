# Academy Curriculum Roadmap — Design

## Background

A prior session (2026-07-13, commit `a32fa08`) referred to "Phase 1 of the Academy expansion plan (curriculum ladder + Pro subscription backbone)," implying a broader curriculum plan existed. That plan was never written to a spec/plan file — it was apparently discussed conversationally and lost. That session shipped Pro-gating infrastructure, one new course ("Reading a Stock Quote"), the completion mascot, and the daily-challenge question pool, but no persisted roadmap for what comes next.

Separately, reviewing the two most topically similar existing courses — "Reading a Stock Price" and "Reading a Stock Quote" — surfaced real content overlap:
- Both courses' opening lesson teaches the same core mechanic (price, $change, %change from previous close) with near-identical framing.
- Both courses' "match" lesson quizzes the same two terms — **Market Cap** and **Volume** — with near-equivalent definitions.
- **Liquidity** is independently defined as a highlighted term in both courses.

Non-overlapping, unique-per-course content: "Reading a Stock Price" owns market cap depth, 52-week range, and *why* prices move (catalysts, priced-in, guidance) — a valuation/narrative angle. "Reading a Stock Quote" owns bid/ask/spread, day range, and volume-spike interpretation — a ticker-mechanics angle. The two scenario lessons apply their concepts to different real situations (a gain from an earnings beat vs. a loss with a volume spike) and don't feel redundant.

This spec covers two pieces of work: (1) resolving the Price/Quote overlap, and (2) a concrete, near-term roadmap for the next 4 Academy courses — deliberately scoped to "next 4," not a full learning path to Pro-level, so it stays accurate and doesn't go stale the way the lost Phase 1 plan did.

## Part 1: Resolving the Price/Quote overlap

**Course:** `reading-a-stock-price` (slug unchanged — preserves existing progress records and URLs; only title/description/content change)

| Field | Current | New |
|---|---|---|
| `title` | "Reading a Stock Price" | **"Why Stocks Move"** |
| `description` | "Every stock page is packed with numbers. Learn what price, market cap, volume, and 52-week high/low actually mean — and why they matter to you as an investor." | **"Prices don't move randomly. Learn what market cap and the 52-week range tell you — and the real reasons a stock jumps or drops."** |
| `icon` | `📈` (emoji — violates the no-emoji-icons rule in `.agents/skills/ui-ux-pro-max/SKILL.md`, and doesn't match any lucide export, so `CourseCard.tsx`'s `CourseIcon` lookup is already silently falling back to a generic `BookOpen` icon) | **`Activity`** (valid lucide icon name) |
| `color` | `#10b981` (raw hex — inconsistent with other courses' Tailwind color-name tokens; also confirmed dead data today, since `CourseCard.tsx` hardcodes `text-emerald-500`/`bg-emerald-500/10` for every course icon regardless of this field) | **`emerald`** (same visual hue as the old hex, now a valid token if this field is ever wired up) |

**Lesson content changes** (2 of the course's 5 lessons touched; quiz and scenario lessons untouched):

1. **`stock-page-numbers`** ("The Numbers on Every Stock Page") → retitled **"Market Cap & the 52-Week Range"**. Currently 3 sections: (a) price/change%/change$ explanation, (b) market cap/shares outstanding, (c) 52-week high/low + a volume mention. Trim section (a) to a brief one-sentence recap (kept minimal, not removed entirely, because "Quick Check: Price Basics" still has a %change-calculation question) rather than a full re-teaching. Sections (b) and (c) become the lesson's actual content and lead.
2. **`why-prices-move`** ("Why Do Prices Move?") — remove the `liquidity` highlighted-term definition (it stays defined exactly once, in `reading-a-stock-quote`'s `bid-ask-spread` lesson). The word "liquidity" may still appear in passing prose; only the duplicate glossary-style definition is cut.
3. **`price-metrics-match`** ("Match the Metrics") — remove the `Volume` term/definition pair (duplicate of `reading-a-stock-quote`'s `quote-vocab-match`). Keeps `Market Cap`, `52-week High`, `Change %` (3 pairs; existing match lessons don't require exactly 4).

No changes to: `price-basics-quiz`, `interpreting-a-move` (scenario), `reading-a-stock-quote` (any lesson), course `slug`, `order_index`, `difficulty`, `requires_pro`. No user-facing XP values change. Existing completion records for this course are unaffected — they key on lesson/course IDs, not content.

## Part 2: The next 4 courses

All beginner difficulty, all free (`requires_pro = false`) — Pro-gating infrastructure exists but no course uses it yet; deliberately holding off until there's content that's genuinely advanced enough to justify it, rather than gating something that still reads as "basics." `order_index` continues from the current max of 3.

Each course is deliberately mapped to an existing BullPen tool (`lib/tools/tools-config.ts`), so a lesson concept has somewhere real to be applied immediately after: Screener/Compare/Deep Dive, Portfolio Builder/My Holdings, the Dividend Calculator, and BullPen's actual multi-asset scope (stocks/ETFs/crypto/commodities) respectively.

Lesson shape follows the existing established pattern (`reading-a-stock-quote`, `reading-a-stock-price`): 2× `read`, 1× `quiz`, 1× `match`, 1× `scenario`. XP follows the existing convention exactly: `read` = 10, `match` = 15, `quiz` = 20, `scenario` = 25.

### Course 4: Company Fundamentals
`slug: company-fundamentals` · `icon: BarChart3` · `color: blue` · `order_index: 4`

> "Screener filters by revenue, margin, EPS, and debt — this course teaches what those numbers actually mean before you touch the filters."

| Lesson | Type | Topic |
|---|---|---|
| Revenue, Profit & Margins | read | Revenue vs. net income vs. profit margin; why margin % matters more than raw profit dollars |
| EPS & the P/E Ratio | read | What EPS is, how P/E is calculated, what a high/low P/E signals — with the caveat that there's no single "good" number in isolation |
| Quick Check: Fundamentals | quiz | 3 questions covering revenue/margin/EPS/P/E |
| Match the Fundamentals | match | Revenue, Net Income, Margin, EPS, P/E Ratio |
| Cash Flow & Debt | read | Why cash flow can diverge from reported profit; what debt-to-equity signals about risk |
| Cheap or Expensive? | scenario | Apply P/E + margin + debt context to judge whether a stock's valuation is reasonable |

### Course 5: Building a Portfolio: Diversification & Risk
`slug: portfolio-diversification` · `icon: PieChart` · `color: emerald` · `order_index: 5`

> "One stock is a bet. A portfolio is a strategy. Learn diversification, position sizing, and risk before you build yours."

| Lesson | Type | Topic |
|---|---|---|
| Why Diversification Matters | read | Concentration risk, correlation, the mechanics behind "don't put all eggs in one basket" |
| Position Sizing & Risk | read | How much of a portfolio a single stock should be; risk-tolerance basics |
| Quick Check: Portfolio Basics | quiz | 3 questions covering diversification/correlation/position sizing |
| Match the Portfolio Terms | match | Diversification, Correlation, Position Size, Asset Allocation |
| Building Your First Portfolio | scenario | Given a hypothetical (over-concentrated) holdings list, decide what to do about it |

### Course 6: Dividends & Passive Income
`slug: dividends-income` · `icon: Wallet` · `color: blue` · `order_index: 6`

> "Some stocks pay you to hold them. Learn how dividend yield, payout ratio, and ex-dividend dates actually work."

| Lesson | Type | Topic |
|---|---|---|
| What is a Dividend? | read | Cash payments, yield calculation, why not every company pays one |
| Payout Ratio & Sustainability | read | How to judge whether a dividend is safe or at risk of being cut |
| Quick Check: Dividends | quiz | 3 questions covering yield/payout ratio/ex-dividend date |
| Match the Dividend Terms | match | Dividend Yield, Payout Ratio, Ex-Dividend Date, Dividend Aristocrat |
| Too Good to Be True? | scenario | A stock with an unusually high yield — evaluate whether it's a payout-ratio trap |

### Course 7: Beyond Stocks: ETFs & Crypto
`slug: etfs-and-crypto` · `icon: Layers` · `color: emerald` · `order_index: 7`

> "Stocks aren't the only asset on BullPen. Learn what ETFs are, how they differ from picking individual stocks, and the basics of crypto and commodities."

| Lesson | Type | Topic |
|---|---|---|
| What is an ETF? | read | A basket of stocks/bonds, how it differs from individual stock-picking, expense ratio |
| Intro to Crypto & Commodities | read | What crypto represents differently from equity ownership; volatility differences; why BullPen tracks gold/oil |
| Quick Check: Beyond Stocks | quiz | 3 questions covering ETF/expense ratio/crypto basics |
| Match the Asset Terms | match | ETF, Expense Ratio, Index Fund, Cryptocurrency, Commodity |
| Stock, ETF, or Both? | scenario | Given an investing goal, choose the right vehicle |

## Production process

No new tooling. Reuses the existing pipeline exactly as it produced "Reading a Stock Quote":

1. Each course above gets encoded as a `CourseOutline` (per `scripts/generate-academy-course.ts`'s existing `DEFAULT_OUTLINE` shape) — the tables above map directly to `LessonSpec[]` (`slug`, `title`, `type`, `topic`, `xpReward`).
2. Run `npm run generate-course > supabase/seeds/00N_academy_<slug>.sql` per course. The script drafts content with Claude (`claude-opus-4-8`), validates every lesson against the `types/academy.ts` Zod schemas, and prefers canonical `lib/finance/glossary.ts` definitions for highlighted terms — it writes nothing to the database itself.
3. A human reviews each generated SQL file for accuracy and tone before it's applied.
4. Apply via the Supabase MCP (`apply_migration`) per `CLAUDE.md` convention, immediately after review — not deferred.

The Part 1 (Price/Quote overlap) changes are a direct SQL `UPDATE`/content edit, not run through the generator — it's editing existing prose, not drafting new prose from a topic seed.

## Explicitly not doing

- Not building a full learning path to Pro-level in this pass — scoped to the next 4 courses only, per the "keep it accurate, don't let it go stale" decision.
- Not introducing the first Pro-gated course yet — all 4 new courses are free/beginner.
- Not touching `reading-charts` or `what-is-a-stock` — no overlap or issues found with either.
- Not wiring up `academy_courses.color` into `CourseCard.tsx`'s rendering — out of scope; the color-token fix here is data hygiene only, matching the existing (currently inert) column's intended format.
