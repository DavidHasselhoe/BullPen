# Bull → Dividend Calculator handoff — Design

## Purpose

Today, asking Bull (the AI chat assistant) to "build me a high yield dividend portfolio" produces a text answer at best, or gets misrouted to the stock screener. This adds a new Bull tool that navigates the user to `/tools/dividend` with stocks pre-filled — a concrete, editable starting point instead of prose — matching the existing navigate-with-prefill pattern already used by `openScreener` and `openComparison`.

## Current state (confirmed by investigation)

- `lib/ai/tools.ts` already has a "client action" pattern for navigation tools: `execute()` returns `{ __clientAction: { type: 'navigate', path } }`, picked up generically in `components/ai/BullpenChat.tsx:202` (`if (action.type === 'navigate') router.push(action.path)`). No new client-action type or chat-side plumbing is needed — `openDividendCalculator` is just another producer of this same shape.
- `openScreener` (`lib/ai/tools.ts:428`) is the closest precedent for "navigate with query-string state." It builds a `URLSearchParams` from AI-supplied filters and returns `navigate` to `/tools/screener?...`.
- `app/tools/dividend/DividendClientPage.tsx` already accepts an `initialHoldings?: DividendSeedHolding[]` prop (added for the Academy demo embed):
  ```ts
  export interface DividendSeedHolding {
    ticker: string;
    name: string;
    mode: 'amount' | 'shares';
    value: string;
  }
  ```
  When set and non-empty, it seeds the initial `holdings` state instead of reading `localStorage['dividend-portfolio']` (`DividendClientPage.tsx:196-207`). Critically, the `handleCalculate` save-to-`localStorage` path only checks `!embedded`, not `initialHoldings` (`DividendClientPage.tsx:317-326`) — so seeding via a prop does **not** suppress normal persistence once the user clicks Calculate.
- `app/tools/dividend/page.tsx` is currently a bare server wrapper with no props and no `searchParams` handling:
  ```ts
  export default function DividendPage() {
    return <DividendClientPage />;
  }
  ```
- `app/tools/compare/page.tsx` is the established precedent for URL-driven pre-fill: `'use client'`, `useSearchParams()`, parsed into props, whole thing wrapped in `<Suspense>` (required by Next.js for `useSearchParams()`).
- `lib/finance/dividend-quick-picks.ts` already curates a "high yield" tag:
  ```ts
  export interface DividendPick { ticker: string; name: string; highYield?: boolean; }
  export const DIVIDEND_QUICK_PICKS: DividendPick[] = [ ...5 entries with highYield: true (O, VZ, MO, T, PFE)... ];
  ```
  This is the exact same list rendered in the calculator's own "Quick add" row with a "High yield" badge — reusing it as Bull's default means Bull's notion of "high yield" never drifts from the page's own.
