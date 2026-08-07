# Wire MetricSelector into StatisticsGrid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the stock page's "Key Numbers" card actually use `selectMetrics()` to decide which valuation metrics to show, fixing the original bug (CrowdStrike showing "P/E (TTM) 716.55" while unprofitable) end-to-end — including the missing P/S data that the fix depends on.

**Architecture:** Two small pure-logic additions (a `psRatio` data field, and a `statistics-grid-metrics.ts` helper module resolving which card goes where), then a rendering rewrite of `StatisticsGrid.tsx` driven by those helpers instead of the current unconditional/`isSimplified`-only gating.

**Tech Stack:** TypeScript, React (Next.js App Router client component), `tsx` for verification scripts (no test framework in this repo).

## Global Constraints

- `hideMetrics` means fully excluded — never a card, never an "All statistics" disclosure row (spec: Goals, confirmed with user).
- Simplified ("beginner") mode shows exactly one adapted valuation card (`selection.primary[0]`), never zero and never a forced P/E (spec: Goals, confirmed with user).
- P/E and P/S share one fixed grid slot (the "headline multiple" position) rather than the grid dynamically reordering — per the decision table in `docs/superpowers/specs/2026-08-07-metric-selector-design.md`, they never both appear in `primary` for the same company.
- Do not touch Range, Market Cap, Margin/Growth, Dividend, or Beta cards — `selectMetrics` only governs P/E, Forward P/E, P/B, EV/EBITDA, P/S.
- Do not modify `lib/market-data/screener-stats.ts` or `app/api/cron/prefetch-market-data/route.ts` — they already map `ps_ratio` and are outside this feature's path.
- This is UI/UX work on a shipped surface — per `CLAUDE.md`, check `.agents/skills/ui-ux-pro-max/SKILL.md` and run `/impeccable polish` before considering this done (Task 4).

---

### Task 1: P/S data plumbing

**Files:**
- Modify: `lib/twelvedata/twelvedata-client.ts:830-933`
- Modify: `app/api/stock/[ticker]/snapshot/route.ts:98-136`

