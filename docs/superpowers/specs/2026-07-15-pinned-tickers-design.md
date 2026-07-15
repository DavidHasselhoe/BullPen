# Pinned Tickers — Design

## Purpose

Let users pin a small number of stocks/assets (crypto, commodities — anything with a symbol) so their live price is one click away from anywhere in the app, via a new icon in the global navigation. Distinct from Watchlist: pinning is "always available," watchlisting is "track for later" — different intents, kept as separate concepts.

## Current state (confirmed by investigation)

- **No existing pin/favorite mechanic for tickers.** Grepped the whole repo for "pin"/"star"/"favorite" — the only hit is an unrelated "pin a default homepage" settings feature (`lib/navigation/homepage-options.ts`). Watchlist (`hooks/use-watchlist.ts`) is the closest analog but is a heavier concept: multiple named lists, alert toggles, a dedicated `/watchlist` page — not "N tickers always visible."
- **Desktop nav (`components/navigation/Navigation.tsx`) has no spare width.** The center nav (`:106`, `overflow-x-auto scrollbar-hide`) already scrolls horizontally on smaller desktop widths once its content (Home/Discover/Academy/My Holdings/Watchlist + Community/Tools dropdowns) exceeds available space. There's no hardcoded breakpoint gating this — it's pure content-overflow.
- **Mobile (`components/navigation/MobileTabBar.tsx`) has zero spare slots.** Fixed `grid-cols-5` (Home/Discover/Holdings/Watchlist/More); "More" opens a bottom `Sheet` (`:81-118`) with sectioned rows (Academy, Tools, Community, Account/Settings) via reusable `MoreSection`/`MoreRow` sub-components.
- **DESIGN.md explicitly names "Bloomberg-terminal density" as the anti-reference** — dense, always-visible data strips are what the system is built to avoid. The only existing ticker-strip UI in the codebase (`components/landing/TickerStrip.tsx`) is a marketing-only CSS marquee over hardcoded fake data — not wired to real prices, not a pattern worth extending into the authenticated app.
- **`useLivePrices(symbols)` (`hooks/use-live-prices.ts`)** opens an `EventSource` to `/api/market/prices/stream`, backed by the shared `WsManager` TwelveData WS singleton. Passing `[]` is a no-op (early-returns before opening a connection, `:35-39`) — so the hook can safely be called unconditionally with a possibly-empty array, no extra gating needed to avoid a connection when there's nothing to show.
- **Existing precedent for symbol format**: `app/watchlist/page.tsx:103-104` passes `watchlist[].symbol` (raw TwelveData symbol, e.g. `"AAPL"`, `"BTC/USD"`) straight into `useLivePrices` with no slug conversion. Pinned tickers will follow the same convention — store raw symbols, convert to a URL slug only at link-building time via `slugToAssetPath()` (`lib/assets/asset-type.ts`).
- **`components/tools/buy-here/TickerSelector.tsx`** is a generic, already-decoupled ticker search: controlled `value`/`onChange`, debounced query against `/api/search`, returns `{ ticker, name, exchange?, instrument_type?, cik, has_data, logo_url? }`. Reusable as-is for the "add a ticker to pin" input — no new search UI needed.
- **Settings persistence precedent**: `hooks/use-user-settings.ts` stores several user preferences as JSONB keys on `users.settings` (`tools_shortcuts`, `market_hours_exchanges`, `market_context_hidden`, etc.), each with a read accessor in the hook and a write path either via an instant per-field mutator (read-merge-write against Supabase) or via the Settings modal's batched autosave. No new Supabase table needed for a `string[]` of pinned symbols.

## Scope decisions (confirmed with user)

- **Icon + popover entry point**, not inline always-visible chips in the nav bar. A single icon in the existing right-side icon cluster (next to Search/Settings/NotificationBell/UserMenu) opens a popover — zero nav-width cost, consistent with the existing NotificationBell pattern, works identically on every breakpoint. Rejected the inline-chip alternative (chips on wide screens, falling back to the same popover on narrower ones) as unnecessary complexity for marginal glanceability gain, given the nav is already tight and DESIGN.md disfavors always-on ticker strips.
- **5-ticker cap.** Since the popover model removes the nav-width constraint, the limit is purely "stays glanceable without scrolling" — 5 rows fits a compact popover cleanly.
- **Independent from Watchlist.** Own `pinned_tickers: string[]` setting; no coupling to watchlist add/remove.
- **Live prices fetched only while the popover/sheet is open** (or has been opened at least once this page load) — not an always-on subscription mounted globally in `app/layout.tsx`. The trigger icon itself stays static (no live-updating badge/dot). This is a deliberate simplicity choice: avoids a permanent SSE connection for every signed-in user on every page load for a feature most won't have open at any given moment.
- **Works for any asset type** (stock, ETF, crypto, commodity) — reuses `TickerSelector`'s existing search (already asset-type-agnostic) and `slugToAssetPath()` for correct routing (`/stock/` vs `/asset/`).
- **Second entry point: a pin toggle button directly on the stock/asset detail page**, alongside the existing `AddToListPicker`/`AlertDialog`/"Ask AI" action buttons — so pinning doesn't require opening the nav panel and searching for the ticker you're already looking at.

