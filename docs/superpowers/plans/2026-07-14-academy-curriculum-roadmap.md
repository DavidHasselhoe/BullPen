# Academy Curriculum Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the "Reading a Stock Price" / "Reading a Stock Quote" content overlap, then generate 4 new free/beginner Academy courses (Company Fundamentals, Portfolio Diversification & Risk, Dividends & Passive Income, Beyond Stocks: ETFs & Crypto).

**Architecture:** Task 1 is a direct SQL content fix applied as a migration. Tasks 2-5 each edit `scripts/generate-academy-course.ts`'s `DEFAULT_OUTLINE` constant to a fully-specified course outline, run the existing AI-assisted generator (`npm run generate-course`), review the output, and apply it via the Supabase MCP — the exact same pipeline that produced "Reading a Stock Quote." Task 6 is end-to-end browser verification of the whole Academy page.

**Tech Stack:** Supabase Postgres (`academy_courses`/`academy_lessons` tables, already exist — no schema changes), `scripts/generate-academy-course.ts` (Claude Opus content generator, already exists), Zod validation (`types/academy.ts`, already exists).

## Global Constraints

- No schema/migration changes to `academy_courses` or `academy_lessons` — both tables already support everything needed.
- All 4 new courses: `difficulty: 'beginner'`, `requiresPro: false` (per the spec's decision to hold off on Pro-gated content).
- XP convention (must match exactly, per the spec): `read` = 10, `match` = 15, `quiz` = 20, `scenario` = 25.
- `reading-a-stock-price`'s `slug` must NOT change (preserves existing user progress/completions).
- This repo has no automated test framework for content/data changes — verification is via re-querying Supabase after each apply, plus a final live browser check in Task 6.

---

### Task 1: Fix the "Reading a Stock Price" / "Reading a Stock Quote" overlap

**Files:**
- Create: `supabase/migrations/082_academy_reposition_why_stocks_move.sql`

**Interfaces:**
- Consumes: existing `academy_courses` row (`slug = 'reading-a-stock-price'`) and 3 existing `academy_lessons` rows (`stock-page-numbers`, `why-prices-move`, `price-metrics-match`) under that course.
- Produces: no new interfaces — this is a content-only fix. Task 6 verifies the result renders correctly.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/082_academy_reposition_why_stocks_move.sql`:

```sql
-- Reposition "Reading a Stock Price" as "Why Stocks Move" to resolve content
-- overlap with "Reading a Stock Quote" (price/change% intro + Market Cap/Volume
-- match-term duplication + duplicate liquidity definition). See
-- docs/superpowers/specs/2026-07-14-academy-curriculum-roadmap-design.md Part 1.
-- Slug is unchanged — preserves existing user progress/completions.

UPDATE academy_courses
SET
  title = 'Why Stocks Move',
  description = 'Prices don''t move randomly. Learn what market cap and the 52-week range tell you — and the real reasons a stock jumps or drops.',
  icon = 'Activity',
  color = 'emerald'
WHERE slug = 'reading-a-stock-price';

-- Lesson 1: trim the duplicate price/change% teaching to a brief recap
-- (kept minimal, not removed, since the course quiz still has a %change
-- calculation question); lead with market cap + 52-week range instead.
UPDATE academy_lessons
SET
  title = 'Market Cap & the 52-Week Range',
  content = '{"funFact":"A 1% move in Apple''s stock price shifts its total market value by roughly $3 billion — in a single day.","sections":[{"text":"Quick refresher: every stock page shows a price and how much it moved since yesterday, both as a dollar change and a percentage change. If a stock closed at $100 yesterday and trades at $108 today, that''s +$8, or +8% — the percentage is what lets you compare a $5 stock and a $500 stock on equal footing.","highlightedTerms":[{"term":"change %","definition":"Today''s price move expressed as a percentage of yesterday''s closing price. The standard way to compare moves across different stocks."}]},{"text":"Market capitalisation — market cap — is simply the share price multiplied by the total number of shares outstanding. A $100 stock with 10 million shares = a $1 billion company. Market cap tells you the company''s size at a glance: mega-cap (Apple, Microsoft) sit above $1 trillion; large-cap above $10 billion; mid-cap $2–10 billion; small-cap below $2 billion.","highlightedTerms":[{"term":"market cap","definition":"Share price × total shares outstanding. The total market value of a company right now."},{"term":"shares outstanding","definition":"The total number of shares currently held by all investors, including insiders and institutions."}]},{"text":"The 52-week high and low show the price range over the past year. A stock near its 52-week high may be on a strong run — or getting expensive. One near its 52-week low might look cheap — or it might be in trouble. Either way, the range gives you context that a single price alone can''t.","highlightedTerms":[{"term":"52-week high/low","definition":"The highest and lowest prices the stock has traded at over the past 52 weeks. A useful reference for context."}]}]}'::jsonb
WHERE slug = 'stock-page-numbers'
  AND course_id = (SELECT id FROM academy_courses WHERE slug = 'reading-a-stock-price');

-- Lesson 4: remove the duplicate "liquidity" glossary-style definition
-- (stays defined exactly once, in reading-a-stock-quote's bid-ask-spread
-- lesson). The word wasn't used in this section's prose, only the
-- highlightedTerms entry — so no text change needed, just drop the entry.
UPDATE academy_lessons
SET
  content = '{"funFact":"When the US Federal Reserve speaks about interest rates, stock prices across the entire market can shift billions of dollars in value within seconds — before most people finish reading the headline.","sections":[{"text":"Stock prices are set by supply and demand — every second the market is open. When more people want to buy a stock than sell it, the price rises. When more people want to sell, it falls. The exchange matches buyers and sellers in real time, which is why prices tick up and down continuously throughout the trading day.","highlightedTerms":[{"term":"supply and demand","definition":"The force behind all prices. More buyers than sellers pushes prices up; more sellers than buyers pushes them down."}]},{"text":"Catalysts are events that suddenly shift that balance. Common ones: earnings reports (did the company beat or miss expectations?), product launches, management changes, economic data like inflation or unemployment, and central bank decisions on interest rates. A single headline can move a stock 10% or more in minutes.","highlightedTerms":[{"term":"catalyst","definition":"An event or announcement that triggers a significant, fast price move."},{"term":"earnings report","definition":"A quarterly update where a company reveals its revenue, profit, and outlook for the next quarter."}]},{"text":"Here''s the subtlest idea in investing: markets price in expectations, not just facts. A company can report record profits and still see its stock fall — if investors expected even better results. The price already reflected the optimism. When reality merely matches expectations, there''s no new reason to buy — and often a reason to sell.","highlightedTerms":[{"term":"priced in","definition":"When a widely-expected event is already reflected in the stock price before it officially happens."},{"term":"guidance","definition":"Management''s forecast for future revenue and profit. Often moves a stock more than the current quarter''s actual results."}]}]}'::jsonb
WHERE slug = 'why-prices-move'
  AND course_id = (SELECT id FROM academy_courses WHERE slug = 'reading-a-stock-price');

-- Match lesson: drop the "Volume" pair (duplicate of reading-a-stock-quote's
-- quote-vocab-match). 3 pairs remain — match lessons don't require exactly 4.
UPDATE academy_lessons
SET
  content = '{"pairs":[{"term":"Market Cap","definition":"Price × total shares outstanding"},{"term":"52-week High","definition":"Highest price in the past year"},{"term":"Change %","definition":"Today''s move vs yesterday''s close"}]}'::jsonb
WHERE slug = 'price-metrics-match'
  AND course_id = (SELECT id FROM academy_courses WHERE slug = 'reading-a-stock-price');
```

- [ ] **Step 2: Apply via the Supabase MCP**

Use `mcp__claude_ai_Supabase__apply_migration` with `project_id: kgqpzuvhslqazurfrqya`, `name: academy_reposition_why_stocks_move`, and the SQL from Step 1. If it errors (most likely cause: a stray unescaped `'` in the JSON strings), fix the SQL file and re-apply — never commit a migration file that doesn't match what was actually applied.

- [ ] **Step 3: Verify**

Run via `mcp__claude_ai_Supabase__execute_sql` (`project_id: kgqpzuvhslqazurfrqya`):

```sql
select c.title, c.description, c.icon, c.color,
       l.slug, l.title as lesson_title, l.content
from academy_courses c
join academy_lessons l on l.course_id = c.id
where c.slug = 'reading-a-stock-price'
order by l.order_index;
```

Expected: `title = 'Why Stocks Move'`, `icon = 'Activity'`, `color = 'emerald'`; `stock-page-numbers` lesson has `lesson_title = 'Market Cap & the 52-Week Range'` and its `content.sections` has 3 entries, the first with only a `change %` highlighted term (no `price` or `volume` term); `why-prices-move`'s first section's `highlightedTerms` has only `supply and demand` (no `liquidity`); `price-metrics-match`'s `content.pairs` has exactly 3 entries (`Market Cap`, `52-week High`, `Change %` — no `Volume`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/082_academy_reposition_why_stocks_move.sql
git commit -m "fix: reposition Reading a Stock Price as Why Stocks Move, resolve Quote overlap"
```

---

### Task 2: Generate "Company Fundamentals" course

**Files:**
- Modify: `scripts/generate-academy-course.ts` (the `DEFAULT_OUTLINE` constant)
- Create: `supabase/seeds/007_academy_company_fundamentals.sql`

**Interfaces:**
- Consumes: `CourseOutline`/`LessonSpec` types already defined in `scripts/generate-academy-course.ts` (no changes to those types).
- Produces: new `academy_courses` row (`slug: 'company-fundamentals'`) and 6 `academy_lessons` rows, applied live. Nothing later depends on this task's specifics beyond Task 6's verification.

- [ ] **Step 1: Replace `DEFAULT_OUTLINE`**

In `scripts/generate-academy-course.ts`, replace the entire `DEFAULT_OUTLINE` constant (from `const DEFAULT_OUTLINE: CourseOutline = {` through its closing `};`) with:

```ts
const DEFAULT_OUTLINE: CourseOutline = {
  slug: 'company-fundamentals',
  title: 'Company Fundamentals',
  description:
    'Screener filters by revenue, margin, EPS, and debt — this course teaches what those numbers actually mean before you touch the filters.',
  icon: 'BarChart3',
  color: 'blue',
  orderIndex: 4,
  difficulty: 'beginner',
  lessons: [
    { slug: 'revenue-profit-margins', title: 'Revenue, Profit & Margins', type: 'read', topic: 'The difference between revenue and net income (profit), and what profit margin (%) means. Explain why margin percentage matters more than raw profit dollars when comparing companies of different sizes.', xpReward: 10 },
    { slug: 'eps-and-pe-ratio', title: 'EPS & the P/E Ratio', type: 'read', topic: 'What earnings per share (EPS) is and how it is calculated, then what the price-to-earnings (P/E) ratio is and what a high or low P/E can signal. Include the caveat that there is no single "good" P/E in isolation — it depends on growth and industry.', xpReward: 10 },
    { slug: 'fundamentals-quiz', title: 'Quick Check: Fundamentals', type: 'quiz', topic: 'Test understanding of revenue vs net income, profit margin, EPS, and P/E ratio from the previous two lessons. 3 questions.', xpReward: 20 },
    { slug: 'fundamentals-match', title: 'Match the Fundamentals', type: 'match', topic: 'Match fundamentals terms (Revenue, Net Income, Profit Margin, EPS, P/E Ratio) to their plain-English definitions.', xpReward: 15 },
    { slug: 'cash-flow-and-debt', title: 'Cash Flow & Debt', type: 'read', topic: 'Why a company\'s cash flow can differ from its reported profit (e.g. non-cash expenses, timing), and what the debt-to-equity ratio signals about financial risk.', xpReward: 10 },
    { slug: 'cheap-or-expensive', title: 'Cheap or Expensive?', type: 'scenario', topic: 'A beginner is looking at two companies with very different P/E ratios and must decide which one is actually the better value, using margin trends and debt level as context rather than the P/E number alone. Reward looking at the full financial picture over a single ratio.', xpReward: 25 },
  ],
};
```

- [ ] **Step 2: Generate the SQL**

Run: `npm run generate-course > supabase/seeds/007_academy_company_fundamentals.sql`
Expected stderr output ending with: `✅ All 6 lessons validated. Emitting SQL to stdout.` — if a lesson fails validation after 3 retries, the script exits non-zero and the output file will be incomplete; re-run after investigating the printed Zod error.

- [ ] **Step 3: Review the generated SQL**

Open `supabase/seeds/007_academy_company_fundamentals.sql` and check each of the 6 lessons for:
- Content matches its `topic` seed (no drift onto an unrelated subject).
- No fabricated specific statistics presented as fact (a `funFact` should be a generically true statement, not an invented precise figure).
- Tone matches existing lessons: warm, plain-English, concrete (compare against `stock-page-numbers`' current content for calibration).
- The `scenario` lesson's `isCorrect: true` choice is genuinely the best answer, not an arbitrary pick.
- No leftover placeholder text, no markdown code fences leaking into the JSON strings.

If anything reads off, edit the JSON directly in the file (it's already schema-valid — free-text edits that keep the same shape are safe) before applying.

- [ ] **Step 4: Apply via the Supabase MCP**

Use `mcp__claude_ai_Supabase__apply_migration` with `project_id: kgqpzuvhslqazurfrqya`, `name: academy_company_fundamentals`, and the full contents of `supabase/seeds/007_academy_company_fundamentals.sql`.

- [ ] **Step 5: Verify**

```sql
select c.slug, c.title, c.order_index, count(l.id) as lesson_count
from academy_courses c
left join academy_lessons l on l.course_id = c.id
where c.slug = 'company-fundamentals'
group by c.slug, c.title, c.order_index;
```

Expected: one row, `title = 'Company Fundamentals'`, `order_index = 4`, `lesson_count = 6`.

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-academy-course.ts supabase/seeds/007_academy_company_fundamentals.sql
git commit -m "feat: generate Company Fundamentals Academy course"
```

---

### Task 3: Generate "Building a Portfolio: Diversification & Risk" course

**Files:**
- Modify: `scripts/generate-academy-course.ts` (the `DEFAULT_OUTLINE` constant)
- Create: `supabase/seeds/008_academy_portfolio_diversification.sql`

**Interfaces:** same pattern as Task 2 — consumes the existing `CourseOutline`/`LessonSpec` types, produces a new course + lessons.

- [ ] **Step 1: Replace `DEFAULT_OUTLINE`**

Replace the entire `DEFAULT_OUTLINE` constant with:

```ts
const DEFAULT_OUTLINE: CourseOutline = {
  slug: 'portfolio-diversification',
  title: 'Building a Portfolio: Diversification & Risk',
  description:
    'One stock is a bet. A portfolio is a strategy. Learn diversification, position sizing, and risk before you build yours.',
  icon: 'PieChart',
  color: 'emerald',
  orderIndex: 5,
  difficulty: 'beginner',
  lessons: [
    { slug: 'why-diversification-matters', title: 'Why Diversification Matters', type: 'read', topic: 'What diversification means and why concentration risk (having too much in one stock or sector) is dangerous. Explain correlation in plain English — why owning 10 tech stocks isn\'t as diversified as it sounds.', xpReward: 10 },
    { slug: 'position-sizing-and-risk', title: 'Position Sizing & Risk', type: 'read', topic: 'How much of a portfolio a single position should reasonably be, and the basics of risk tolerance — why a beginner\'s risk tolerance might differ from an experienced investor\'s.', xpReward: 10 },
    { slug: 'portfolio-basics-quiz', title: 'Quick Check: Portfolio Basics', type: 'quiz', topic: 'Test understanding of diversification, correlation, and position sizing from the previous two lessons. 3 questions.', xpReward: 20 },
    { slug: 'portfolio-terms-match', title: 'Match the Portfolio Terms', type: 'match', topic: 'Match portfolio terms (Diversification, Correlation, Position Size, Asset Allocation) to their plain-English definitions.', xpReward: 15 },
    { slug: 'building-your-first-portfolio', title: 'Building Your First Portfolio', type: 'scenario', topic: 'A beginner shows their portfolio: 80% in three tech stocks, 20% in one friend\'s stock tip. They must decide whether this is well-diversified and what, if anything, to change. Reward recognizing concentration risk over chasing more winners.', xpReward: 25 },
  ],
};
```

- [ ] **Step 2: Generate the SQL**

Run: `npm run generate-course > supabase/seeds/008_academy_portfolio_diversification.sql`
Expected: stderr ends with `✅ All 5 lessons validated. Emitting SQL to stdout.`

- [ ] **Step 3: Review the generated SQL**

Open `supabase/seeds/008_academy_portfolio_diversification.sql` and check each of the 5 lessons for:
- Content matches its `topic` seed (no drift onto an unrelated subject).
- No fabricated specific statistics presented as fact (a `funFact` should be a generically true statement, not an invented precise figure).
- Tone matches existing lessons: warm, plain-English, concrete (compare against `stock-page-numbers`' current content for calibration).
- The `scenario` lesson's `isCorrect: true` choice is genuinely the best answer, not an arbitrary pick.
- No leftover placeholder text, no markdown code fences leaking into the JSON strings.

If anything reads off, edit the JSON directly in the file (it's already schema-valid — free-text edits that keep the same shape are safe) before applying.

- [ ] **Step 4: Apply via the Supabase MCP**

Use `mcp__claude_ai_Supabase__apply_migration` with `project_id: kgqpzuvhslqazurfrqya`, `name: academy_portfolio_diversification`, and the full contents of `supabase/seeds/008_academy_portfolio_diversification.sql`.

- [ ] **Step 5: Verify**

```sql
select c.slug, c.title, c.order_index, count(l.id) as lesson_count
from academy_courses c
left join academy_lessons l on l.course_id = c.id
where c.slug = 'portfolio-diversification'
group by c.slug, c.title, c.order_index;
```

Expected: one row, `title = 'Building a Portfolio: Diversification & Risk'`, `order_index = 5`, `lesson_count = 5`.

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-academy-course.ts supabase/seeds/008_academy_portfolio_diversification.sql
git commit -m "feat: generate Building a Portfolio Academy course"
```

---

### Task 4: Generate "Dividends & Passive Income" course

**Files:**
- Modify: `scripts/generate-academy-course.ts` (the `DEFAULT_OUTLINE` constant)
- Create: `supabase/seeds/009_academy_dividends_income.sql`

**Interfaces:** same pattern as Task 2.

- [ ] **Step 1: Replace `DEFAULT_OUTLINE`**

Replace the entire `DEFAULT_OUTLINE` constant with:

```ts
const DEFAULT_OUTLINE: CourseOutline = {
  slug: 'dividends-income',
  title: 'Dividends & Passive Income',
  description:
    'Some stocks pay you to hold them. Learn how dividend yield, payout ratio, and ex-dividend dates actually work.',
  icon: 'Wallet',
  color: 'blue',
  orderIndex: 6,
  difficulty: 'beginner',
  lessons: [
    { slug: 'what-is-a-dividend', title: 'What is a Dividend?', type: 'read', topic: 'What a dividend is (a cash payment to shareholders), how dividend yield is calculated, and why not every company pays one (e.g. growth companies reinvesting profit instead).', xpReward: 10 },
    { slug: 'payout-ratio-and-sustainability', title: 'Payout Ratio & Sustainability', type: 'read', topic: 'What the payout ratio is (dividends paid ÷ net income) and how to use it to judge whether a dividend looks safe or is at risk of being cut.', xpReward: 10 },
    { slug: 'dividends-quiz', title: 'Quick Check: Dividends', type: 'quiz', topic: 'Test understanding of dividend yield, payout ratio, and ex-dividend date. 3 questions.', xpReward: 20 },
    { slug: 'dividend-terms-match', title: 'Match the Dividend Terms', type: 'match', topic: 'Match dividend terms (Dividend Yield, Payout Ratio, Ex-Dividend Date, Dividend Aristocrat) to their plain-English definitions.', xpReward: 15 },
    { slug: 'too-good-to-be-true', title: 'Too Good to Be True?', type: 'scenario', topic: 'A beginner finds a stock with an unusually high dividend yield (e.g. 15%) and is excited about the income. They must investigate the payout ratio and recent price decline before deciding whether it\'s a genuine opportunity or a yield trap. Reward checking payout ratio and business health over chasing yield alone.', xpReward: 25 },
  ],
};
```

- [ ] **Step 2: Generate the SQL**

Run: `npm run generate-course > supabase/seeds/009_academy_dividends_income.sql`
Expected: stderr ends with `✅ All 5 lessons validated. Emitting SQL to stdout.`

- [ ] **Step 3: Review the generated SQL**

Open `supabase/seeds/009_academy_dividends_income.sql` and check each of the 5 lessons for:
- Content matches its `topic` seed (no drift onto an unrelated subject).
- No fabricated specific statistics presented as fact (a `funFact` should be a generically true statement, not an invented precise figure).
- Tone matches existing lessons: warm, plain-English, concrete (compare against `stock-page-numbers`' current content for calibration).
- The `scenario` lesson's `isCorrect: true` choice is genuinely the best answer, not an arbitrary pick.
- No leftover placeholder text, no markdown code fences leaking into the JSON strings.

If anything reads off, edit the JSON directly in the file (it's already schema-valid — free-text edits that keep the same shape are safe) before applying.

- [ ] **Step 4: Apply via the Supabase MCP**

Use `mcp__claude_ai_Supabase__apply_migration` with `project_id: kgqpzuvhslqazurfrqya`, `name: academy_dividends_income`, and the full contents of `supabase/seeds/009_academy_dividends_income.sql`.

- [ ] **Step 5: Verify**

```sql
select c.slug, c.title, c.order_index, count(l.id) as lesson_count
from academy_courses c
left join academy_lessons l on l.course_id = c.id
where c.slug = 'dividends-income'
group by c.slug, c.title, c.order_index;
```

Expected: one row, `title = 'Dividends & Passive Income'`, `order_index = 6`, `lesson_count = 5`.

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-academy-course.ts supabase/seeds/009_academy_dividends_income.sql
git commit -m "feat: generate Dividends & Passive Income Academy course"
```

---

### Task 5: Generate "Beyond Stocks: ETFs & Crypto" course

**Files:**
- Modify: `scripts/generate-academy-course.ts` (the `DEFAULT_OUTLINE` constant)
- Create: `supabase/seeds/010_academy_etfs_and_crypto.sql`

**Interfaces:** same pattern as Task 2.

- [ ] **Step 1: Replace `DEFAULT_OUTLINE`**

Replace the entire `DEFAULT_OUTLINE` constant with:

```ts
const DEFAULT_OUTLINE: CourseOutline = {
  slug: 'etfs-and-crypto',
  title: 'Beyond Stocks: ETFs & Crypto',
  description:
    'Stocks aren\'t the only asset on BullPen. Learn what ETFs are, how they differ from picking individual stocks, and the basics of crypto and commodities.',
  icon: 'Layers',
  color: 'emerald',
  orderIndex: 7,
  difficulty: 'beginner',
  lessons: [
    { slug: 'what-is-an-etf', title: 'What is an ETF?', type: 'read', topic: 'What an ETF (exchange-traded fund) is — a basket of stocks or bonds bought as a single share — how it differs from picking individual stocks, and what an expense ratio is.', xpReward: 10 },
    { slug: 'intro-crypto-commodities', title: 'Intro to Crypto & Commodities', type: 'read', topic: 'What a cryptocurrency represents differently from equity ownership (no company, no earnings), why crypto tends to be more volatile, and why BullPen also tracks commodities like gold and oil.', xpReward: 10 },
    { slug: 'beyond-stocks-quiz', title: 'Quick Check: Beyond Stocks', type: 'quiz', topic: 'Test understanding of ETFs, expense ratio, and crypto basics from the previous two lessons. 3 questions.', xpReward: 20 },
    { slug: 'asset-terms-match', title: 'Match the Asset Terms', type: 'match', topic: 'Match asset terms (ETF, Expense Ratio, Index Fund, Cryptocurrency, Commodity) to their plain-English definitions.', xpReward: 15 },
    { slug: 'stock-etf-or-both', title: 'Stock, ETF, or Both?', type: 'scenario', topic: 'A beginner wants broad exposure to the tech sector without picking individual winners and losers, and is deciding between buying one tech stock they like, a tech-sector ETF, or both. Reward matching the vehicle to the actual goal (broad exposure vs individual conviction).', xpReward: 25 },
  ],
};
```

- [ ] **Step 2: Generate the SQL**

Run: `npm run generate-course > supabase/seeds/010_academy_etfs_and_crypto.sql`
Expected: stderr ends with `✅ All 5 lessons validated. Emitting SQL to stdout.`

- [ ] **Step 3: Review the generated SQL**

Open `supabase/seeds/010_academy_etfs_and_crypto.sql` and check each of the 5 lessons for:
- Content matches its `topic` seed (no drift onto an unrelated subject).
- No fabricated specific statistics presented as fact (a `funFact` should be a generically true statement, not an invented precise figure).
- Tone matches existing lessons: warm, plain-English, concrete (compare against `stock-page-numbers`' current content for calibration).
- The `scenario` lesson's `isCorrect: true` choice is genuinely the best answer, not an arbitrary pick.
- No leftover placeholder text, no markdown code fences leaking into the JSON strings.

If anything reads off, edit the JSON directly in the file (it's already schema-valid — free-text edits that keep the same shape are safe) before applying.

- [ ] **Step 4: Apply via the Supabase MCP**

Use `mcp__claude_ai_Supabase__apply_migration` with `project_id: kgqpzuvhslqazurfrqya`, `name: academy_etfs_and_crypto`, and the full contents of `supabase/seeds/010_academy_etfs_and_crypto.sql`.

- [ ] **Step 5: Verify**

```sql
select c.slug, c.title, c.order_index, count(l.id) as lesson_count
from academy_courses c
left join academy_lessons l on l.course_id = c.id
where c.slug = 'etfs-and-crypto'
group by c.slug, c.title, c.order_index;
```

Expected: one row, `title = 'Beyond Stocks: ETFs & Crypto'`, `order_index = 7`, `lesson_count = 5`.

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-academy-course.ts supabase/seeds/010_academy_etfs_and_crypto.sql
git commit -m "feat: generate Beyond Stocks: ETFs & Crypto Academy course"
```

---

### Task 6: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Confirm final course list**

```sql
select slug, title, order_index, difficulty, requires_pro
from academy_courses
order by order_index;
```

Expected: 8 rows total, in this exact order — `what-is-a-stock` (0), `reading-a-stock-price` (1, title `Why Stocks Move`), `reading-charts` (2), `reading-a-stock-quote` (3), `company-fundamentals` (4), `portfolio-diversification` (5), `dividends-income` (6), `etfs-and-crypto` (7). All `difficulty = beginner`, all `requires_pro = false`.

- [ ] **Step 2: Lint the script changes**

Run: `npm run lint`
Expected: `0 errors` (warning count should match the pre-existing baseline — `scripts/generate-academy-course.ts` only had its `DEFAULT_OUTLINE` constant replaced across tasks, no structural changes).

- [ ] **Step 3: Browser check — course list**

Using the Playwright MCP tools, as a signed-in user:
1. Navigate to `http://localhost:3000/academy` (start the dev server first if not running).
2. Take a screenshot. Confirm 8 course cards render in order, "Why Stocks Move" shows its new description, and the 4 new courses show correct titles and `0%`/`0 lessons completed` progress (or appropriate progress if this account already has some).
3. Confirm no course card shows a broken/fallback `BookOpen` icon where a specific icon was expected (the emoji-icon bug this plan fixes) — `Activity`, `BarChart3`, `PieChart`, `Wallet`, `Layers` should all render as their real lucide icons.

- [ ] **Step 4: Browser check — "Why Stocks Move" content**

1. Click into "Why Stocks Move".
2. Open lesson 1. Confirm the title reads "Market Cap & the 52-Week Range" and the content leads with market cap, not a full price/%change explainer.
3. Open the "Match the Metrics" lesson. Confirm exactly 3 terms appear (Market Cap, 52-week High, Change %) — no "Volume".
4. Open "Why Do Prices Move?". Confirm no "liquidity" term is highlighted/tappable in the first section.

- [ ] **Step 5: Browser check — one new course end-to-end**

1. Open "Company Fundamentals" (or any one of the 4 new courses).
2. Step through all lessons (read → read → quiz → match → read → scenario). Confirm each renders without errors, the quiz has 3 answerable questions, the match lesson's pairs are all distinct and match correctly, and the scenario's "correct" choice feedback reads as genuinely correct given the setup.
3. Complete the course. Confirm XP awards match the plan's values (10+10+20+15+10+25 = 90 total for a 6-lesson course, or 10+10+20+15+25 = 80 for a 5-lesson course) and the course shows as 100% complete afterward.

No commit needed for this task unless a fixup was required during verification — if so, commit that fixup with a `fix:` message referencing what verification step caught it.