- `resolveCompanyName(ticker)` already exists in `lib/ai/tools.ts` (used by `addHolding`) — resolves a ticker to a real display name via `companies` → `company_index` → ticker-as-fallback.
- `lib/ai/systemPrompt.ts:205` currently maps `"high-yield dividend"` → `openScreener` with `divYieldMin=4`. That mapping is for *browsing/discovery* intent and stays as-is — it's a different request from "build me a portfolio," which needs explicit disambiguation so the model doesn't route the wrong phrase to the wrong tool (see Routing below).
- `components/ai/ToolResultCard.tsx:59` already renders nothing extra for `type: 'navigate'` client actions (falls through, relies on the assistant's own text) — no new result-card component needed, same as `openScreener` today.

## Scope decisions (confirmed with user)

- **Default stock picks** (no tickers named by the user): reuse `DIVIDEND_QUICK_PICKS.filter(p => p.highYield)` — O, VZ, MO, T, PFE. No new curation logic, no live-yield API calls at pick time.
- **Position sizing**: flat $10,000 per stock by default (matches the calculator's own `EMPTY_ROW` default). If the user gives a total budget ("invest $50k"), split it evenly across the picks instead.
- **Replace vs. append**: Bull's picks **replace** the calculator's starting rows for that visit, not merge with whatever's saved in `localStorage`. This falls out naturally from how `initialHoldings` already works (see "Current state" above) — no special-casing needed, and it matches how the existing preset-apply flow already behaves (`applyPreset` in `DividendClientPage.tsx` replaces wholesale).
- **Mode**: dollar-amount only (`mode: 'amount'`) for v1. A chat request naturally expresses "build me a portfolio" in dollars, not share counts; share-based entry remains a manual on-page action.

## Tool: `openDividendCalculator`

New export in `lib/ai/tools.ts`, alongside the other navigation tools.

```ts
inputSchema: {
  picks?: { ticker: string; amount?: number }[];  // maxItems: 15 (matches MAX_HOLDINGS)
  totalAmount?: number;                            // splits evenly across resolved picks if set
  years?: number;                                  // optional projection period
}
```

`execute`:
1. Resolve the working ticker list: `picks` if provided and non-empty, else the curated high-yield defaults.
2. Resolve each ticker's display name via `resolveCompanyName`.
3. Resolve each ticker's dollar amount: explicit per-pick `amount` → else `totalAmount / count` if `totalAmount` given → else flat `10000`.
4. Build `DividendSeedHolding[]`: `{ ticker: TICKER, name, mode: 'amount', value: String(Math.round(amount)) }`.
5. `JSON.stringify` that array into a `seed` query param (plus `years` if given), return `clientAction({ type: 'navigate', path: '/tools/dividend?seed=...&years=...' })`.
6. Also return a plain-text-friendly summary in the tool result (tickers + amounts) so the assistant's chat reply can confirm what was added without re-deriving it.

Add to the `BULLPEN_TOOLS` map under the existing "Navigation" section.

## URL seeding: `app/tools/dividend/page.tsx`

Converts to the `compare/page.tsx` pattern:
- `'use client'`, inner component reads `useSearchParams()`.
- Parses `seed` (JSON-parse, wrapped in try/catch — malformed or missing falls through to today's default behavior untouched) and `years` (parsed as int, ignored if NaN).
- Loosely validates the parsed array is non-empty objects with string `ticker`/`name`/`value` and `mode` in `('amount'|'shares')` before trusting it; anything else is treated as absent.
- Passes `initialHoldings` / `initialYears` straight through to `<DividendClientPage />`, exactly the props it already accepts today.
- Outer default export wraps the client component in `<Suspense>` with a lightweight fallback (reuse the same skeleton pattern `compare/page.tsx` uses).

No changes to `DividendClientPage.tsx` itself — its prop contract already supports everything needed.

## System prompt updates (`lib/ai/systemPrompt.ts`)

Add a new entry in the "Navigation tools" section, next to `openScreener`:

> **openDividendCalculator**
> Open the Dividend Calculator pre-filled with stocks. Use when the user wants to *build, create, or project* a dividend portfolio — "build me a high yield dividend portfolio," "what would $50k in dividend stocks earn me," "set up a dividend portfolio with KO, JNJ, and O." If the user names specific stocks, pass them as `picks`; otherwise the tool defaults to a curated high-yield set on its own — don't invent tickers yourself. If the user gives a dollar amount, pass it as `totalAmount` (split evenly) or a per-stock `amount` inside `picks`. This only pre-fills the page — it does not compute or state projected income itself; the user (or a follow-up instruction) still needs to press Calculate, so don't claim specific income numbers from this tool's result.

Add a routing disambiguation note near the existing `"high-yield dividend" → divYieldMin=4` screener mapping:

> "High-yield dividend" browsing/discovery requests ("find me high yield dividend stocks," "show me dividend ideas") still route to `openScreener`. Only route to `openDividendCalculator` when the user wants to *build a portfolio* or *project income* — "build me a ___ portfolio," "what would $X in dividend stocks earn," "set up a dividend portfolio."

Add a line to the "Recommended workflows" list:
> "Build/create a dividend portfolio," "project my dividend income" → `openDividendCalculator` with relevant picks/amount

## Out of scope

- Bull computing/stating actual projected dividend income in-chat — that requires the page's own calc engine (`app/api/tools/dividend/route.ts`) and live TwelveData dividend lookups; this tool only pre-fills, matching "redirects the user to the dividend calculator" as requested.
- Share-count (`mode: 'shares'`) seeding from chat.
- Any change to `DividendClientPage.tsx`'s existing behavior, the calc API, or the quick-pick chips feature.
- Dynamically verifying live yields before picking stocks (considered and explicitly rejected in favor of the curated list, to avoid extra API cost/latency for what's ultimately just an editable starting point).
