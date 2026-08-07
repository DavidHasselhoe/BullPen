# MetricSelector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pure `selectMetrics()` utility in `lib/finance/metric-selector.ts` that picks which valuation metrics (P/E, Forward P/E, P/B, EV/EBITDA, P/S, Dividend Yield) are relevant for a company given its profitability and sector/industry, instead of the stock page's current one-size-fits-all P/E+P/B+EV/EBITDA display.

**Architecture:** Single pure function, no I/O, evaluated as an ordered `if/else if` priority chain (REIT → Bank/Insurer → Cyclical → Unprofitable → Default). Verified with a one-off `tsx` script following this repo's existing no-framework testing convention (see `scripts/test-calendar-day-model.ts`), not wired into any UI in this pass.

**Tech Stack:** TypeScript, `tsx` (already a dev dependency, used by every `scripts/test-*.ts` in this repo).

## Global Constraints

- Metric vocabulary is fixed to exactly: `'P/E' | 'Forward P/E' | 'P/B' | 'EV/EBITDA' | 'P/S' | 'Dividend Yield'`. Never return `'ROE'` or `'FFO/Share'` — neither is computable in BullPen's current data pipeline (spec: Non-goals).
- `lib/finance/metric-selector.ts` must be a pure function: no fetches, no Supabase, no React — matches `lib/finance/metric-insights.ts` and `lib/finance/health-score.ts` in the same directory.
- This repo has no test framework. Verification is a `scripts/test-*.ts` file run via `tsx`, wired to an npm script (spec: Verification section). Do not add Jest/Vitest/any new dependency.
- Do not touch `components/stock/StatisticsGrid.tsx` or any other UI file — wiring the selector into the stock page is explicitly out of scope for this plan (spec: Non-goals).
- Do not add a `psRatio` field to `CompanyStatistics` in `lib/twelvedata/twelvedata-client.ts` — also out of scope (spec: Non-goals), even though it's mentioned as a known future follow-up.

---

### Task 1: `selectMetrics` utility + verification script

**Files:**
- Create: `lib/finance/metric-selector.ts`
- Create: `scripts/test-metric-selector.ts`
- Modify: `package.json` (add one npm script entry)

**Interfaces:**
- Produces (consumed by the test script in this same task, and by any future caller):
  ```ts
  export type ValuationMetric = 'P/E' | 'Forward P/E' | 'P/B' | 'EV/EBITDA' | 'P/S' | 'Dividend Yield';

  export interface MetricSelectorInput {
    profitMargin: number | null | undefined;
    sector: string | null | undefined;
    industry?: string | null | undefined;
    hasForwardEarnings: boolean;
    dividendYield?: number | null | undefined;
  }

  export interface MetricSelection {
    primary: ValuationMetric[];
    secondary: ValuationMetric[];
    hideMetrics: ValuationMetric[];
    note?: string;
  }

  export function selectMetrics(input: MetricSelectorInput): MetricSelection;
  ```

- [ ] **Step 1: Write the failing verification script**

Create `scripts/test-metric-selector.ts` with this exact content:

```ts
// Verifies selectMetrics: REIT/bank/cyclical sector rules, the unprofitable
// default, the plain default, and the industry-preferred/sector-fallback
// classification, against the scenarios from the originating CrowdStrike bug
// (P/E 716.55 shown on an unprofitable company).
import { selectMetrics, type MetricSelectorInput, type ValuationMetric } from '../lib/finance/metric-selector';

function assertArrayEqual(actual: ValuationMetric[], expected: ValuationMetric[], msg: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}: expected ${e}, got ${a}`);
}