## Architecture

```
Navigation.tsx (desktop)              MobileTabBar.tsx (mobile, "More" sheet)
        │                                      │
        │  renders                             │  renders
        ▼                                      ▼
  <Popover>                              <MoreSection title="Pinned">
    <PopoverTrigger> pin icon                    │
    <PopoverContent>                              │
        │                                         │
        └──────────────┬──────────────────────────┘
                        ▼
              PinnedTickersPanel
              (components/navigation/PinnedTickersPanel.tsx)
                        │
          ┌─────────────┼──────────────┐
          ▼             ▼              ▼
  useUserSettings   useLivePrices   TickerSelector
  (pinnedTickers,   (pinnedTickers  (add-ticker
   updatePinned     when panel is    search input,
   Tickers)          open, else [])  reused as-is)
        ▲
        │  same hook, second consumer
        │
  PinToggleButton (components/navigation/PinToggleButton.tsx)
        │  mounted in the header action row of:
        ├─ app/stock/[ticker]/page.tsx
        └─ app/asset/[slug]/page.tsx
```

One shared presentational component (`PinnedTickersPanel`) renders the row list + add-ticker input; it's mounted inside a `Popover` on desktop and inside the mobile "More" `Sheet` on mobile — same component, different containers, so the row-rendering/remove/add logic isn't duplicated.

A second, much smaller component (`PinToggleButton`) reads/writes the exact same `useUserSettings().pinnedTickers`/`updatePinnedTickers` — both entry points operate on one shared piece of state, so pinning from a stock page and unpinning from the nav panel stay in sync with no extra plumbing.

## Components

### `hooks/use-user-settings.ts` (extend)

```ts
// Ids/symbols of tickers pinned to the nav quick-access panel. The 5-cap is
// enforced by the UI (TickerSelector disables once full) — same trust model
// as updateToolsShortcuts/updateMarketHoursExchanges, which also have no
// separate server-side validation beyond RLS (this is a direct Supabase
// client write, not an API route).
const pinnedTickers: string[] = Array.isArray(settings.pinned_tickers)
  ? (settings.pinned_tickers as string[])
  : [];

const updatePinnedTickers = useCallback(async (symbols: string[]) => {
  // same read-merge-write pattern as updateToolsShortcuts/updateMarketHoursExchanges
}, [user]);
```

Returned alongside the existing settings fields.

### `components/navigation/PinnedTickersPanel.tsx` (new)