**Interfaces:**
- Produces: `CompanyStatistics.psRatio: number | null` (consumed by Task 3's `StatisticsGrid.tsx` changes).

- [ ] **Step 1: Add `psRatio` to the `CompanyStatistics` interface**

In `lib/twelvedata/twelvedata-client.ts`, in the `CompanyStatistics` interface (~line 830), add `psRatio` right after `evToEbitda`:

```ts
export interface CompanyStatistics {
  symbol: string;
  marketCap: number | null;
  enterpriseValue: number | null;
  peRatioTTM: number | null;
  peRatioForward: number | null;
  pbRatio: number | null;
  evToEbitda: number | null;
  psRatio: number | null;
  beta: number | null;
  week52High: number | null;
  week52Low: number | null;
  avgVolume: number | null;
  sharesFloat: number | null;
  shortRatio: number | null;
  dividendYield: number | null;
  profitMargin: number | null;
  revenueGrowthTTM: number | null;
  epsGrowthTTM: number | null;
}
```

- [ ] **Step 2: Add `price_to_sales_ttm` to the raw response type and map it**

In the same file, in `TwelveDataStatisticsResponse`'s `valuations_metrics` (~line 852), add the raw field:

```ts
    valuations_metrics?: {
      market_capitalization?: number | null;
      enterprise_value?: number | null;
      trailing_pe?: number | null;
      forward_pe?: number | null;
      price_to_book_mrq?: number | null;
      price_to_sales_ttm?: number | null;
      enterprise_to_ebitda?: number | null;
    };
```

Then in `getStatistics()`'s return object (~line 914-933), add the mapping right after `evToEbitda`:

```ts
  return {
    symbol,
    marketCap: v.market_capitalization ?? null,
    enterpriseValue: v.enterprise_value ?? null,
    peRatioTTM: v.trailing_pe ?? null,
    peRatioForward: v.forward_pe ?? null,
    pbRatio: v.price_to_book_mrq ?? null,
    evToEbitda: v.enterprise_to_ebitda ?? null,
    psRatio: v.price_to_sales_ttm ?? null,
    beta: sp.beta ?? null,
    week52High: sp.fifty_two_week_high ?? null,
    week52Low: sp.fifty_two_week_low ?? null,
    avgVolume: ss.avg_90_volume ?? null,
    sharesFloat: ss.float_shares ?? null,
    shortRatio: ss.short_ratio ?? null,
    dividendYield: d.forward_annual_dividend_yield ?? null,
    profitMargin: f.profit_margin ?? null,
    revenueGrowthTTM: fi.quarterly_revenue_growth ?? null,
    epsGrowthTTM: fi.quarterly_earnings_growth_yoy ?? null,
  };
```

- [ ] **Step 3: Map the same field in the snapshot route**

In `app/api/stock/[ticker]/snapshot/route.ts`, inside the `statistics = { ... }` object builder (~line 111-128), add `psRatio` right after `evToEbitda`:

```ts
        statistics = {
          marketCap: v.market_capitalization ?? null,
          enterpriseValue: v.enterprise_value ?? null,
          peRatioTTM: v.trailing_pe ?? null,
          peRatioForward: v.forward_pe ?? null,
          pbRatio: v.price_to_book_mrq ?? null,
          evToEbitda: v.enterprise_to_ebitda ?? null,
          psRatio: v.price_to_sales_ttm ?? null,
          beta: sp.beta ?? null,
          week52High: sp.fifty_two_week_high ?? null,
          week52Low: sp.fifty_two_week_low ?? null,
          avgVolume: ss.avg_90_volume ?? null,
          sharesFloat: ss.float_shares ?? null,
          shortRatio: ss.short_ratio ?? null,
          dividendYield: d.forward_annual_dividend_yield ?? null,
          profitMargin: (f.profit_margin as number) ?? null,
          revenueGrowthTTM: fi.quarterly_revenue_growth ?? null,
          epsGrowthTTM: fi.quarterly_earnings_growth_yoy ?? null,
        } as unknown as Statistics;
```

(`v` in this file is already loosely typed as `Record<string, number>`, so no separate raw-type change is needed here — just the new mapped line.)

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add lib/twelvedata/twelvedata-client.ts app/api/stock/[ticker]/snapshot/route.ts
git commit -m "feat: map P/S ratio into CompanyStatistics

Same /statistics call already being made — price_to_sales_ttm was
returned but never mapped. Needed so selectMetrics' P/S recommendation
(unprofitable companies) has a real value to render. Both the direct
getStatistics() path and the snapshot route's pre-seeded cache path are
updated, since the snapshot route's cache is checked first on most
page loads."
```

---

### Task 2: Pure card-routing helpers + verification script

**Files:**
- Create: `components/stock/statistics-grid-metrics.ts`
- Create: `scripts/test-statistics-grid-metrics.ts`
- Modify: `package.json` (add one npm script entry)

**Interfaces:**
- Consumes: `MetricSelection`, `ValuationMetric` from `lib/finance/metric-selector.ts` (Task 1's earlier work, already shipped).
- Produces (consumed by Task 3's `StatisticsGrid.tsx` changes):
  ```ts
  export function showCard(selection: MetricSelection, isSimplified: boolean, metric: ValuationMetric): boolean;
  export function headlineMetric(selection: MetricSelection, isSimplified: boolean): 'P/E' | 'P/S' | null;
  export function foldsForwardPe(selection: MetricSelection, metric: ValuationMetric): boolean;
  export function noteFor(selection: MetricSelection, metric: ValuationMetric): string | undefined;
  ```

- [ ] **Step 1: Write the failing verification script**

Create `scripts/test-statistics-grid-metrics.ts`:

```ts
// Verifies the pure rendering-decision helpers in statistics-grid-metrics.ts
// (showCard, headlineMetric, foldsForwardPe, noteFor) against the same
// scenarios covered in test-metric-selector.ts, since these helpers are what
// actually decides which MetricCard renders where on the stock page.
import { selectMetrics, type MetricSelectorInput } from '../lib/finance/metric-selector';
import { showCard, headlineMetric, foldsForwardPe, noteFor } from '../components/stock/statistics-grid-metrics';

function assertEqual<T>(actual: T, expected: T, msg: string) {
  if (actual !== expected) throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function main() {
  // Default profitable — plain default rule, P/E is the headline.
  {
    const input: MetricSelectorInput = {
      profitMargin: 0.2,
      sector: 'Consumer Cyclical',
      industry: 'Restaurants',
      hasForwardEarnings: true,
      dividendYield: 0.015,
    };
    const selection = selectMetrics(input);
    assertEqual(headlineMetric(selection, false), 'P/E', 'default headline (full)');
    assertEqual(showCard(selection, false, 'P/B'), true, 'default P/B shown (full)');
    assertEqual(showCard(selection, false, 'EV/EBITDA'), true, 'default EV/EBITDA shown (full)');
    assertEqual(foldsForwardPe(selection, 'P/E'), true, 'default folds forward P/E into P/E card');
    assertEqual(foldsForwardPe(selection, 'P/B'), false, 'default does not fold forward P/E into P/B card');
    assertEqual(noteFor(selection, 'P/E'), undefined, 'default has no note');
    assertEqual(headlineMetric(selection, true), 'P/E', 'default headline (simplified)');
    assertEqual(showCard(selection, true, 'P/B'), false, 'default P/B hidden in simplified mode');
  }

  // Unprofitable, forward earnings exist — the CrowdStrike case.
  {
    const input: MetricSelectorInput = {
      profitMargin: -0.006,
      sector: 'Technology',
      industry: 'Software—Infrastructure',
      hasForwardEarnings: true,
      dividendYield: null,
    };
    const selection = selectMetrics(input);
    assertEqual(showCard(selection, false, 'P/E'), false, 'unprofitable P/E never shown');
    assertEqual(headlineMetric(selection, false), 'P/S', 'unprofitable headline is P/S');
    assertEqual(foldsForwardPe(selection, 'P/S'), true, 'unprofitable folds forward P/E into P/S card');
    assertEqual(foldsForwardPe(selection, 'EV/EBITDA'), false, 'unprofitable does not fold forward P/E into EV/EBITDA card');
    assertEqual(typeof noteFor(selection, 'P/S'), 'string', 'unprofitable note attaches to P/S card');
    assertEqual(noteFor(selection, 'EV/EBITDA'), undefined, 'unprofitable note does not attach to EV/EBITDA card');
    assertEqual(headlineMetric(selection, true), 'P/S', 'unprofitable headline is P/S even in simplified mode');
    assertEqual(showCard(selection, true, 'P/E'), false, 'unprofitable P/E never shown, even simplified');
  }

  // REIT — P/E hidden, P/B is the headline substitute, EV/EBITDA is secondary.
  {
    const input: MetricSelectorInput = {
      profitMargin: 0.15,
      sector: 'Real Estate',
      industry: 'REIT—Diversified',
      hasForwardEarnings: true,
      dividendYield: 0.04,
    };
    const selection = selectMetrics(input);
    assertEqual(headlineMetric(selection, false), null, 'REIT has no P/E-or-P/S headline card');
    assertEqual(showCard(selection, false, 'P/B'), true, 'REIT P/B shown');
    assertEqual(showCard(selection, false, 'EV/EBITDA'), true, 'REIT EV/EBITDA shown (secondary)');
    assertEqual(foldsForwardPe(selection, 'P/B'), true, 'REIT folds forward P/E into P/B card (its primary[0])');
    assertEqual(foldsForwardPe(selection, 'EV/EBITDA'), false, 'REIT does not fold forward P/E into EV/EBITDA card');
    assertEqual(typeof noteFor(selection, 'P/B'), 'string', 'REIT note attaches to P/B card');
    assertEqual(showCard(selection, true, 'P/B'), true, 'REIT P/B shown in simplified mode');
    assertEqual(showCard(selection, true, 'EV/EBITDA'), false, 'REIT EV/EBITDA hidden in simplified mode');
  }

  // Cyclical (semiconductor), profitable — EV/EBITDA is primary[0], not P/S.
  {
    const input: MetricSelectorInput = {
      profitMargin: 0.18,
      sector: 'Technology',
      industry: 'Semiconductors',
      hasForwardEarnings: true,
      dividendYield: 0.01,
    };
    const selection = selectMetrics(input);
    assertEqual(headlineMetric(selection, false), 'P/S', 'cyclical headline is P/S (P/E not selected)');
    assertEqual(showCard(selection, false, 'EV/EBITDA'), true, 'cyclical EV/EBITDA shown');
    assertEqual(foldsForwardPe(selection, 'EV/EBITDA'), true, 'cyclical folds forward P/E into EV/EBITDA card (primary[0])');
    assertEqual(foldsForwardPe(selection, 'P/S'), false, 'cyclical does not fold forward P/E into P/S card');
    assertEqual(typeof noteFor(selection, 'EV/EBITDA'), 'string', 'cyclical note attaches to EV/EBITDA card');
    assertEqual(noteFor(selection, 'P/S'), undefined, 'cyclical note does not attach to P/S card');
  }

  // Bank, profitable — Forward P/E is never proposed for banks, so it never folds anywhere.
  {
    const input: MetricSelectorInput = {
      profitMargin: 0.25,
      sector: 'Financial Services',
      industry: 'Banks—Regional',
      hasForwardEarnings: true,
      dividendYield: 0.03,
    };
    const selection = selectMetrics(input);
    assertEqual(headlineMetric(selection, false), 'P/E', 'bank headline is P/E');
    assertEqual(showCard(selection, false, 'P/B'), true, 'bank P/B shown');
    assertEqual(foldsForwardPe(selection, 'P/E'), false, 'bank never folds forward P/E (not proposed by the selector)');
  }

  console.log('PASS: statistics-grid-metrics helpers route cards correctly across default, unprofitable, REIT, cyclical, and bank scenarios');
}

main();
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx scripts/test-statistics-grid-metrics.ts`
Expected: FAIL — `Cannot find module '../components/stock/statistics-grid-metrics'`.

- [ ] **Step 3: Write the implementation**

Create `components/stock/statistics-grid-metrics.ts`:

```ts
import type { MetricSelection, ValuationMetric } from '@/lib/finance/metric-selector';

/**
 * Whether `metric` should render as a MetricCard given the selector's result
 * and whether the page is in simplified ("beginner") mode. In simplified
 * mode only the top primary metric renders as a card — everything else
 * demotes to the quiet "All statistics" disclosure row.
 */
export function showCard(selection: MetricSelection, isSimplified: boolean, metric: ValuationMetric): boolean {
  if (selection.hideMetrics.includes(metric)) return false;
  if (isSimplified) return selection.primary[0] === metric;
  return selection.primary.includes(metric) || selection.secondary.includes(metric);
}

/**
 * Which metric (if any) occupies the shared "headline multiple" card slot.
 * P/E and P/S never both appear in `primary` for the same company (see
 * lib/finance/metric-selector.ts's decision table), so they compete for one
 * fixed grid slot instead of each getting a dedicated position.
 */
export function headlineMetric(selection: MetricSelection, isSimplified: boolean): 'P/E' | 'P/S' | null {
  if (showCard(selection, isSimplified, 'P/E')) return 'P/E';
  if (showCard(selection, isSimplified, 'P/S')) return 'P/S';
  return null;
}

/** Whether the Forward P/E detail line should nest inside `metric`'s card. */
export function foldsForwardPe(selection: MetricSelection, metric: ValuationMetric): boolean {
  const recommended = selection.primary.includes('Forward P/E') || selection.secondary.includes('Forward P/E');
  return recommended && selection.primary[0] === metric;
}

/** `selection.note`, but only for the card that "owns" it (the top primary metric). */
export function noteFor(selection: MetricSelection, metric: ValuationMetric): string | undefined {
  return selection.primary[0] === metric ? selection.note : undefined;
}
```

- [ ] **Step 4: Run the verification script again to confirm it passes**

Run: `npx tsx scripts/test-statistics-grid-metrics.ts`
Expected: PASS — prints `PASS: statistics-grid-metrics helpers route cards correctly across default, unprofitable, REIT, cyclical, and bank scenarios`.

- [ ] **Step 5: Wire the npm script**

In `package.json`, add this entry right after `"test-metric-selector": "tsx scripts/test-metric-selector.ts",`:

```json
    "test-statistics-grid-metrics": "tsx scripts/test-statistics-grid-metrics.ts",
```

- [ ] **Step 6: Run it via the npm script, then lint**

Run: `npm run test-statistics-grid-metrics`
Expected: Same PASS output.

Run: `npm run lint`
Expected: No new errors.

- [ ] **Step 7: Commit**

```bash
git add components/stock/statistics-grid-metrics.ts scripts/test-statistics-grid-metrics.ts package.json
git commit -m "feat: add pure card-routing helpers for the stock page's valuation cards

showCard/headlineMetric/foldsForwardPe/noteFor resolve which of
P/E/P/S/P/B/EV-EBITDA gets a card, which one shares the headline slot,
where the Forward P/E detail line nests, and which card owns
selectMetrics' caveat note. Colocated with StatisticsGrid.tsx as a
plain .ts module (same pattern as components/tools/calendar/day-model.ts)
so the branching logic is unit-testable independent of React."
```

---

### Task 3: New P/S copy + wire everything into StatisticsGrid.tsx

**Files:**
- Modify: `lib/finance/metric-insights.ts`
- Modify: `components/stock/StatisticsGrid.tsx`

**Interfaces:**
- Consumes: `selectMetrics` (`lib/finance/metric-selector.ts`), `showCard`/`headlineMetric`/`foldsForwardPe`/`noteFor` (Task 2), `psInsight`/`PS_DOMAIN` (this task).

- [ ] **Step 1: Add `psInsight` and `PS_DOMAIN` to `metric-insights.ts`**

In `lib/finance/metric-insights.ts`, right after `evEbitdaInsight` (~line 113):

```ts
export function evEbitdaInsight(ev: number | null): string {
  if (ev == null || ev <= 0) return '';
  return `Valued at ${ev.toFixed(1)}× its yearly operating earnings`;
}

/** `peHidden` makes the card self-explanatory even when selectMetrics' `note` is empty. */
export function psInsight(ps: number | null, peHidden: boolean): string {
  if (ps == null || ps <= 0) return '';
  const base = `Priced at ${ps.toFixed(1)}× yearly sales`;
  return peHidden ? `${base} — used instead of P/E since the company isn't profitable yet` : base;
}
```

- [ ] **Step 2: Add a `'ps'` case to `sectorContext`**

In the same file, update `SectorMetricKind` (~line 126):

```ts
export type SectorMetricKind = 'pe' | 'pb' | 'evEbitda' | 'ps' | 'margin' | 'growth' | 'yield' | 'beta';
```

And in `sectorContext`'s switch (~line 150-159), add `'ps'` to the existing "cheaper/pricier" group:

```ts
  switch (kind) {
    // Valuation multiples — lower reads as "cheaper".
    case 'pe':
    case 'pb':
    case 'evEbitda':
    case 'ps':
      return b === 'low'
        ? `Cheaper than most ${s} companies`
        : b === 'high'
          ? `Pricier than most ${s} companies`
          : `Around the ${s} average`;
```

- [ ] **Step 3: Add `PS_DOMAIN`**

In the same file, in the meter-domains block at the bottom (~line 189-196), add after `EV_EBITDA_DOMAIN`:

```ts
export const EV_EBITDA_DOMAIN = { min: 0, max: 30 };
export const PS_DOMAIN = { min: 0, max: 20 };
```

- [ ] **Step 4: Update `StatisticsGrid.tsx` imports**

In `components/stock/StatisticsGrid.tsx`, extend the `lib/finance/metric-insights` import (~line 24-44) to add `psInsight` and `PS_DOMAIN`:

```ts
import {
  week52Insight,
  marketCapBand,
  marketCapInsight,
  peInsight,
  betaInsight,
  dividendInsight,
  marginInsight,
  growthInsight,
  sectorContext,
  pbInsight,
  evEbitdaInsight,
  psInsight,
  PE_DOMAIN,
  MARGIN_DOMAIN,
  GROWTH_DOMAIN,
  YIELD_DOMAIN,
  BETA_DOMAIN,
  PB_DOMAIN,
  EV_EBITDA_DOMAIN,
  PS_DOMAIN,
  type Distribution,
} from '@/lib/finance/metric-insights';
```

Then add two new imports right after the `sector-benchmarks` type import (~line 45):

```ts
import type { SectorBenchmarks } from '@/lib/finance/sector-benchmarks';
import { selectMetrics, type ValuationMetric } from '@/lib/finance/metric-selector';
import { showCard, headlineMetric, foldsForwardPe, noteFor } from '@/components/stock/statistics-grid-metrics';
import type { CompanyStatistics } from '@/lib/twelvedata/twelvedata-client';
import type { SignalValue } from '@/lib/finance/health-score';
```

- [ ] **Step 5: Compute the selection**

Right after `const price = currentPrice ?? null;` (~line 231), before the `// ── Metric cards` comment, add:

```ts
  const selection = selectMetrics({
    profitMargin: s.profitMargin,
    sector,
    industry,
    hasForwardEarnings: s.peRatioForward != null,
    dividendYield: s.dividendYield,
  });
  const headline = headlineMetric(selection, isSimplified);
  const forwardPeDetail = (metric: ValuationMetric) =>
    foldsForwardPe(selection, metric) && s.peRatioForward != null ? (
      <p className="text-xs tabular-nums text-muted-foreground">
        Forward P/E {fmt(s.peRatioForward, 'ratio')}
        {s.peRatioTTM != null && s.peRatioForward < s.peRatioTTM && ' ↓'}
        {s.peRatioTTM != null && s.peRatioForward > s.peRatioTTM && ' ↑'}
      </p>
    ) : null;
```

- [ ] **Step 6: Replace the P/E card block with the P/E-or-P/S headline slot**

Replace this existing block (~line 273-307):

```tsx
  if (s.peRatioTTM != null || s.peRatioForward != null) {
    cards.push(
      <MetricCard
        key="pe"
        label="P/E (TTM)"
        value={fmt(s.peRatioTTM, 'ratio')}
        signal={sig('peRatioTTM')}
        insight={peInsight(s.peRatioTTM, s.peRatioForward)}
        context={sectorContext(s.peRatioTTM, dist('pe_ratio'), 'pe', benchmarkLabel)}
        tourId="stat-p-e-ttm"
        ticker={ticker}
        onAskAI={handleAskAI}
      >
        {s.peRatioTTM != null && s.peRatioTTM > 0 && (
          <MeterBar
            value={s.peRatioTTM}
            min={PE_DOMAIN.min}
            max={PE_DOMAIN.max}
            signal={sig('peRatioTTM')}
            benchmark={dist('pe_ratio') ? { value: dist('pe_ratio')!.median, label: 'typical' } : undefined}
            srLabel={`P/E ratio ${fmt(s.peRatioTTM, 'ratio')} on a 0 to 60 scale`}
            minLabel="0"
            maxLabel="60"
          />
        )}
        {s.peRatioForward != null && (
          <p className="text-xs tabular-nums text-muted-foreground">
            Forward P/E {fmt(s.peRatioForward, 'ratio')}
            {s.peRatioTTM != null && s.peRatioForward < s.peRatioTTM && ' ↓'}
            {s.peRatioTTM != null && s.peRatioForward > s.peRatioTTM && ' ↑'}
          </p>
        )}
      </MetricCard>
    );
  }
```

With:

```tsx
  if (headline === 'P/E' && (s.peRatioTTM != null || s.peRatioForward != null)) {
    cards.push(
      <MetricCard
        key="pe"
        label="P/E (TTM)"
        value={fmt(s.peRatioTTM, 'ratio')}
        signal={sig('peRatioTTM')}
        insight={peInsight(s.peRatioTTM, s.peRatioForward)}
        context={noteFor(selection, 'P/E') ?? sectorContext(s.peRatioTTM, dist('pe_ratio'), 'pe', benchmarkLabel)}
        tourId="stat-p-e-ttm"
        ticker={ticker}
        onAskAI={handleAskAI}
      >
        {s.peRatioTTM != null && s.peRatioTTM > 0 && (
          <MeterBar
            value={s.peRatioTTM}
            min={PE_DOMAIN.min}
            max={PE_DOMAIN.max}
            signal={sig('peRatioTTM')}
            benchmark={dist('pe_ratio') ? { value: dist('pe_ratio')!.median, label: 'typical' } : undefined}
            srLabel={`P/E ratio ${fmt(s.peRatioTTM, 'ratio')} on a 0 to 60 scale`}
            minLabel="0"
            maxLabel="60"
          />
        )}
        {forwardPeDetail('P/E')}
      </MetricCard>
    );
  } else if (headline === 'P/S' && s.psRatio != null && s.psRatio > 0) {
    cards.push(
      <MetricCard
        key="ps"
        label="P/S"
        value={fmt(s.psRatio, 'ratio')}
        insight={psInsight(s.psRatio, selection.hideMetrics.includes('P/E'))}
        context={noteFor(selection, 'P/S') ?? sectorContext(s.psRatio, dist('ps_ratio'), 'ps', benchmarkLabel)}
        tourId="stat-p-s"
        ticker={ticker}
        onAskAI={handleAskAI}
      >
        <MeterBar
          value={s.psRatio}
          min={PS_DOMAIN.min}
          max={PS_DOMAIN.max}
          benchmark={dist('ps_ratio') ? { value: dist('ps_ratio')!.median, label: 'typical' } : undefined}
          srLabel={`Price-to-sales ${fmt(s.psRatio, 'ratio')} on a 0 to 20 scale`}
          minLabel="0"
          maxLabel="20"
        />
        {forwardPeDetail('P/S')}
      </MetricCard>
    );
  }
```

- [ ] **Step 7: Gate the P/B card on `showCard`**

Replace (~line 415):

```tsx
  if (!isSimplified && s.pbRatio != null && s.pbRatio > 0) {
    cards.push(
      <MetricCard
        key="pb"
        label="P/B"
        value={fmt(s.pbRatio, 'ratio')}
        insight={pbInsight(s.pbRatio)}
        context={sectorContext(s.pbRatio, dist('pb_ratio'), 'pb', benchmarkLabel)}
        ticker={ticker}
        onAskAI={handleAskAI}
      >
        <MeterBar
          value={s.pbRatio}
          min={PB_DOMAIN.min}
          max={PB_DOMAIN.max}
          benchmark={dist('pb_ratio') ? { value: dist('pb_ratio')!.median, label: 'typical' } : undefined}
          srLabel={`Price-to-book ${fmt(s.pbRatio, 'ratio')} on a 0 to 10 scale`}
          minLabel="0"
          maxLabel="10"
        />
      </MetricCard>
    );
  }
```

With:

```tsx
  if (showCard(selection, isSimplified, 'P/B') && s.pbRatio != null && s.pbRatio > 0) {
    cards.push(
      <MetricCard
        key="pb"
        label="P/B"
        value={fmt(s.pbRatio, 'ratio')}
        insight={pbInsight(s.pbRatio)}
        context={noteFor(selection, 'P/B') ?? sectorContext(s.pbRatio, dist('pb_ratio'), 'pb', benchmarkLabel)}
        ticker={ticker}
        onAskAI={handleAskAI}
      >
        <MeterBar
          value={s.pbRatio}
          min={PB_DOMAIN.min}
          max={PB_DOMAIN.max}
          benchmark={dist('pb_ratio') ? { value: dist('pb_ratio')!.median, label: 'typical' } : undefined}
          srLabel={`Price-to-book ${fmt(s.pbRatio, 'ratio')} on a 0 to 10 scale`}
          minLabel="0"
          maxLabel="10"
        />
        {forwardPeDetail('P/B')}
      </MetricCard>
    );
  }
```

- [ ] **Step 8: Gate the EV/EBITDA card on `showCard`**

Replace (~line 439):

```tsx
  if (!isSimplified && s.evToEbitda != null && s.evToEbitda > 0) {
    cards.push(
      <MetricCard
        key="ev"
        label="EV/EBITDA"
        value={fmt(s.evToEbitda, 'ratio')}
        insight={evEbitdaInsight(s.evToEbitda)}
        context={sectorContext(s.evToEbitda, dist('ev_to_ebitda'), 'evEbitda', benchmarkLabel)}
        ticker={ticker}
        onAskAI={handleAskAI}
      >
        <MeterBar
          value={s.evToEbitda}
          min={EV_EBITDA_DOMAIN.min}
          max={EV_EBITDA_DOMAIN.max}
          benchmark={dist('ev_to_ebitda') ? { value: dist('ev_to_ebitda')!.median, label: 'typical' } : undefined}
          srLabel={`EV to EBITDA ${fmt(s.evToEbitda, 'ratio')} on a 0 to 30 scale`}
          minLabel="0"
          maxLabel="30"
        />
      </MetricCard>
    );
  }
```

With:

```tsx
  if (showCard(selection, isSimplified, 'EV/EBITDA') && s.evToEbitda != null && s.evToEbitda > 0) {
    cards.push(
      <MetricCard
        key="ev"
        label="EV/EBITDA"
        value={fmt(s.evToEbitda, 'ratio')}
        insight={evEbitdaInsight(s.evToEbitda)}
        context={noteFor(selection, 'EV/EBITDA') ?? sectorContext(s.evToEbitda, dist('ev_to_ebitda'), 'evEbitda', benchmarkLabel)}
        ticker={ticker}
        onAskAI={handleAskAI}
      >
        <MeterBar
          value={s.evToEbitda}
          min={EV_EBITDA_DOMAIN.min}
          max={EV_EBITDA_DOMAIN.max}
          benchmark={dist('ev_to_ebitda') ? { value: dist('ev_to_ebitda')!.median, label: 'typical' } : undefined}
          srLabel={`EV to EBITDA ${fmt(s.evToEbitda, 'ratio')} on a 0 to 30 scale`}
          minLabel="0"
          maxLabel="30"
        />
        {forwardPeDetail('EV/EBITDA')}
      </MetricCard>
    );
  }
```

- [ ] **Step 9: Generalize the disclosure-row fallback**

Replace the `restRows` block (~line 463-475):

```tsx
  // ── Remaining metrics → quiet disclosure rows ────────────────────────────
  // P/B and EV/EBITDA are promoted to cards above (when present); they only fall
  // back to a plain row in simplified mode, where the cards are hidden.
  const restRows: StatRow[] = [
    { label: 'Enterprise Value', value: fmt(s.enterpriseValue, 'currency') },
    { label: 'Avg Volume', value: fmt(s.avgVolume, 'volume') },
    { label: 'Shares Float', value: fmt(s.sharesFloat, 'volume') },
    ...(isSimplified || s.pbRatio == null || s.pbRatio <= 0 ? [{ label: 'P/B', value: fmt(s.pbRatio, 'ratio') }] : []),
    ...(isSimplified || s.evToEbitda == null || s.evToEbitda <= 0 ? [{ label: 'EV/EBITDA', value: fmt(s.evToEbitda, 'ratio') }] : []),
    { label: 'Short Ratio', value: fmt(s.shortRatio, 'ratio') },
    { label: '52W High', value: fmt(s.week52High, 'currency') },
    { label: '52W Low', value: fmt(s.week52Low, 'currency') },
  ].filter((r) => r.value !== '—');
```

With:

```tsx
  // ── Remaining metrics → quiet disclosure rows ────────────────────────────
  // A metric with a value that isn't shown as a card (selected by selectMetrics
  // or the simplified-mode headline) falls back to a plain row here — unless
  // it's in hideMetrics, in which case it's actively misleading and excluded
  // everywhere, not just demoted.
  const demotedRow = (metric: ValuationMetric, label: string, value: number | null): StatRow[] =>
    !selection.hideMetrics.includes(metric) && !showCard(selection, isSimplified, metric)
      ? [{ label, value: fmt(value, 'ratio') }]
      : [];

  const restRows: StatRow[] = [
    { label: 'Enterprise Value', value: fmt(s.enterpriseValue, 'currency') },
    { label: 'Avg Volume', value: fmt(s.avgVolume, 'volume') },
    { label: 'Shares Float', value: fmt(s.sharesFloat, 'volume') },
    ...demotedRow('P/E', 'P/E (TTM)', s.peRatioTTM),
    ...demotedRow('P/S', 'P/S', s.psRatio),
    ...demotedRow('P/B', 'P/B', s.pbRatio),
    ...demotedRow('EV/EBITDA', 'EV/EBITDA', s.evToEbitda),
    { label: 'Short Ratio', value: fmt(s.shortRatio, 'ratio') },
    { label: '52W High', value: fmt(s.week52High, 'currency') },
    { label: '52W Low', value: fmt(s.week52Low, 'currency') },
  ].filter((r) => r.value !== '—');
```

- [ ] **Step 10: Lint**

Run: `npm run lint`
Expected: No new errors.

- [ ] **Step 11: Commit**

```bash
git add lib/finance/metric-insights.ts components/stock/StatisticsGrid.tsx
git commit -m "feat: wire selectMetrics into StatisticsGrid's valuation cards

P/E, P/B, and EV/EBITDA are no longer unconditional — they render based
on selectMetrics' sector-aware pick, with a new P/S card taking the
headline slot for unprofitable/cyclical companies. Forward P/E folds
into whichever card is primary, and selectMetrics' caveat note replaces
the generic sector-context line on that same card. Metrics selectMetrics
doesn't recommend (but doesn't hide) demote to the existing 'All
statistics' disclosure rows instead of disappearing."
```

---

### Task 4: Visual verification + polish pass

**Files:** None (verification only, plus whatever `/impeccable polish` touches).

- [ ] **Step 1: Start the dev server and verify in a browser**

Use the `run` skill to launch the app. Visit the stock page for five real tickers, one per branch, and confirm the Key Numbers card matches expectations:

| Ticker | Expected reason | What to check |
|---|---|---|
| CRWD | Unprofitable software | No P/E card. Headline slot shows P/S with a "used instead of P/E" or Forward-P/E-assumes-profitability insight. |
| A REIT (e.g. O or PLD) | Real estate | No P/E card anywhere (not even in "All statistics"). Headline slot is empty; P/B is the first card with a depreciation caveat in its context line. |
| A bank (e.g. JPM or WFC) | Banks—* industry | P/E card still shows (banks keep it), P/B card also shows. No caveat note. |
| A semiconductor (e.g. NVDA or AMD), if profitable | Semiconductors industry | EV/EBITDA and P/S both show as cards; if P/E has a value it appears only in "All statistics", not as a card. |
| A plain profitable default (e.g. AAPL) | No special sector | Behaves exactly as before — P/E card with Forward P/E nested inside, P/B and EV/EBITDA cards. |

Also toggle simplified/beginner mode (or check a beginner-tier test account) on the CRWD and REIT pages specifically, to confirm exactly one adapted card shows (P/S / P/B respectively) rather than zero or a forced P/E.

If any real ticker's `sector`/`industry` values don't match the expected branch (e.g. a REIT's `industry` string doesn't contain "REIT"), that's a real finding — investigate the actual value via the "All statistics" disclosure or a direct API check, and adjust the regex in `lib/finance/metric-selector.ts` rather than assuming the plan's expectations are correct.

- [ ] **Step 2: Polish pass**

Run: `/impeccable polish components/stock/StatisticsGrid.tsx`

Address anything it flags (spacing/alignment, interaction states, copy consistency) before considering this shipped.

- [ ] **Step 3: Final lint check**

Run: `npm run lint`
Expected: No new errors.

- [ ] **Step 4: Commit any polish fixes**

Only if Step 2 produced changes:

```bash
git add components/stock/StatisticsGrid.tsx
git commit -m "polish: refine StatisticsGrid valuation card visuals"
```
