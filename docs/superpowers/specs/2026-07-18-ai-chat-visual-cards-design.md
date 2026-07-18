# Bull chat: visual result cards + real write-action receipts

## Context

Bull (BullPen's AI chat assistant) already renders some tool results as compact visual cards instead of raw prose — `components/ai/ToolResultCard.tsx` has hand-rolled cards for `getHealthScore`, `getLiveQuote`, `getKeyStatistics`, `getCompanyProfile`/`getLiveCompanyProfile`, `getCompanyFinancials`, and `getEarningsData`. Six of Bull's 23 tools fall through to `null` and render as plain text/markdown, including `screenCompanies` (a ranked list), `getCompanyMetrics` (a historical trend), and all four portfolio/alert write-action tools (`addHolding`, `updateHolding`, `removeHolding`, `createAlert`).

This work extends that card system using the visual primitives just built for the stock page redesign (`components/viz/RangeBar`, `DeltaBar`, `FlowBar`, `TrendBars`), and fixes a real correctness gap along the way: the four write-action tools don't actually mutate anything server-side — they return a `__clientAction` descriptor that `BullpenChat.tsx`'s `onFinish` executes *after* the message has already streamed and rendered, and today any failure there is silently swallowed (`catch { /* Silently skip */ }`). The assistant's text can claim "done" while the mutation quietly failed, with zero visible signal to the user.

## Goals

1. Add visual cards for `screenCompanies`, `getCompanyMetrics`, and a new `getInsiderActivity` tool.
2. Upgrade the existing `getEarningsData` and `getKeyStatistics` cards to use `DeltaBar`/`RangeBar`.
3. Give the four write-action tools real success/failure feedback in the chat, with retry on failure — not just an optimistic "requested" card.
4. Split `ToolResultCard.tsx` (currently 316 lines, 6 cases) into `components/ai/cards/` before it grows to ~11 cases plus a new stateful pattern.

## Non-goals

- No changes to the in-chart AI assistant (`ChartAIPanel`/chart-agent) — it doesn't have portfolio/alert tools, and none of the new read-only tools are chart-relevant.
- No change to *when* the write-action mutation fires (still `onFinish`, after streaming) — only to whether its outcome becomes visible. Reordering that is a bigger change to the AI SDK streaming flow and isn't needed to fix the silent-failure gap.
- No persistence of action-outcome state across page reloads/history — see "Historical vs. live messages" below.

## Architecture: `components/ai/cards/`

```
components/ai/cards/
  CardPrimitives.tsx        — CardShell, StatCell (moved out of ToolResultCard.tsx as-is)
  HealthScoreResultCard.tsx
  LiveQuoteResultCard.tsx
  KeyStatisticsResultCard.tsx     — gains RangeBar
  CompanyProfileResultCard.tsx
  CompanyFinancialsResultCard.tsx
  EarningsResultCard.tsx          — gains DeltaBar (replaces Beat/Missed badge)
  ScreenerResultCard.tsx          — new
  CompanyMetricsResultCard.tsx    — new
  InsiderActivityResultCard.tsx   — new
  ActionReceiptCard.tsx           — new, the stateful one
components/ai/ToolResultCard.tsx  — thin dispatcher (switch → import), ~30 lines
```

Each `*ResultCard.tsx` keeps the existing per-tool `interface XOutput { ... }` + component + null-guard pattern already established — this is a mechanical split, not a rewrite of the existing 6 cards' logic or appearance.

## Data-shape changes (additive only)

Three existing tools only return pre-formatted strings (`"$333.75"`), but the new visual primitives need raw numbers. Rather than parsing formatted strings back into numbers, add small `*Raw` numeric fields alongside the existing (untouched) formatted fields — zero risk to how the model currently reads/writes about these tools:

| Tool | New field(s) |
|---|---|
| `getLiveQuote` | `priceRaw: number` |
| `getKeyStatistics` | `week52HighRaw`, `week52LowRaw: number` |
| `getEarningsData` (per row) | `epsActualRaw`, `epsEstimateRaw: number \| null` |

`getCompanyMetrics` already returns raw `value: number \| null` alongside `formatted` on every row — no change needed.

## Card designs

**`ScreenerResultCard`** (`screenCompanies`) — compact vertical list, not a wide table (chat is narrow). Cap at 5 visible rows + "and N more" text when the tool returned more. Ticker + name + revenue growth, colored via the same sign-detection-from-formatted-string helper (`isNegative()`) already used in this file for `LiveQuoteResultCard` — no new numeric fields needed here.

**`CompanyMetricsResultCard`** (`getCompanyMetrics`) — `TrendBars` sparkline across the returned periods (reversed to oldest→newest; the tool returns newest-first), metric label + latest formatted value as text alongside.

**`EarningsResultCard`** (`getEarningsData`) — replace the Beat/Missed badge with `DeltaBar` per row (using the new `epsActualRaw`/`epsEstimateRaw` fields), keeping the surprise-% text.

**`KeyStatisticsResultCard`** (`getKeyStatistics`) — add `RangeBar` using `week52LowRaw`/`week52HighRaw`. For the current-price marker: check the same message's other completed tool calls for a sibling `getLiveQuote` on the same ticker and read `priceRaw` from it; if there isn't one, `RangeBar` renders without the marker (it already supports that).

**`InsiderActivityResultCard`** + new tool **`getInsiderActivity`** — same cost tier and calling discipline as `getKeyStatistics` (~200 credits; system prompt instructs "only when the user explicitly asks about insider buying/selling — never speculatively"). Aggregates the existing `getInsiderTransactions()` (already powering the stock page's Insiders card) into:

```ts
{
  ticker: string;
  buyValue: string; sellValue: string; netValue: string;   // formatted, signed
  buyValueRaw: number; sellValueRaw: number; netValueRaw: number;
  tradeCount: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  topTransactions: Array<{ name: string; position: string; type: 'buy'|'sell'|'other'; value: string; date: string }>; // top 3 by size
}
```

`topTransactions` gives the model concrete names/positions to cite in prose, not just an aggregate. Card renders `FlowBar` (buy vs. sell) + the insight sentence, matching the stock page's `InsiderTransactionsCard` pattern.

## Write-action receipts (`ActionReceiptCard`)

### Current flow (unchanged)
`onFinish` fires once the assistant message finishes streaming → loops over client actions found in that message → calls the real mutation hook (`useAddOrUpdateHolding`, `useUpdateHoldingBySymbol`, `useRemoveHoldingBySymbol`, `useAlerts().create`) → today, any thrown error is caught and discarded.

### New: unified action extraction with stable keys
`extractClientActions` (currently a standalone function in `BullpenChat.tsx`, indexed separately from the render loop) gets folded into `getCompletedToolCalls` (`lib/ai/tool-ux.ts`), which already produces the exact array the render loop maps over with index `i`. `getCompletedToolCalls` gains an optional `clientAction` field per entry (parsed from `__clientAction` on the tool's output, if present):

```ts
export function getCompletedToolCalls(message): Array<{
  toolName: string;
  output: unknown;
  clientAction?: ClientAction;  // type moves to lib/ai/tool-ux.ts (or a new lib/ai/client-actions.ts)
}>
```

Both the render loop and `onFinish`'s mutation loop now iterate this **same array**, so an action's key — `${message.id}::${i}` — is identical in both places. (Today's separate `extractClientActions` walks `message.parts` independently and doesn't carry an index at all; reusing one array removes the class of bug where the two loops could disagree about which action is which.)

### New state
`BullpenChat` gains:
```ts
const [actionOutcomes, setActionOutcomes] =
  useState<Record<string, { status: 'pending' | 'success' | 'error'; message?: string }>>({});
```

The mutation-dispatch body currently inline in `onFinish`'s loop is extracted into `runClientAction(action: ClientAction, key: string)`, called from two places:
1. `onFinish`, for each `clientAction` found (first attempt) — marks `pending` immediately before the `await`, then `success`/`error` after.
2. `ActionReceiptCard`'s Retry button, passed down as `onRetry={() => runClientAction(action, key)}` — identical code path, no duplicated mutation logic.

### Rendering rule
- `actionOutcomes[key]` exists → render that state (spinner / ✓ emerald "Added NVDA to your holdings" / ✗ red "Couldn't add NVDA — {message}" + Retry button). Reuses the app's existing emerald-success/red-error convention — no new colors.
- No entry yet, but the message was created in *this* session (see below) → render `pending` implicitly (the mutation just hasn't resolved).
- No entry, and the message came from loaded history → render a neutral "you asked to add NVDA to your holdings" style with **no** status badge. We don't know the real outcome for a past session's action, and a fake or stuck-forever status would be worse than none.

### Historical vs. live messages
`BullpenChat` already accepts `initialMessages?: UIMessage[]` when resuming a saved conversation (`AISidePanel`'s history dropdown). On mount, capture the `id`s present in `initialMessages` into a `Set` (e.g. via a `useRef` initializer so it's computed once and never mutated as new messages stream in). Any message whose `id` is in that set is "historical"; anything else is "live" (created via this mount's own `sendMessage`/streaming flow). `ActionReceiptCard` receives `isHistorical` computed from this set.

### Bug fix bundled in
`STATUS_LABELS` in `tool-ux.ts` is missing an entry for `createAlert` (falls back to generic "Working…" today) — add it alongside the new `getInsiderActivity` entry while touching this file.

## System prompt / tool-ux additions

- `systemPrompt.ts`: new `getInsiderActivity` tool doc, phrased like the existing `getKeyStatistics` entry (cost + explicit-ask-only rule), added to the "Recommended workflows" list ("Insider buying/selling → getInsiderActivity").
- `tool-ux.ts`: `STATUS_LABELS['getInsiderActivity'] = 'Checking insider activity…'`, `STATUS_LABELS['createAlert'] = 'Setting up your alert…'`, `FOLLOWUPS['getInsiderActivity'] = [...]`.

## Testing / verification

- Manual: exercise each new/upgraded card in the running chat (screener query, a metrics-history question, an earnings question, a valuation question paired with a price question in the same turn to confirm the sibling-price correlation, an insider-activity question).
- Manual: addHolding/updateHolding/removeHolding/createAlert happy path (pending → success) and a forced-failure path (e.g. temporarily throw in the mutation hook, or trigger the free-tier alert limit) to confirm the error state + Retry actually re-runs and can succeed.
- Manual: open a past conversation from history (one that contains a write action) and confirm it renders the neutral historical style, not a stuck spinner or a false success.
- `npm run lint` clean; no new TypeScript `any`.

## Open implementation questions for the plan phase

- Exact typing/location for the shared `ClientAction` type once it moves out of `BullpenChat.tsx` into `tool-ux.ts` (or a new `lib/ai/client-actions.ts`) — needs to stay importable by both files without a circular dependency.
- Confirm `useChat`'s message-id stability across the `initialMessages` → live-streaming transition (i.e. that a resumed message's `id` doesn't change once new messages start appending) before relying on it for the historical/live split.
