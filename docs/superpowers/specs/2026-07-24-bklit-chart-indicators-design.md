# Bklit Chart — Indicators (sub-project 1 of 5) — Design

## Purpose

The user approved promoting the Bklit-based stock chart to production, but only after full feature parity with the current `StockPricePanel.tsx`. That parity work is decomposed into 5 ordered sub-projects (see session history / commit log for the full list: indicators → sessions → volume → oscillators → earnings markers). This spec covers **sub-project 1: indicators** (SMA50, SMA200, EMA20, Bollinger Bands) — RSI/MACD are oscillators and are out of scope here (sub-project 4).

This still targets the dev-only copy — `components/stock/dev-bklit/StockPricePanelBklit.tsx` and `/dev/stock-chart-bklit/[ticker]` — not the production `StockPricePanel.tsx` or the real stock page. Production is only swapped once all 5 sub-projects are done and verified.

## Data

Re-add the 4 indicator queries the dev copy dropped when it was first trimmed down, unchanged from the production panel:
- `sma50Query`, `sma200Query`, `ema20Query`, `bbandsQuery` — each via the existing `fetchIndicator(ticker, opt, range)` helper hitting `/api/stock/[ticker]/indicator` (same endpoint production uses, no new routes, no new TwelveData cost).
- An `applyIndicator`-style merge (copied from the original, pre-trim `StockPricePanel.tsx`) attaches `sma50` / `sma200` / `ema` / `upper` / `middle` / `lower` onto each point in the chart data by matching `datetime` — same field names as the original so nothing here needs re-deriving.
- These fields get added onto `bklitData` (the `{date, price}` array already built for the Bklit chart), not onto a separate object — Bklit's `Line` reads directly by `dataKey` off the same data array.

## Rendering

Each active indicator is an additional `<Line>` inside the existing `<LineChart>`:
- `sma50`: `<Line dataKey="sma50" stroke="#f59e0b" strokeWidth={1.5} showMarkers={false} />`
- `sma200`: `<Line dataKey="sma200" stroke="#fb923c" strokeWidth={1.5} showMarkers={false} />`
- `ema20`: `<Line dataKey="ema" stroke="#a78bfa" strokeWidth={1.5} showMarkers={false} />`
- `bbands`: 3 lines in `#60a5fa` — `upper`/`lower` with `dashArray="4,2"` (dashed, matching the original), `middle` solid.

Colors are copied verbatim from the original `INDICATOR_COLORS` map. Bklit's `LineChart` auto-includes every registered `Line`'s `dataKey` when computing the shared y-domain (confirmed by reading `extractLineConfigs`/`collectNumericExtents` in `components/charts/time-series-chart-shell.tsx`) — so no manual domain widening is needed, and the chart will expand automatically if a band value briefly exceeds the price range. This is a minor, arguably-better behavior change from the original Recharts version, which computed its y-domain from price data only and could clip an indicator line that strayed outside it.

## Toggle UI

Bring back the indicator-pill row that this session's earlier trim hid entirely, scoped to exactly these 4 keys (`sma50`, `sma200`, `ema20`, `bbands`) — same pill styling/interaction as the original (`rounded-full` pills, active = primary background, inactive = ghost/bordered, plus a "✕ clear all" pill when any are active). RSI/MACD pills are added later with the oscillator-panels sub-project, not here — adding them now with no oscillator panel to show them in would be a control that does nothing.

## Tooltip

Extend the existing `ChartTooltip`'s custom `rows` callback (already used to show the formatted price row) to append one row per currently-active indicator at the hovered point — label, formatted value (`fmtPrice`), and that indicator's color — mirroring the original's `indicatorRows` logic in its custom Recharts tooltip.

## Testing / verification

No unit test framework in this repo. Verification: `npm run lint` (0 errors), then a manual/Playwright pass on `/dev/stock-chart-bklit/AAPL` — toggle each indicator on/off individually and in combination, confirm lines render with correct color/dash, confirm the y-domain adjusts sensibly, confirm hovering shows the right tooltip rows, confirm untoggling removes the line and its tooltip row.

## Out of scope (tracked as later sub-projects)

- Session-aware dashed pre/post-market line segments.
- Volume bars.
- RSI/MACD oscillator panels (and their toggle pills).
- Earnings reference markers.
- Any change to the production `StockPricePanel.tsx` or `/stock/[ticker]` page.
