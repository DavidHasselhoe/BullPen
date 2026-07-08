# Dividend Calculator Presets — Design

## Purpose

The dividend calculator at `/tools/dividend` currently holds exactly one ephemeral, unnamed portfolio in `localStorage` — every time a user wants to compare a different mix of stocks, they retype it from scratch. This adds named, savable presets (mirroring the app's existing chart-presets pattern) plus a one-click "Load from My Holdings" action that populates the calculator from the user's real, already-tracked portfolio.

## Current state (confirmed by investigation)

- Route: `app/tools/dividend/page.tsx` → `app/tools/dividend/DividendClientPage.tsx` (client component, ~550 lines).
- The calculator's per-row type, unchanged by this work:
  ```ts
  interface Holding {
    id: string;
    stock: SearchResult | null;   // { ticker, name, cik, has_data }
    mode: 'amount' | 'shares';
    value: string;
  }
  ```
- Currently persisted only as a single blob under `localStorage['dividend-portfolio']` (`DividendClientPage.tsx:40, 130-145, 236-243`) — no naming, no multiple saved states, no Supabase persistence, no `user_id` scoping.
- Real holdings live in `public.user_holdings` (`lib/types/database.ts:118-138`): `symbol`, `quantity`, `avg_price`, `purchase_currency`, `purchase_fx_rate`, `trading_currency`, etc. `symbol` + `quantity` map directly onto `Holding.stock.ticker` + `mode: 'shares'` + `value`.
- Existing precedent to mirror: chart presets (`hooks/use-chart-presets.ts`, `components/stock/advanced-chart/PresetMenu.tsx`) — a hybrid localStorage + `users.settings` JSONB persistence pattern with a `{ presets, savePreset, deletePreset }` hook API and a name/save/apply/delete popover UI. This is the direct template for dividend presets; no new table, no new persistence mechanism to invent.

## Scope decisions (confirmed with user)

- **Storage**: follow the chart-presets pattern exactly — `users.settings.dividend_presets` JSONB, hybrid localStorage + debounced Supabase write, no new table.
- **Load from My Holdings behavior**: **replace** the calculator's current rows entirely (not merge/add). Predictable, matches "show me my actual portfolio's dividend income" as a clean snapshot.
- **No preset count cap**, no curated/starter presets (e.g. no code-shipped "Dividend Aristocrats" template) — this work is scoped to user-saved presets and the Holdings import only, matching exactly what was asked. (Watchlist-style curated starter templates are a related but separate pattern, not part of this work.)

## Data model

```ts
interface DividendPreset {
  id: string;
  name: string;
  holdings: Holding[];  // the calculator's existing Holding[] shape, unchanged
}
```

Persisted under `users.settings.dividend_presets` (new JSONB key, sibling to the existing `chart_presets` key), mirrored to `localStorage['dividend-presets']` for instant reads. Same "userEdited" flag technique as `use-chart-presets.ts` to avoid a stale-remote flash immediately after a local save/delete.

## Hook: `useDividendPresets()`

New file `hooks/use-dividend-presets.ts`, structured identically to `hooks/use-chart-presets.ts`:
- Returns `{ presets: DividendPreset[], savePreset: (name: string, holdings: Holding[]) => void, deletePreset: (id: string) => void }`.
- `savePreset` overwrites an existing preset if the trimmed name matches one already saved (case-sensitive exact match, same as chart presets), otherwise appends a new one with a generated id.
- Debounced (1s) write to `users.settings` via `supabase.from('users').update({ settings: merged }).eq('id', currentUser.id)`, exactly matching the existing debounce/merge logic in `use-chart-presets.ts`.

## UI

A small preset popover/menu (new component, `components/tools/DividendPresetMenu.tsx` — a dividend-specific sibling to `PresetMenu.tsx`, not a shared generalization of it, since the two store meaningfully different content) placed near the existing "Your portfolio" section in `DividendClientPage.tsx`:
- **Save current as preset**: name input + button. Enter key also saves (matches `PresetMenu.tsx`'s existing UX).
- **Preset list**: each row shows the name; clicking it calls `deletePreset`'s sibling `applyPreset` logic inline in `DividendClientPage.tsx` (replaces the current `holdings` state array with the preset's `holdings`, then the user presses the existing "Calculate" button to fetch fresh quote/dividend data for the restored rows — presets store the portfolio composition, not stale calculated results).
- **Delete**: trash icon per row, hover-revealed, same as chart presets.

## Load from My Holdings

A separate, non-preset button in `DividendClientPage.tsx` (e.g. next to the existing quick-pick chips): "Load from My Holdings."
- Fetches the current user's holdings the same way the Holdings page does (`useHoldings()` hook, or a lighter-weight direct fetch if pulling in the full hook is heavier than needed — implementation detail for the plan stage).
- Groups fetched holdings by `symbol`, summing `quantity` across any duplicate rows (e.g. the same ticker held across multiple connected brokerage accounts).
- Replaces the calculator's current `holdings` state with one `Holding` per grouped symbol: `{ id: <generated>, stock: { ticker: symbol, name: company_name, cik: '', has_data: false }, mode: 'shares', value: String(totalQuantity) }`. `cik`/`has_data` are required fields on `SearchResult` but unused by the calculation flow — `DividendClientPage.tsx:127` already has an existing helper that synthesizes them the same way when restoring the localStorage blob, so this follows an established in-file precedent, not a new convention.
- Disabled (or hidden) when the user has zero holdings, with the same empty/disabled treatment already used elsewhere in the app for "no data yet" states.
- After loading, the user can immediately save the result as a named preset via the existing Save UI — no separate code path needed, since it operates on the same `holdings` state.

## Out of scope

- Curated/starter dividend preset templates (watchlist-template-style) — not requested, not built here.
- A cap on the number of saved presets.
- Persisting *calculated results* (yield, projected income) inside a preset — presets store composition only; recalculation happens fresh via the existing "Calculate" flow each time a preset is applied.
- Any change to the `Holding` type itself, the calculation API (`app/api/tools/dividend/route.ts`), or the quick-pick chips feature.
