# MetricSelector — Design Spec

**Date:** 2026-08-07
**Status:** Draft, pending review

## Problem

The stock page's "Key Numbers" card (`components/stock/StatisticsGrid.tsx`) always renders P/E (TTM), P/B, and EV/EBITDA as separate cards, regardless of whether those metrics mean anything for the company being shown. For an unprofitable company this produces nonsensical output — e.g. CrowdStrike (CRWD) shows "P/E (TTM) 716.55" next to "-0.60% profit margin," which is meaningless: an unprofitable company doesn't have a valid trailing P/E. The same problem applies more broadly — REITs, banks, and cyclical (semiconductor/mining) companies all have sectors where the default valuation multiples are the wrong lens.

## Goals

- A pure, unit-testable `MetricSelector` utility in `lib/finance/` that, given a company's fundamentals and sector/industry, returns which valuation metrics are most relevant (`primary`), which are useful supporting context (`secondary`), which should be hidden as actively misleading (`hideMetrics`), and an optional plain-language caveat (`note`).
- Correctly handles: unprofitable companies, REITs, banks/insurers, and cyclicals (semiconductor/mining/metals/energy), plus a sensible default for everything else.
- Metric vocabulary is limited to what BullPen can actually compute today (see Non-goals).

## Non-goals (this pass)

- **Wiring the selector into `StatisticsGrid.tsx`.** This pass ships the decision function only, not the UI change. `StatisticsGrid.tsx`'s unconditional P/E/P/B/EV-EBITDA cards are untouched. Wiring it in — and the visual-design pass that requires under `CLAUDE.md`'s UI/UX standard — is a separate follow-up.
- **ROE and FFO/Share.** Neither exists anywhere in BullPen's TwelveData integration today. ROE would require the ~101-credit `/balance_sheet` call (`CLAUDE.md`'s cost table flags this as expensive); FFO/Share isn't offered by TwelveData's `/statistics` endpoint at all. The selector never recommends metrics BullPen can't supply a value for. REITs get `P/B` + `Dividend Yield` instead of `P/B` + `ROE`/FFO.
- **`P/S` mapping into `CompanyStatistics`.** TwelveData's `/statistics` response already includes `price_to_sales_ttm` (used today in `screener-stats.ts:107` for the screener), but `getStatistics()` in `lib/twelvedata/twelvedata-client.ts` doesn't map it into `CompanyStatistics` yet. `MetricSelector` can recommend `'P/S'` as a metric name without this mapping existing (it only returns strings), but actually rendering a P/S card requires that follow-up mapping — noted here so it isn't lost, not addressed in this pass.
- **Margin, Growth, Beta.** These aren't valuation multiples and already have their own always-shown cards in `StatisticsGrid.tsx`; out of scope for a valuation-metric selector.

## Interface

```ts
// lib/finance/metric-selector.ts

export type ValuationMetric = 'P/E' | 'Forward P/E' | 'P/B' | 'EV/EBITDA' | 'P/S' | 'Dividend Yield';

export interface MetricSelectorInput {
  /** Fraction, e.g. -0.006 = -0.6%. Null/undefined = unknown, treated as "can't tell, don't assume unprofitable." */
  profitMargin: number | null | undefined;
  /** e.g. "Real Estate", "Financial Services", "Technology". TwelveData sector taxonomy — never "REIT"/"Bank"/"Semiconductor". */
  sector: string | null | undefined;
  /** e.g. "REIT—Diversified", "Banks—Regional", "Semiconductors". Preferred over sector when present — finer-grained and closer to what the spec's original examples meant. */
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

export function selectMetrics(input: MetricSelectorInput): MetricSelection;
```

Two deliberate deviations from the metric-selection prompt's originally proposed input shape:

