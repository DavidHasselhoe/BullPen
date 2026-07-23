# Bklit Stock Chart Dev Copy — Design

## Purpose

The user liked the smoothness, tooltip cleanliness, and responsiveness of the Bklit UI candlestick chart demoed at `/dev/ui-demo` and wants to see what BullPen's real stock detail price chart would feel like built on Bklit's chart primitives instead of Recharts. This is a design-verification spike on a **copy** of the production component, not a change to the production stock page.

## Scope decision (confirmed with user)

`components/stock/StockPricePanel.tsx` (~1,175 lines) is a mature, heavily-tuned production component: live/extended-hours dual pricing, session-aware dashed pre/post-market lines, 6 technical indicators with RSI/MACD oscillator panels, earnings markers, volume bars, a custom tooltip, and a separate fullscreen `lightweight-charts`-based "Advanced chart" modal. Porting all of that onto Bklit's primitives in one pass would be a large, multi-part project.

Confirmed scope for this pass:
- **Copy, don't modify** — the real `StockPricePanel.tsx` and the production stock page are untouched. This lives entirely on a new, unlinked dev route.
- **Core price line + tooltip only** — swap just the base chart rendering (the price series + its hover/tooltip) to Bklit's `LineChart`/`Line`/`Grid`/`XAxis`/`ChartTooltip`. Range switching (1D/1W/1M/6M/1Y/YTD/5Y/MAX) stays fully functional against real data, since that's just reusing the existing data-fetching hooks unchanged.
- **Dropped for this pass**: pre/post-market session dashing, indicator overlay lines, earnings reference markers, the live trailing dot, volume bars, RSI/MACD oscillator panels. Their toggle UI is hidden entirely in this copy rather than left visible-but-inert — showing controls that don't do anything would make it harder to judge the core chart honestly.
- **Kept as-is, unchanged**: price header (single/dual price display), the "Why Today?" panel, range tabs (now driving the Bklit chart), the stats bar (Open/High/Low/Prev Close), and the fullscreen "Advanced chart" button (opens the existing, untouched `lightweight-charts` modal).

## Architecture

**New route**: `app/dev/stock-chart-bklit/[ticker]/page.tsx` — e.g. `/dev/stock-chart-bklit/AAPL`. Unlinked, not in nav, same pattern as `/dev/ui-demo`. Thin server component that renders the client panel with the `ticker` param.

**New component**: `components/stock/dev-bklit/StockPricePanelBklit.tsx` — copied from `StockPricePanel.tsx`, same data-fetching hooks (`useLivePrices`, `useStockQuote`, the `stock-candles` query against `/api/stock/[ticker]/candles`, extended-hours query), same header/range-tabs/stats-bar JSX. No new API routes, no new TwelveData calls beyond what the existing cached endpoints already serve — this reuses the exact same request paths as the production page.

**Swapped block**: the "Price chart" section's `<ResponsiveContainer><AreaChart>...` is replaced with:
```tsx
<LineChart data={bklitData} margin={{ top: 8, right: 28, bottom: 24, left: 28 }} style={{ height: 300 }}>
  <Grid horizontal />
  <Line dataKey="price" stroke={lineColor} />
  <ChartTooltip />
  <XAxis />
</LineChart>
```
where `bklitData` maps the existing `chartDisplayData` (already computed by the copied hooks/memos) to Bklit's expected `{ date: Date, price: number }[]` shape — a one-line `.map()`, not a new data pipeline.

**Removed from the copy**: indicator toggle pills, volume section, oscillator panels, earnings query/markers, session-split dashed rendering, live trailing dot, high/low floating labels tied to the old chart's coordinate system. The surrounding component keeps its own state/hooks minimal — dead code for removed features is deleted from the copy, not left commented out.

## Testing / verification

Per this session's established pattern for dev/demo work: `npm run lint` (0 errors) plus a manual/Playwright check that `/dev/stock-chart-bklit/[ticker]` loads with real data, the chart renders and responds to hover, and range-tab switching re-fetches and re-renders correctly.

## Out of scope

- Any change to `components/stock/StockPricePanel.tsx` or the production `/stock/[ticker]` page.
- Porting sessions, indicators, oscillators, earnings markers, volume, or the live dot onto the Bklit chart — later, separate passes if this first look is approved.
- Replacing the fullscreen Advanced Chart modal (`lightweight-charts`) — untouched, separate system.
