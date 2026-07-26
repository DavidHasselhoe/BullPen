# Bklit Chart — Production Swap — Design

## Purpose

Replace the real `components/stock/StockPricePanel.tsx` (Recharts) with the Bklit-based rendering proven across all 5 dev-copy sub-projects, now that indicators, sessions, volume, oscillators, and earnings markers all work with real data. The fullscreen "Advanced chart" modal (`lightweight-charts`, opened via the ⤢ button) is untouched — confirmed separately, not part of this swap.

## Decisions confirmed with user

- **Keep the settings gear, preserve all its toggles** except one: `showVolume`, `showEarnings`, `showPrevClose`, `showExtendedHours`, `defaultIndicators`, `defaultRange`, and the `chartStyle` (area/line) toggle all keep working exactly as today.
- **Drop `priceScale` (log/linear) entirely.** Bklit's y-scale is `scaleLinear` hardcoded deep in `y-axis-scales.ts` — shared low-level infrastructure every chart type (Line, Bar, Candlestick) and every already-shipped sub-project depends on. Adding log-scale support means modifying that shared foundation, not a contained fix, with real risk of regressing indicators/sessions/oscillators/volume. Removed from `ChartPrefsControls.tsx`'s UI, `ChartPrefs`/`CHART_PREF_DEFAULTS` in `use-chart-prefs.ts`, and the (Recharts-only) usage in the current `StockPricePanel.tsx`.

## Two things the dev copy didn't need but production's default behavior requires

1. **`chartStyle` defaults to `'area'`**, not `'line'` (`CHART_PREF_DEFAULTS.chartStyle = 'area'`) — most users who've never touched the settings gear are on Area today. The dev copy only ever built a plain `Line`. Installed `@bklit/area-chart` (`Area` component — same composable API as `Line`, reads from the same `LineChart` context, so it's a drop-in alternate child, not a separate chart wrapper) and wire `prefs.chartStyle` to choose between `<Area>` (gradient fill) and `<Line>` for the base (non-session) case.
2. **Sessions + Area**: on 1D/1W, `SessionLine` needs to support the same area-fill toggle. Extending `SessionLine` with an optional `showArea`/`fillOpacity` prop: for each session region's clipped `<g>`, render an `AreaClosed` (same technique `Area` itself uses) alongside the existing stroke path, filled only when `showArea` is on. When `chartStyle === 'line'`, this is a no-op (matches today's production behavior exactly, since the original Recharts version's "line" mode also just set the Area's fill opacity to 0 — visually identical to no fill at all).

## Merge plan

1. `components/stock/StockPricePanel.tsx` gets the Bklit rendering merged in wholesale, replacing every Recharts import/JSX block, while keeping every non-chart-engine piece exactly as-is: price header, dual-price display, "Why Today?" panel, range tabs, the `ChartSettingsPanel` gear, stats bar, and the `AdvancedChartModal` wiring (all of that plumbing already exists in the current file and is untouched).
2. All prefs wiring restored: `activeIndicators` seeded from `prefs.defaultIndicators` (dev copy started empty), `showVolume`/`showEarnings` gate their sections (dev copy always showed both), `showPrevClose` renders a horizontal `ReferenceLine` at `chartBase` on the main chart (dev copy never built this one — reuses the existing `ReferenceLine` component built for RSI/MACD, just on the price chart instead).
3. `hooks/use-chart-prefs.ts`: remove `priceScale` from `ChartPrefs` and `CHART_PREF_DEFAULTS`. `components/stock/ChartPrefsControls.tsx`: remove the "Price scale" `RadioRow` — this component is shared with the real Settings → Charts page, so removing it here removes the dead toggle everywhere at once.
4. Retire the dev-only artifacts once the swap is verified: `app/dev/stock-chart-bklit/[ticker]/page.tsx` and `components/stock/dev-bklit/StockPricePanelBklit.tsx` are deleted — their job (proving the design before touching production) is done, and leaving them around would just be duplicate, stale code diverging from the real component over time.

## Testing / verification

`npm run lint` (0 errors), then Playwright on the **real** `/stock/AAPL` page (not the dev route, which is being removed): default view (Area style, 1D) matches today's production look; toggle every settings-gear option (volume, earnings, extended hours, chart style, default indicators) and confirm each behaves correctly; confirm the fullscreen ⤢ button still opens the untouched `lightweight-charts` modal; check a second ticker for regression safety.

## Out of scope

- Log/linear price scale (dropped per the decision above).
- Any change to the fullscreen Advanced Chart modal or its `lightweight-charts` implementation.