- **No `netIncome`/`revenue`.** Neither is used by any decision rule below — profitability is `profitMargin < 0`, and `MetricSelection` only returns metric *names*, not values, so raw revenue was never needed to decide. BullPen's `CompanyStatistics` doesn't carry raw net income or revenue today either (only the `profitMargin` fraction), so requiring them would force a caller to fetch data that doesn't otherwise exist.
- **`industry` added.** TwelveData's `sector` field is coarse ("Real Estate" covers REITs and non-REIT real estate services firms like CBRE; "Financial Services" covers banks, insurers, asset managers, and capital-markets firms alike). `industry` is the field that actually says "REIT—Diversified" or "Banks—Regional". This mirrors the industry-preferred/sector-fallback pattern `lib/finance/sector-benchmarks.ts` already uses for the same reason.

## Decision logic

Evaluated as an ordered chain — first matching rule wins for `primary`/`hideMetrics`/`note`:

| # | Condition | `primary` | `secondary` | `hideMetrics` | `note` |
|---|---|---|---|---|---|
| 1 | **REIT** — `industry` matches `/reit/i`, else `sector === 'Real Estate'` | `P/B`, `Dividend Yield` | `EV/EBITDA` (+ `Forward P/E` if available) | `P/E` | "P/E is skewed by real estate depreciation — P/B and yield are more reliable here." |
| 2 | **Bank/Insurer** — `industry` matches `/bank\|insurance/i` | `P/E`, `P/B` (`P/E` dropped if unprofitable) | `Dividend Yield` | `P/E` only if unprofitable | — |
| 3 | **Cyclical** — `industry` matches `/semiconductor\|mining\|steel\|coal\|metals\|oil & gas/i`, else (`industry` absent and) `sector` is `'Basic Materials'` or `'Energy'` | `EV/EBITDA`, `P/S` | `P/B` (+ `Forward P/E` if available) | `P/E` only if unprofitable | "Earnings swing heavily with the commodity/demand cycle — EV/EBITDA and P/S smooth that out." |
| 4 | **Unprofitable** — `profitMargin < 0`, no sector rule above matched | `P/S` (+ `Forward P/E` if available) | `EV/EBITDA` | `P/E` | "Forward P/E assumes the company turns profitable." (only when `hasForwardEarnings`) |
| 5 | **Default** | `P/E` | `Forward P/E` (if available), `P/B`, `EV/EBITDA` | — | — |

Notes on the table:

- Rows 1–3 are checked ahead of profitability — sector/industry identity is the stronger signal (an unprofitable REIT still wants `P/B`+yield, not `P/S`).
- `'Dividend Yield'` is only ever added when `dividendYield` is a positive number; a non-payer never gets it recommended.
- This splits the original "REITs/Banks → P/B + ROE" bucket into two separate rules, because they aren't alike: REIT P/E is structurally broken (non-cash depreciation distorts trailing earnings), so it's hidden. Bank P/E is a legitimate, commonly-used number — banks just benefit from `P/B` as a *second* primary lens (balance-sheet strength), not a replacement.

## Implementation approach

A plain sequential `if / else if` chain, not a declarative rule table. At 5 branches a rule-table (`Array<{match, result}>`) adds indirection without a real payoff — it would only be worth it if many more sector buckets were expected, which isn't the ask here.

**File:** `lib/finance/metric-selector.ts` — pure function, no I/O, alongside the existing `metric-insights.ts`/`sector-benchmarks.ts`/`health-score.ts` in that directory.

## Verification

This repo has no test framework; pure logic like `lib/finance/health-score.ts` is instead checked via a one-off `tsx` script wired to an npm command (`npm run test-score`, per `CLAUDE.md`). This follows the same convention:

- New `scripts/test-metric-selector.ts`, covering at minimum: the CrowdStrike case from the originating screenshot (unprofitable software), a REIT, a bank, a cyclical (semiconductor), and a plain profitable default (each with and without forward earnings, and with/without a dividend).
- New `npm run test-metric-selector` script entry in `package.json`, matching the existing `test-score`/`test-signals`/`test-ai` naming.

## Open implementation details (not blocking, just noted)

- Exact regex boundaries for the `industry` substring matches (row 2/3) — e.g. whether `/oil & gas/i` should also catch "Oil & Gas E&P" vs. "Oil & Gas Midstream" (both should match; worth a quick sanity check against real TwelveData industry strings during implementation).
- Whether a future pass should extend the cyclical bucket to airlines/shipping — explicitly deferred rather than guessed at now.
