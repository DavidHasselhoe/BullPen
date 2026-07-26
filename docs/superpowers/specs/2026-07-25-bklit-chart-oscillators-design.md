# Bklit Chart — Oscillators (sub-project 4 of 5) — Design

## Purpose

Sub-project 4 of the parity plan: RSI and MACD oscillator sub-panels below the volume strip on the dev-only Bklit chart, matching production, before production is ever touched.

## Gaps found

1. **No fixed y-domain.** RSI is always plotted on a fixed `[0, 100]` scale regardless of the day's actual RSI range — Bklit's `LineChart` only computes its domain from data (`zeroBaseline` true/false), with no way to force an exact `[min, max]`. Adding an optional `yDomain?: [number, number]` prop to `LineChartProps`/`TimeSeriesChartInnerProps` that, when set, bypasses `resolveTimeSeriesYDomain` entirely — same threading pattern already used for `zeroBaseline`.
2. **No reference-line component.** `reference-area-config.ts`/`reference-area-geometry.ts` are config-extraction utilities for a `ReferenceArea` component that was never installed (not part of any component chosen so far) — there's nothing to draw a plain horizontal threshold line (RSI's 30/50/70 bands, MACD's 0 baseline). New `components/charts/reference-line.tsx`, a standalone child component (same architecture as `session-line.tsx`) that reads `useChartStable`/`useYScale` and draws one horizontal line at a given value.

## Data

Re-add `rsiQuery`/`macdQuery` (types `rsi`/`macd`, same `fetchIndicator` helper/endpoint as sub-project 1's queries) and extend `ChartPoint`/`bklitData` with `rsi`, `macd`, `signal` fields via the same `applyIndicator`-style merge.

## Toggle UI

Extend `Indicator`/`INDICATORS` with `rsi`/`macd` entries in the *same* pill row sub-project 1 built (matching the original panel, which put all 6 indicators in one flat row) rather than a separate row — `OSCILLATOR_INDICATORS = new Set(['rsi', 'macd'])` distinguishes which selections render as overlay lines (already-shipped SMA/EMA/BB) vs. sub-panels (this sub-project).

## Rendering

Two 90px-tall `LineChart` panels below volume, one per active oscillator, each labeled the same way the volume strip is:

**RSI**: `<LineChart data={bklitData} yDomain={[0, 100]} margin={{top:4,right:28,bottom:0,left:28}} style={{height:90}}>` with `<ReferenceLine y={70} stroke="#ef4444" .../>`, `y={30}` green, `y={50}` neutral dashed, `<Line dataKey="rsi" stroke="#f59e0b" strokeWidth={1.5} showMarkers={false} />`, and a custom `ChartTooltip` `rows` callback showing just the RSI value.

**MACD**: same shell without a forced `yDomain` (auto, matches original), `<ReferenceLine y={0} .../>`, two lines — `dataKey="macd"` blue, `dataKey="signal"` orange — and a tooltip showing both values.

## Testing / verification

`npm run lint` (0 errors), then Playwright on `/dev/stock-chart-bklit/AAPL` (non-1D range): toggle RSI and MACD on, confirm both panels render with correct reference lines and line colors, values plausible (RSI 0–100, MACD near 0), tooltip works, toggling off removes them cleanly.

## Out of scope

- Earnings markers (sub-project 5, last one before the production swap).
- Any change to the production `StockPricePanel.tsx`.