Props: none (reads `useUserSettings()` and `useLivePrices()` directly — it's a fully self-contained feature unit, not parameterized by its container).

Renders:
- Empty state ("Pin a stock to see it here" + the add-ticker input) when `pinnedTickers.length === 0`.
- One row per pinned symbol: `CompanyLogo`, ticker, live price (Geist Mono, tabular figures per DESIGN.md), change % colored Signal Emerald/Red **with** an up/down icon (Never-Color-Alone rule), wrapped in a `Link` to `slugToAssetPath(symbol)`. Falls back to a skeleton/dash per row while `useLivePrices` hasn't ticked yet for that symbol (same "—" convention used elsewhere, e.g. screener).
- A small "×" per row calling `updatePinnedTickers(pinnedTickers.filter(...))`.
- `TickerSelector` at the bottom, `disabled={pinnedTickers.length >= 5}`; `onChange` appends the picked ticker (dedup) and calls `updatePinnedTickers`.

### `components/navigation/Navigation.tsx` (edit)

Add a `Pin` (lucide-react) icon `Button` + `Popover` in the right-side icon cluster (`:236-260`), positioned between Search and Settings — same visual weight/size as the existing `Settings`/`NotificationBell` icon buttons. `PopoverContent` renders `<PinnedTickersPanel />`.

### `components/navigation/MobileTabBar.tsx` (edit)

Add a `MoreSection title="Pinned"` block inside the existing "More" sheet content (`:87-116`), rendering `<PinnedTickersPanel />` directly (no extra `Popover` wrapper needed — it's already inside the sheet).

### `components/navigation/PinToggleButton.tsx` (new)

A simple binary toggle, not a picker — no popover, no search. Props: `{ symbol: string }`.

```tsx
const MAX_PINNED = 5;

export function PinToggleButton({ symbol }: { symbol: string }) {
  const { pinnedTickers, updatePinnedTickers } = useUserSettings();
  const upper = symbol.toUpperCase();
  const isPinned = pinnedTickers.includes(upper);
  const atLimit = !isPinned && pinnedTickers.length >= MAX_PINNED;

  function toggle() {
    if (isPinned) updatePinnedTickers(pinnedTickers.filter((s) => s !== upper));
    else if (!atLimit) updatePinnedTickers([...pinnedTickers, upper]);
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggle}
      disabled={atLimit}
      title={atLimit ? `You can pin up to ${MAX_PINNED} tickers` : isPinned ? 'Unpin' : 'Pin'}
      className="gap-2"
    >
      <Pin className={cn('h-4 w-4', isPinned && 'fill-current text-primary')} />
    </Button>
  );
}
```

Filled + `text-primary` icon = pinned, outline/muted = not — **deliberately not emerald**: DESIGN.md's One Signal Rule reserves emerald/red exclusively for gain/loss direction, and "pinned" is a UI selection state, not a financial signal, so it uses the same neutral `primary` token the nav already uses for its own active-link state (`Navigation.tsx`'s `bg-primary/10 text-primary` pattern). The `title` attribute for the disabled/limit state matches the existing icon-button tooltip convention (e.g. `ScreenerResults`' alert-bell buttons use the same plain-`title` approach, no dedicated `Tooltip` wrapper needed for a single-line hint).

**Mounted in:**
- `app/stock/[ticker]/page.tsx` — header action row (alongside `AddToListPicker`, `AlertDialog`, "Ask AI"), passing the page's `ticker`.
- `app/asset/[slug]/page.tsx` — same action row, passing `symbol`.

## Data flow / edge cases

- **Unauthenticated users**: not a real case to design for. `AuthNavigation.tsx` never renders `Navigation`/`MobileTabBar` on public/marketing routes (`NO_APP_NAV_ROUTES`), and every other route requires an authenticated session — confirmed `NotificationBell` has no auth guard for the same reason. The pin icon and panel can assume `user` is always present, no logged-out empty state needed.
- **Duplicate pin attempts**: `TickerSelector`'s `onChange` dedups against the current `pinnedTickers` array before writing.
- **Invalid/delisted symbol still pinned**: `useLivePrices` simply never ticks for it; the row shows the static ticker + a "—" price rather than erroring, same graceful-degradation convention used elsewhere (e.g. screener's Price/%Chg columns).
- **Removing the last pin**: reverts to the empty state with the add-ticker input, not an auto-closed popover.

## Non-goals

- Reordering pinned tickers (fixed insertion order — no drag handles, matching the "visibility-only" simplicity precedent from the recent Market Context Cards work).
- Multiple pin "lists" or categories (Watchlist already covers that need).
- A live-updating badge/dot on the trigger icon itself.
- Any new API route or Supabase table — entirely existing hooks (`useUserSettings`, `useLivePrices`) plus one new settings key.

## Testing

- Manual: pin/unpin from the panel on desktop and the mobile "More" sheet; confirm the 5-cap disables the add input; confirm live prices start ticking only after the popover/sheet opens (network tab: no `/api/market/prices/stream` request before first open); confirm pinning a crypto/commodity symbol routes to `/asset/[slug]`, a stock/ETF to `/stock/[ticker]`.
- Manual: pin a ticker via `PinToggleButton` on its stock/asset page, then confirm it appears in the nav panel without a refresh (both consumers read the same `useUserSettings()` state); unpin from the nav panel and confirm the stock page's button reverts to its unpinned state; hit the 5-cap via the stock page button and confirm it disables with the limit `title` tooltip, matching the nav panel's own disabled-input state.
- No new automated test framework in this repo (per CLAUDE.md, `npm run lint` is the primary gate) — verify via `npm run lint` and a manual click-through per the `verify`/UI-testing conventions already used in this session's other changes.
