# Bklit Chart — Volume (sub-project 3 of 5) — Design

## Purpose

Sub-project 3 of the parity plan: volume bars below the price chart on the dev-only Bklit chart, matching production's up/down-colored bar strip, before production is ever touched.

## Two real gaps found in the vendored `@bklit/bar-chart` install

1. **No per-bar color.** `Bar`'s `fill` is one value for every bar in the series — no accessor for per-bar coloring. Production colors each volume bar green/red by whether that candle's close rose or fell vs. the previous one, so this is a real requirement, not decoration. Fixed by adding an optional `fillAccessor?: (d, index) => string | undefined` to `BarProps`/`bar.tsx`, falling back to `fill` when omitted — small, additive, doesn't touch any existing caller.
2. **Date-keyed categories collapse same-day points.** `BarChart`'s categorical (band) x-scale keys each bar by `xDataKey`, and for `Date` values it was formatting them with `shortDateFmt` (day granularity) to build the category string. For a full day of 1-minute candles, every point in the same calendar day formats to the *same* string, so `scaleBand`'s domain collapses to one category — visually, only one bar would show for an entire day. Fixed in `bar-chart.tsx`'s `categoryAccessor` to key Date values by `String(value.getTime())` (unique per point, still date-ordered) instead of the formatted string. Non-Date categorical usage (e.g. `"Jan"`/`"Feb"`) is untouched.

Both are already applied directly to the installed source (same "fix real vendored bugs when they block correct rendering" approach used for `zeroBaseline` and the Bklit CSS-var typo in earlier sub-projects).

## Data

`bklitData` gains a `volume` field (already available on `chartDisplayData` from the candle response, just not carried through yet) and an `isUp` boolean per point (`i === 0 || price >= chartDisplayData[i-1].price`, same rule the original panel used) — precomputed once rather than looked up mid-render inside `fillAccessor`, since the accessor only receives the row itself, not neighboring rows.

## Rendering

```tsx
{hasChart && (
  <div className="border-t border-border/30">
    <div className="px-5 pt-2 pb-0.5">
      <span className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-widest">Volume</span>
    </div>
    <BarChart data={bklitData} xDataKey="date" margin={{ top: 2, right: 28, bottom: 0, left: 28 }} style={{ height: 58 }}>
      <Bar
        dataKey="volume"
        fadedOpacity={0.5}
        fillAccessor={(d) => (d.isUp ? '#22c55e' : '#ef4444')}
      />
    </BarChart>
  </div>
)}
```
No `BarXAxis`/`BarYAxis` rendered — matches the original's fully hidden axes for this strip. `fadedOpacity` is reused for the resting (non-hover) opacity to match the original's `fillOpacity={0.5}` look, since Bklit doesn't have a separate "always-on opacity" prop — a minor visual difference is that Bklit's `fadedOpacity` is meant for the *unhovered* state specifically (dims further when another bar is hovered elsewhere), but at 0.5 it reads the same at rest.

**Always visible in this dev copy** (no settings-panel toggle) — the original gated this behind `prefs.showVolume` (default `false`) via `ChartSettingsPanel`, which this dev copy doesn't have. Since volume is exactly the feature being brought back, defaulting it to visible here is simpler than rebuilding a settings toggle just for one boolean; production's own toggle stays intact whenever this eventually replaces it.

## Testing / verification

`npm run lint` (0 errors), then Playwright on `/dev/stock-chart-bklit/AAPL`: confirm volume bars render for 1D (many bars, not collapsed to one), correct green/red coloring matching each candle's up/down direction, and non-intraday ranges (where volume is daily, already unique per point) still render correctly too.

## Out of scope

- A settings toggle to hide volume (production's own toggle is unaffected).
- Oscillator panels, earnings markers (later sub-projects).
- Any change to the production `StockPricePanel.tsx`.
