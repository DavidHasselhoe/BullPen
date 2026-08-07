# Wire MetricSelector into StatisticsGrid — Design Spec

**Date:** 2026-08-07
**Status:** Draft, pending review

## Problem

`selectMetrics()` (`lib/finance/metric-selector.ts`, shipped 2026-08-07) exists but is unused — the stock page's "Key Numbers" card (`components/stock/StatisticsGrid.tsx`) still unconditionally renders P/E (TTM), P/B, and EV/EBITDA regardless of whether they're meaningful, producing the original bug (CrowdStrike showing "P/E (TTM) 716.55" next to a -0.60% profit margin). This spec wires the selector into the actual card rendering.

## Goals

- `StatisticsGrid.tsx` calls `selectMetrics()` with real data and uses the result to decide which of P/E, Forward P/E, P/B, EV/EBITDA, P/S actually render as cards, in what priority, and with what caveat text.
- A new P/S card exists (it doesn't today) so the unprofitable-company case — the exact motivating bug — has something real to show instead of P/E.
- Simplified ("beginner") mode shows one adapted primary valuation card instead of always forcing P/E.
- Hidden metrics (`hideMetrics`) never appear anywhere, including the "All statistics" disclosure list.

## Non-goals (this pass)

- **Reordering the Dividend Yield card.** `selectMetrics` recommending `'Dividend Yield'` (REIT/bank cases) is a no-op for rendering — that card already renders unconditionally today (`StatisticsGrid.tsx:354-379`). Making it visually prominent for REITs specifically is a further refinement, not done here.
- **Dynamic card reordering.** Per the decision table in `2026-08-07-metric-selector-design.md`, P/E and P/S never both appear in `primary` for the same company. The grid keeps its existing fixed slot order (Range → Market Cap → headline-multiple slot → Margin → Dividend → Beta → P/B → EV/EBITDA); only *which* metric occupies the headline-multiple slot changes.
- **Margin, Growth, Beta, Range, Market Cap, Dividend cards.** Untouched — `selectMetrics` only governs P/E, Forward P/E, P/B, EV/EBITDA, P/S.

## Data plumbing

`P/S` needs a real value before it can render anywhere. TwelveData's `/statistics` response already includes `price_to_sales_ttm` — same call BullPen already pays for, this is purely a missing field mapping, not a new API cost.

1. **`lib/twelvedata/twelvedata-client.ts`** — add `psRatio: number | null` to the `CompanyStatistics` interface (after `evToEbitda`); map `psRatio: v.price_to_sales_ttm ?? null` in `getStatistics()` (alongside the other `valuations_metrics` fields, ~line 920).
2. **`app/api/stock/[ticker]/snapshot/route.ts`** — same mapping in its inline `Statistics` object builder (~line 111-128). This route pre-seeds the `snap-stats:<sym>` cache that `/api/stock/[ticker]/statistics` checks *first* (`route.ts:24-28`) — skipping this file would mean P/S is silently absent on most real page loads even though `getStatistics()` was fixed, because the dedicated statistics fetch would rarely run.

No other `CompanyStatistics`-shaped mapping site (`lib/market-data/screener-stats.ts`, `app/api/cron/prefetch-market-data/route.ts`) needs touching — those already map `ps_ratio` for the screener and aren't in this feature's path.

## Input construction

Inside `StatisticsGrid.tsx`, once `s: CompanyStatistics` and the `sector`/`industry` props are available:

```ts
const selection = selectMetrics({
  profitMargin: s.profitMargin,
  sector,
  industry,
  hasForwardEarnings: s.peRatioForward != null,
  dividendYield: s.dividendYield,
});
```

## Rendering rule

One helper decides whether a metric gets a card:

```ts
const showCard = (m: ValuationMetric) =>
  !selection.hideMetrics.includes(m) &&
  (isSimplified ? selection.primary[0] === m : selection.primary.includes(m) || selection.secondary.includes(m));
```

- **`hideMetrics`** → never a card, never a disclosure row.
- **Selected (primary or secondary), full mode** → renders as a card, in the existing fixed slot for that metric.
- **Selected, simplified mode** → only `selection.primary[0]` renders as a card — one adapted valuation card instead of always P/E.
- **Has a value, not hidden, not selected** (e.g. P/E for a profitable semiconductor company, which `selectMetrics` doesn't recommend but also doesn't hide) → falls to the "All statistics" disclosure row, generalizing the existing pattern (today only P/B/EV-EBITDA demote there, gated by `isSimplified`) to all four metrics uniformly, driven by `showCard()` instead.

**Headline-multiple slot** (P/E's existing position, 3rd card): renders P/E if `showCard('P/E')`, else P/S if `showCard('P/S')`, else nothing. **P/B slot** and **EV/EBITDA slot**: each independently gated by `showCard('P/B')` / `showCard('EV/EBITDA')`, unchanged position.

### Forward P/E

No standalone card. Folded as the existing detail line (today's `{s.peRatioForward != null && <p>Forward P/E …</p>}` block, `StatisticsGrid.tsx:298-304`) into whichever card is `selection.primary[0]`, whenever `'Forward P/E'` appears in `primary` or `secondary`. In the default/bank cases `primary[0]` is `'P/E'`, so this reproduces exactly today's behavior; in the unprofitable/REIT/cyclical cases it nests into the P/S/P/B/EV-EBITDA card instead.

### Note placement

`selection.note`, when present, replaces the generic `sectorContext(...)` value for the `context` prop on the `primary[0]` card only. Every other rendered card keeps its normal sector-percentile context line.

## New copy (`lib/finance/metric-insights.ts`)

```ts
export const PS_DOMAIN = { min: 0, max: 20 };

export function psInsight(ps: number | null, peHidden: boolean): string {
  if (ps == null || ps <= 0) return '';
  const base = `Priced at ${ps.toFixed(1)}× yearly sales`;
  return peHidden ? `${base} — used instead of P/E since the company isn't profitable yet` : base;
}
```

`psInsight`'s `peHidden` branch makes the P/S card self-explanatory even in the one branch (plain unprofitable, no forward earnings) where `selection.note` is empty — it doesn't rely solely on note placement to explain why P/E is missing.

`sectorContext()` gets a `'ps'` case added to its `SectorMetricKind` union, grouped with the existing `'pe' | 'pb' | 'evEbitda'` "cheaper/pricier than most X companies" branch (same low/mid/high banding, just a new kind label). Sector benchmarks for `ps_ratio` already exist in `sector_metric_stats`/`industry_metric_stats` (migrations 087/088/095) — no new migration needed.

## Files touched

| File | Change |
|---|---|
| `lib/twelvedata/twelvedata-client.ts` | Add `psRatio` field + mapping |
| `app/api/stock/[ticker]/snapshot/route.ts` | Add `psRatio` mapping to inline builder |
| `lib/finance/metric-insights.ts` | Add `psInsight`, `PS_DOMAIN`, `'ps'` sectorContext case |
| `components/stock/StatisticsGrid.tsx` | Call `selectMetrics`, add `showCard` helper, add P/S card, restructure P/E/P/B/EV-EBITDA card conditions and the disclosure-row fallback, fold Forward P/E and note placement |

## UI/UX process note

Per `CLAUDE.md`, this is a change to an existing, shipped UI surface (not a new page), but it changes what beginners see by default (Goals: adapted primary card in simplified mode) — check `.agents/skills/ui-ux-pro-max/SKILL.md` during implementation and run `/impeccable polish` on the stock page's Key Numbers card before considering this done.

## Open implementation details (not blocking, just noted)

- Exact visual treatment when the headline-multiple slot renders nothing at all (REIT case: neither P/E nor P/S selected) — the grid already tolerates a variable card count today (e.g. Range card is conditional), so no layout change expected, but worth a visual check during implementation.
- `PS_DOMAIN` max of 20 is a judgment call (matching the existing eyeballed domains for `PE_DOMAIN`/`PB_DOMAIN`/`EV_EBITDA_DOMAIN`), not derived from data — fine to adjust later if real P/S values commonly clip the meter.
