# Bklit Chart — Earnings Markers (sub-project 5 of 5) — Design

## Purpose

Final sub-project of the parity plan: vertical earnings-date markers on the price chart of the dev-only Bklit chart, color-coded by beat/miss, matching production, before production is ever touched. Once this lands and is verified, all 5 sub-projects are complete and the production swap can be considered separately.

## Gap found

Production draws earnings markers as **vertical** reference lines at specific dates. `components/charts/reference-line.tsx` (built for RSI/MACD in sub-project 4) only draws **horizontal** lines at a fixed y-value — a different shape of primitive, not a gap in that component so much as a different need. Rather than overload one component with two orientations, a new dedicated `components/charts/earnings-marker.tsx` — semantically an event marker (dashed vertical line + a small "E" label), not a generic reference line — reads `useChartStable()` for `xScale`/`xAccessor`/`innerHeight` to place itself at a given date.

## Data

Re-add the earnings query the dev copy dropped: `/api/stock/${ticker}/earnings` (same endpoint production uses), `enabled: !!ticker` — **always fetched and shown in this dev copy**, same precedent as volume (production gates this behind `prefs.showEarnings`, defaulting to hidden via a settings panel this dev copy doesn't have; showing it by default here is simpler than rebuilding that toggle for one boolean, and production's own toggle is unaffected whenever this eventually replaces it).

Markers are derived exactly like the original: for each earnings entry, `ts = Date at noon UTC on the report date`, `beat = actual >= estimate` (null when either is missing), filtered to entries falling within `chartDisplayData`'s visible time range.

## Rendering

```tsx
{earningsMarkers.map(({ date, beat }) => (
  <EarningsMarker
    key={date.getTime()}
    date={date}
    stroke={beat === null ? '#f59e0b' : beat ? '#22c55e' : '#ef4444'}
  />
))}
```
Rendered as a child of the main price `LineChart`, alongside the session/indicator lines. `EarningsMarker` draws a dashed vertical line (`strokeOpacity: 0.55`, matching the original) from top to bottom of the plot area at the date's x-pixel, plus a small "E" text label near the top.

## Testing / verification

`npm run lint` (0 errors), then Playwright on `/dev/stock-chart-bklit/AAPL` at a range wide enough to contain a real earnings date (6M or 1Y): confirm markers appear at the correct x-position, colored correctly by beat/miss, and don't appear on ranges with no earnings in range.

## Out of scope

- A settings toggle to hide earnings markers (production's own toggle is unaffected).
- The actual production swap — this is the last of the 5 planned sub-projects; swapping `StockPricePanel.tsx` itself is a separate, later decision.