function main() {
  // CrowdStrike-shaped case: unprofitable software, forward earnings exist.
  {
    const input: MetricSelectorInput = {
      profitMargin: -0.006,
      sector: 'Technology',
      industry: 'Software—Infrastructure',
      hasForwardEarnings: true,
      dividendYield: null,
    };
    const result = selectMetrics(input);
    assertArrayEqual(result.primary, ['P/S', 'Forward P/E'], 'CRWD-shaped primary');
    assertArrayEqual(result.secondary, ['EV/EBITDA'], 'CRWD-shaped secondary');
    assertArrayEqual(result.hideMetrics, ['P/E'], 'CRWD-shaped hideMetrics');
    if (result.note !== 'Forward P/E assumes the company turns profitable.') {
      throw new Error(`CRWD-shaped note: got ${JSON.stringify(result.note)}`);
    }
  }

  // Unprofitable, no forward earnings — note omitted.
  {
    const result = selectMetrics({
      profitMargin: -0.1,
      sector: 'Technology',
      industry: 'Software—Application',
      hasForwardEarnings: false,
      dividendYield: null,
    });
    assertArrayEqual(result.primary, ['P/S'], 'unprofitable no-forward primary');
    if (result.note !== undefined) throw new Error(`Expected no note, got ${JSON.stringify(result.note)}`);
  }

  // REIT via industry match, profitable, pays a dividend.
  {
    const result = selectMetrics({
      profitMargin: 0.15,
      sector: 'Real Estate',
      industry: 'REIT—Diversified',
      hasForwardEarnings: false,
      dividendYield: 0.04,
    });
    assertArrayEqual(result.primary, ['P/B', 'Dividend Yield'], 'REIT primary');
    assertArrayEqual(result.secondary, ['EV/EBITDA'], 'REIT secondary (no forward P/E available)');
    assertArrayEqual(result.hideMetrics, ['P/E'], 'REIT hideMetrics');
    if (!result.note?.includes('depreciation')) throw new Error(`REIT note missing depreciation caveat: ${result.note}`);
  }

  // REIT via sector fallback (industry unknown), forward earnings available, no dividend.
  {
    const result = selectMetrics({
      profitMargin: 0.05,
      sector: 'Real Estate',
      industry: null,
      hasForwardEarnings: true,
      dividendYield: 0,
    });
    assertArrayEqual(result.primary, ['P/B'], 'REIT-by-sector primary (no dividend)');
    assertArrayEqual(result.secondary, ['EV/EBITDA', 'Forward P/E'], 'REIT-by-sector secondary');
  }

  // Bank, profitable — P/E stays, P/B added, nothing hidden.
  {
    const result = selectMetrics({
      profitMargin: 0.25,
      sector: 'Financial Services',
      industry: 'Banks—Regional',
      hasForwardEarnings: true,
      dividendYield: 0.03,
    });
    assertArrayEqual(result.primary, ['P/E', 'P/B'], 'bank profitable primary');
    assertArrayEqual(result.secondary, ['Dividend Yield'], 'bank profitable secondary');
    assertArrayEqual(result.hideMetrics, [], 'bank profitable hideMetrics');
    if (result.note !== undefined) throw new Error(`Expected no note for bank, got ${JSON.stringify(result.note)}`);
  }

  // Bank, unprofitable — P/E dropped from primary and hidden.
  {
    const result = selectMetrics({
      profitMargin: -0.02,
      sector: 'Financial Services',
      industry: 'Banks—Regional',
      hasForwardEarnings: false,
      dividendYield: null,
    });
    assertArrayEqual(result.primary, ['P/B'], 'bank unprofitable primary');
    assertArrayEqual(result.hideMetrics, ['P/E'], 'bank unprofitable hideMetrics');
  }

  // Insurance matches the same bank/insurer rule.
  {
    const result = selectMetrics({
      profitMargin: 0.1,
      sector: 'Financial Services',
      industry: 'Insurance—Property & Casualty',
      hasForwardEarnings: false,
      dividendYield: null,
    });
    assertArrayEqual(result.primary, ['P/E', 'P/B'], 'insurer primary');
  }

  // Cyclical via industry match, profitable.
  {
    const result = selectMetrics({
      profitMargin: 0.18,
      sector: 'Technology',
      industry: 'Semiconductors',
      hasForwardEarnings: true,
      dividendYield: 0.01,
    });
    assertArrayEqual(result.primary, ['EV/EBITDA', 'P/S'], 'semiconductor primary');
    assertArrayEqual(result.secondary, ['P/B', 'Forward P/E'], 'semiconductor secondary');
    assertArrayEqual(result.hideMetrics, [], 'semiconductor profitable hideMetrics');
  }

  // Cyclical via sector fallback (industry unknown), unprofitable.
  {
    const result = selectMetrics({
      profitMargin: -0.03,
      sector: 'Basic Materials',
      industry: null,
      hasForwardEarnings: false,
      dividendYield: null,
    });
    assertArrayEqual(result.primary, ['EV/EBITDA', 'P/S'], 'mining-by-sector primary');
    assertArrayEqual(result.hideMetrics, ['P/E'], 'mining-by-sector hideMetrics (unprofitable)');
  }

  // Plain profitable default — every optional extra present.
  {
    const result = selectMetrics({
      profitMargin: 0.2,
      sector: 'Consumer Cyclical',
      industry: 'Restaurants',
      hasForwardEarnings: true,
      dividendYield: 0.015,
    });
    assertArrayEqual(result.primary, ['P/E'], 'default primary');
    assertArrayEqual(result.secondary, ['Forward P/E', 'P/B', 'EV/EBITDA'], 'default secondary');
    assertArrayEqual(result.hideMetrics, [], 'default hideMetrics');
  }

  // Plain default, no forward earnings, no dividend.
  {
    const result = selectMetrics({
      profitMargin: 0.2,
      sector: 'Consumer Cyclical',
      industry: 'Restaurants',
      hasForwardEarnings: false,
      dividendYield: 0,
    });
    assertArrayEqual(result.secondary, ['P/B', 'EV/EBITDA'], 'default secondary, no forward P/E');
  }

  // Unknown profitability (null margin), no sector match — falls through to default, NOT unprofitable.
  {
    const result = selectMetrics({
      profitMargin: null,
      sector: 'Consumer Cyclical',
      industry: 'Restaurants',
      hasForwardEarnings: false,
      dividendYield: null,
    });
    assertArrayEqual(result.primary, ['P/E'], 'unknown-margin treated as default, not unprofitable');
  }

  console.log('PASS: selectMetrics handles REIT, bank/insurer, cyclical, unprofitable, and default cases correctly');
}

