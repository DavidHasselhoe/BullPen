# Bklit Chart — Sessions (sub-project 2 of 5) — Design

## Purpose

Sub-project 2 of the parity plan: session-aware pre-market/regular/after-hours line styling on the dev-only Bklit chart, matching production's current look — muted dashed pre-market, solid live-colored regular session, muted dotted after-hours — before production is ever touched.

## Why this isn't just `dashFromIndex`

Bklit's `Line` component already supports a single dashed **tail** via `dashFromIndex`/`dashArray`, but two things rule it out for sessions as-is:
1. It only supports one transition (solid → dashed tail), not a dashed **head** too — sessions need three segments (dashed pre, solid regular, dashed/dotted post).
2. The tail-dash mechanism keeps one `stroke` color for both pieces. Production's pre/post segments are muted gray (`#6b7280` at 55% opacity) while the regular segment uses the live green/red color — a color change at both boundaries, not just a dash-pattern change.

Extending the shared `Line`/`LineProps` to do all of this would touch the same component the indicators sub-project's SMA/EMA/BB overlays depend on — real regression risk for something already shipped and verified. Instead: a new, purpose-built `components/charts/session-line.tsx`, reusing the same clip-path-per-segment technique `dash-tail-stroke.tsx` already proves works (a clipped duplicate of the same path per segment, each with its own stroke/dasharray), but implemented independently so it can't affect the existing `Line`.

## Data

Bring back `hasSessionSplit(range)` (`range === '1D' || range === '1W'`) from the original panel. Unlike the original Recharts version — which needed three duplicated data keys (`prePrice`/`regularPrice`/`postPrice`) with shared boundary values to fake per-segment gaps — `SessionLine` needs only:
- The existing continuous `price` field already in `bklitData` (no new data shape).
- Two **index** boundaries computed from `chartDisplayData`'s `session` field: `preEndIndex` (last index where `session === 'pre'`) and `postStartIndex` (first index where `session === 'post'`). Both `undefined` when the range has no session split or extended hours are hidden — `SessionLine` renders as a single solid segment in that case (equivalent to `Line`).

## Component: `components/charts/session-line.tsx`

```ts
interface SessionLineProps {
  dataKey: string;
  strokeWidth?: number;                    // default 2
  regularStroke: string;                   // live color (green/red)
  preEndIndex?: number;                    // last index of the pre-market segment
  postStartIndex?: number;                 // first index of the post-market segment
  mutedStroke?: string;                    // default #6b7280
  mutedOpacity?: number;                   // default 0.55
  preDashArray?: string;                   // default "4,3"
  postDashArray?: string;                  // default "1,3"
}
```

Renders 1–3 clipped copies of the same underlying path (measured once via the existing `usePathStrokeMetrics`/path-ref pattern), each covering its own index range via a `<clipPath>` rect positioned at that segment's x-bounds (same technique as `DashTailStroke`'s tail clip, just generalized to N segments instead of assuming exactly one dash boundary):
- `[0, preEndIndex]` → `mutedStroke`, `preDashArray`, `mutedOpacity` (only rendered when `preEndIndex` is set).
- `[preEndIndex ?? 0, postStartIndex ?? end]` → `regularStroke`, solid.
- `[postStartIndex, end]` → `mutedStroke`, `postDashArray`, `mutedOpacity` (only rendered when `postStartIndex` is set).

Reuses `useChartStable()` for `data`/`xScale`/`xAccessor`/`innerWidth`/`innerHeight` exactly like `Line` does, and the same index→x-pixel resolution already proven in `path-stroke-utils.ts` (`resolveDashStartX`, generalized to any index, not just a single tail boundary).

## Wiring into `StockPricePanelBklit.tsx`

Inside the chart, swap the plain `<Line dataKey="price" .../>` for:
```tsx
{hasSessionSplit(range) && sessionBoundaries ? (
  <SessionLine
    dataKey="price"
    regularStroke={lineColor}
    preEndIndex={sessionBoundaries.preEndIndex}
    postStartIndex={sessionBoundaries.postStartIndex}
  />
) : (
  <Line dataKey="price" stroke={lineColor} showMarkers={false} />
)}
```
`sessionBoundaries` is computed the same way the original panel computed its open/close reference-line boundaries — reusing that logic, adapted to emit indices instead of timestamps.

Also bring back the Open/Close vertical markers for 1D (production had `ReferenceLine`s at session boundaries) — Bklit's `reference-area-config.ts`/`reference-area-geometry.ts` are already installed (pulled in by the candlestick chart install) and worth checking for a reference-line equivalent; if not directly reusable, a plain positioned `<div>`/SVG line at the boundary x-pixel is a reasonable fallback, scoped small.

## Testing / verification

`npm run lint` (0 errors), then Playwright on `/dev/stock-chart-bklit/AAPL` with 1D and 5D (1W) ranges: confirm the pre-market segment renders dashed/muted, regular segment solid/live-colored, after-hours segment dotted/muted, all sharing visually continuous connection points, tooltip still works across all three segments, and non-session ranges (6M, 1Y, etc.) are unaffected (still plain `Line`).

## Out of scope

- Volume bars, oscillator panels, earnings markers (later sub-projects).
- Any change to the production `StockPricePanel.tsx` or the shared `Line`/`LineProps` used by sub-project 1's indicator overlays.
