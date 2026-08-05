# S&P 500 Heatmap — "My Stocks" Mode — Design Spec

**Date:** 2026-08-05
**Status:** Draft, pending review

## Problem

The S&P 500 Sector Heatmap (`/tools/heatmap`) only ever shows the 505 S&P 500 constituents. A logged-in user can't see their own holdings or watchlist in the same visualization — and since a meaningful share of what people actually own or watch (mid-caps, recent IPOs, anything outside the index) isn't in the S&P 500 at all, a naive "filter to my holdings" would silently drop those names rather than show them, which is worse than not offering the feature.

## Goals

- A logged-in user can switch the heatmap to a "My Stocks" view: their holdings + watchlist (deduped), sized by market cap and colored by today's change, grouped by sector — the same visual language as the existing view, different tile set.
- Works for any US equity the user holds/watches, not just S&P 500 members — sourced from the same broader universe (`screener_stats`, ~1,200 tickers and growing) that already backs the Screener, independent of index membership.
- Logged-out visitors see the S&P 500 view only, unchanged from today.

## Non-goals (this pass)

- **Position-value-weighted sizing.** Tiles stay sized by market cap, consistent with the rest of the page ("Sized by market cap" is the header subtitle, the leaderboard, the tooltip — all market-cap-based). A "sized by how much I hold" treemap is a genuinely different feature (nothing like it exists elsewhere in the app today) and isn't part of this pass.
- **Separate Holdings vs. Watchlist modes.** One combined "My Stocks" set (decided during design review) — not two toggles.
- **Non-equity holdings.** Crypto/forex positions don't have a GICS sector; they're excluded from this view outright, not shown in an "Other" bucket.
- **Changing the S&P 500 mode's behavior, caching, or data sourcing.** That code path is untouched except for the minimal refactor needed to share tile-building logic with the new mode.

## Design

### API: extend `/api/tools/heatmap`, don't add a new route

`GET /api/tools/heatmap?mode=my-stocks` (default `mode=sp500`, i.e. today's behavior, completely unchanged). Reusing the route means the client keeps the exact same `HeatmapResponse` shape, `useQuery` pattern, and rendering pipeline for both modes — only the *ticker list* and *sector/market-cap sourcing* differ.

**Auth:** `mode=sp500` stays fully public (no change). `mode=my-stocks` calls `requireAuth()` (`lib/security/api-security.ts`) at the top of that branch only — a signed-out request for `my-stocks` gets the existing `401 { success: false, error: 'Authentication required' }` shape, same as every other auth-gated route. This is enforced server-side regardless of the client hiding the toggle when logged out (defense in depth, not just a UI nicety).

**Ticker list for `my-stocks`:** read `user_holdings` and `user_watchlist` for the authenticated `userId` (both tables, `symbol` column, no `alerts_enabled` filter — unlike the notification crons, this wants *everything* tracked, not just alert-eligible rows), union and dedupe. Symbols that `inferAssetType()` (`lib/assets/asset-type.ts`) identifies as `crypto` or `forex` are dropped — a sector heatmap is an equity concept. Everything else proceeds; a ticker that turns out to have no usable quote/market-cap data (a stray ETF, something genuinely untracked) is silently skipped later by the same "no valid quote → don't render a tile" guard the route already has for S&P 500 mode — no new special-casing needed there.

**Sector + market cap sourcing for `my-stocks`:** this is the actual gap the S&P-500-only code has today (it only checks the static `SP500_SECTORS` map, then the small hand-ingested `companies` table, then gives up to `'Other'`). For `my-stocks`, look up the ticker list in `screener_stats` first (covers the ~1,200-ticker active universe, independent of index membership); for any ticker missing there, do the same on-demand fetch `/api/screener`'s own `symbols=` path already performs — `fetchAndUpsertScreenerStats()` (`lib/market-data/screener-stats.ts`) — which returns real sector + market cap (computed from a live `/statistics` call) and warms the cache for next time. No synthetic market-cap fallback formula is needed here at all — real data or the tile doesn't render.

Capped at 60 symbols (post-dedupe, post-crypto/forex-filter) before any fetch — same defensive bound `/api/screener`'s own on-demand path uses (`ON_DEMAND_CAP = 50`, here slightly higher since this is a once-per-toggle fetch, not fired on every keystroke). A user with more than 60 tracked symbols is an edge case; the first 60 (holdings first, then watchlist, both alphabetical) render rather than the request ballooning into an unbounded credit-costing fan-out.

**Quotes:** same `seedPrices()` pipeline as today, just called with the deduped holdings/watchlist ticker list instead of `SP500_TICKERS`.

**Caching:** `mode=sp500` keeps its existing shared cache key (`heatmap:v2`). `mode=my-stocks` needs a *per-user* cache key (`heatmap:my-stocks:v1:${userId}`) — sharing the S&P 500 cache key across users would leak one user's holdings-derived data to another. Same 3-minute TTL for consistency; no reason to special-case it shorter.

**Empty state:** zero tracked symbols after the crypto/forex filter → `{ success: true, sectors: [] }`, same shape as "no data," which the client already distinguishes with a dedicated message (see below) rather than the generic error card.

### Client: `HeatmapClientPage.tsx`

**Toggle:** a `Tabs`/`TabsList`/`TabsTrigger` pair (the same shadcn primitive `AuthModal.tsx` already uses for its Sign in/Sign up switch — no new UI primitive) placed next to the header icon+title block, with two triggers: "S&P 500" and "My Stocks". Only rendered when `useAuth().isAuthenticated` is true; logged-out visitors see today's page with no toggle at all.

**Title/subtitle swap:** driven by the same `mode` state — `"S&P 500 Sector Heatmap"` / `"Sized by market cap · colored by today's performance"` for the default, `"My Stocks Heatmap"` / same subtitle, for the other. No new copy needed beyond the title itself.

**Query key:** `['heatmap', mode]` instead of `['heatmap']`, and the fetch URL includes `?mode=${mode}` — switching tabs is then just a state change; TanStack Query handles the rest (loading state, caching per mode) for free.

**Empty state:** when `mode === 'my-stocks'` and `data.sectors` is empty (post-load, not an error), show a message pointing at Holdings/Watchlist ("Add a stock to your holdings or watchlist to see it here.") with links, instead of the generic "No heatmap data available" text used for actual failures.

**Everything else on the page — the treemap rendering, color ramp, sector leaderboard, live SSE price overlay, search, sector-filter pills — is unchanged and works identically for both modes**, since they all operate on the same `HeatmapResponse` shape regardless of which ticker set produced it. The live SSE stream (`/api/market/heatmap/stream`) itself still only carries S&P 500 tickers today; for `my-stocks` mode the page simply won't get live overlay updates for non-S&P-500 holdings (falls back to the snapshot price from the initial fetch, refreshed every time TanStack Query refetches) — extending the live stream to cover arbitrary user tickers is a separate, larger change not included in this pass.

### Testing

No test framework in this repo. Manual verification: log in as the QA test account (holds MSFT + NVDA, both S&P 500 members — worth temporarily adding a non-S&P-500 holding to that account to verify the actual gap this feature closes), toggle to "My Stocks," confirm tiles render with correct sector/market-cap/price for both an S&P 500 and a non-S&P-500 holding. Log out and confirm the toggle disappears and `/api/tools/heatmap?mode=my-stocks` returns 401 if hit directly. Clear holdings/watchlist and confirm the empty state renders instead of a blank treemap.