main();
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx scripts/test-metric-selector.ts`
Expected: FAIL — module resolution error, something like `Cannot find module '../lib/finance/metric-selector'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `lib/finance/metric-selector.ts` with this exact content:

```ts
/**
 * metric-selector — picks which valuation metrics are relevant for a
 * company instead of always showing P/E, P/B, and EV/EBITDA regardless of
 * whether they mean anything (e.g. a trailing P/E on an unprofitable
 * company, or on a REIT where depreciation distorts earnings).
 */

export type ValuationMetric = 'P/E' | 'Forward P/E' | 'P/B' | 'EV/EBITDA' | 'P/S' | 'Dividend Yield';

export interface MetricSelectorInput {
  /** Fraction, e.g. -0.006 = -0.6%. Null/undefined = unknown — never assumed unprofitable. */
  profitMargin: number | null | undefined;
  /** TwelveData sector taxonomy, e.g. "Real Estate", "Financial Services", "Technology". Never "REIT"/"Bank"/"Semiconductor" — those are industry values. */
  sector: string | null | undefined;
  /** Finer-grained than sector, e.g. "REIT—Diversified", "Banks—Regional", "Semiconductors". Preferred over sector when present. */
  industry?: string | null | undefined;
  /** Whether a forward P/E value exists (peRatioForward != null). */
  hasForwardEarnings: boolean;
  /** Fraction. Only ever recommended as a metric when positive. */
  dividendYield?: number | null | undefined;
}

export interface MetricSelection {
  primary: ValuationMetric[];
  secondary: ValuationMetric[];
  hideMetrics: ValuationMetric[];
  note?: string;
}

const REIT_RE = /reit/i;
const BANK_OR_INSURER_RE = /bank|insurance/i;
const CYCLICAL_RE = /semiconductor|mining|steel|coal|metals|oil & gas/i;

function hasPositiveDividend(dividendYield: number | null | undefined): boolean {
  return dividendYield != null && dividendYield > 0;
}

export function selectMetrics(input: MetricSelectorInput): MetricSelection {
  const { profitMargin, sector, industry, hasForwardEarnings, dividendYield } = input;

  const unprofitable = profitMargin != null && profitMargin < 0;
  const dividendMetric: ValuationMetric[] = hasPositiveDividend(dividendYield) ? ['Dividend Yield'] : [];
  const forwardPeMetric: ValuationMetric[] = hasForwardEarnings ? ['Forward P/E'] : [];

  const isReit = industry != null ? REIT_RE.test(industry) : sector === 'Real Estate';
  if (isReit) {
    return {
      primary: ['P/B', ...dividendMetric],
      secondary: ['EV/EBITDA', ...forwardPeMetric],
      hideMetrics: ['P/E'],
      note: 'P/E is skewed by real estate depreciation — P/B and yield are more reliable here.',
    };
  }

  const isBankOrInsurer = industry != null && BANK_OR_INSURER_RE.test(industry);
  if (isBankOrInsurer) {
    return {
      primary: unprofitable ? ['P/B'] : ['P/E', 'P/B'],
      secondary: dividendMetric,
      hideMetrics: unprofitable ? ['P/E'] : [],
    };
  }

  const isCyclical =
    industry != null ? CYCLICAL_RE.test(industry) : sector === 'Basic Materials' || sector === 'Energy';
  if (isCyclical) {
    return {
      primary: ['EV/EBITDA', 'P/S'],
      secondary: ['P/B', ...forwardPeMetric],
      hideMetrics: unprofitable ? ['P/E'] : [],
      note: 'Earnings swing heavily with the commodity/demand cycle — EV/EBITDA and P/S smooth that out.',
    };
  }

  if (unprofitable) {
    return {
      primary: ['P/S', ...forwardPeMetric],
      secondary: ['EV/EBITDA'],
      hideMetrics: ['P/E'],
      note: hasForwardEarnings ? 'Forward P/E assumes the company turns profitable.' : undefined,
    };
  }

  return {
    primary: ['P/E'],
    secondary: [...forwardPeMetric, 'P/B', 'EV/EBITDA'],
    hideMetrics: [],
  };
}
```

- [ ] **Step 4: Run the verification script again to confirm it passes**

Run: `npx tsx scripts/test-metric-selector.ts`
Expected: PASS — prints `PASS: selectMetrics handles REIT, bank/insurer, cyclical, unprofitable, and default cases correctly` and exits 0. If any assertion throws, re-check that branch against the decision table in the spec (`docs/superpowers/specs/2026-08-07-metric-selector-design.md`) — do not weaken a test to make it pass.

- [ ] **Step 5: Wire the npm script**

In `package.json`, add this entry to the `"scripts"` block, next to the other `test-*` entries (e.g. right after `"test-ai-translate": "tsx scripts/test-ai-translate.ts",`):

```json
    "test-metric-selector": "tsx scripts/test-metric-selector.ts",
```

- [ ] **Step 6: Run it via the npm script to confirm the wiring works**

Run: `npm run test-metric-selector`
Expected: Same PASS output as Step 4, run through npm this time.

- [ ] **Step 7: Lint**

Run: `npm run lint`
Expected: No new errors from the two new files (warnings elsewhere in the repo are pre-existing and acceptable per `CLAUDE.md`).

- [ ] **Step 8: Commit**

```bash
git add lib/finance/metric-selector.ts scripts/test-metric-selector.ts package.json
git commit -m "feat: add MetricSelector utility for sector-aware valuation metrics

Picks relevant valuation metrics (P/E, Forward P/E, P/B, EV/EBITDA, P/S,
Dividend Yield) based on profitability and sector/industry instead of
always showing P/E+P/B+EV/EBITDA regardless of whether they're meaningful
(e.g. P/E on an unprofitable company, or on a REIT where depreciation
distorts it). Utility only — not yet wired into StatisticsGrid.tsx."
```
