# Why Today? → Ask Bull sidepanel relocation

## Problem

"Why Today?" (Claude Sonnet + live web search, Pro-only) currently renders as an inline collapsible panel under the price chart in two places:

- `components/stock/StockPricePanel.tsx` — two "Why?" toggle buttons (desktop and mobile layouts), each rendering an inline `<WhyTodayPanel>` under the chart.
- `components/discover/WhyTodayWidget.tsx` — one "Why?" toggle rendering an inline `<WhyTodayPanel>` under the featured mover card.

`components/stock/WhyTodayPanel.tsx`'s fetch `useEffect` depends on `ticker, price, change, changePct, i18n.language`. `price`/`change`/`changePct` are live values that tick via SSE while the panel is open (`useLivePrices` → throttled quote updates flow into `StockPricePanel`, which re-renders and passes fresh props down). Every price tick while the panel is open re-runs the effect, aborts the in-flight stream, and restarts the Claude+search call from scratch — the "it bugs and suddenly regenerates" behavior reported by the user. This also means the current production cost data for `why_today` (avg $0.107/call in tokens alone, before the ~$0.01–0.03/call web-search fee that isn't currently tracked in `cost_usd`) is likely inflated by unnecessary re-fetches.

Every other AI-touching surface in the app (`HealthScoreCard`, `StatisticsGrid`, `FinancialsSection`, `CompanyRowActions`, `ReadLesson`, `GettingStartedCard`) funnels into the single Ask Bull sidepanel (`components/ai/AISidePanel.tsx`) via `useAIPanel()` from `components/ai/AIPanelProvider.tsx`. "Why Today?" is the only AI feature still living as a bespoke inline panel on the page itself. The user wants it relocated into the sidepanel for visual/interaction consistency and to eliminate the re-fetch bug.

## Non-goals

- **Giving Ask Bull's main chat (OpenAI gpt-4o, `lib/ai/tools.ts`) a general web-search tool.** Investigated as part of this design (see Cost section below) — genuinely affordable at any realistic scale (~9–13% of the $12/mo Pro price at moderate usage), but it's a separate feature with its own scope (new tool, its own quota/`proCap`, possibly a model choice). Deferred to a future design.
- **Changing the `/api/ai/why-today` backend.** Model, prompt, streaming protocol, quota (`why_today`, Pro-only, unlimited, 10/min rate limit), and error handling are unchanged.
- **Changing why Discover's `WhyTodayWidget` picks its featured ticker** (biggest mover among held/watched symbols) — only how it triggers the explanation changes.

## Cost context (informs the non-goal above, not this change)

Real production data from `ai_usage` (last 30 days, small sample — 2 Pro users today):

| Feature | Backend | Avg cost/call (tokens only) | Avg input tokens | Avg output tokens |
|---|---|---|---|---|
| `why_today` | Claude Sonnet 4.6 + web search | $0.107 | 33,968 | 343 |
| `chat` | OpenAI gpt-4o | $0.017 | 6,574 | 156 |

`why_today`'s real per-call cost is closer to **$0.12–0.15** once the untracked $10/1,000-search fee is included. Migrating to `claude-sonnet-5` (discounted $2/$10 per MTok through 2026-08-31, vs. `claude-sonnet-4-6`'s $3/$15) would cut this ~33% — a candidate follow-up, not part of this change.

At moderate assumed usage (10 search-worthy queries/Pro-user/month), a hypothetical "Bull gets web search" feature would cost ~$0.90–1.40/Pro-user/month — about 9–13% of the $12/mo Pro price, roughly flat as the user base scales (linear in Pro users × per-user query volume). Not a blocker to building it eventually; out of scope today.

## Architecture

```
StockPricePanel "Why?" click ──┐
WhyTodayWidget "Why?" click ────┤──▶ useAIPanel().openWhyToday({ ticker, price, change, changePct })
                                │
                          AIPanelProvider
                          (whyToday state, isOpen=true)
                                │
                                ▼
                          AISidePanel
                    (body branches on `whyToday`)
                                │
                    ┌───────────┴────────────┐
              whyToday set              whyToday null
                    │                         │
                    ▼                         ▼
             WhyTodayView               BullpenChat
        (new, components/ai/)         (unchanged, stays
        fetches /api/ai/why-today      mounted-but-hidden
        once on mount, fills           to preserve its
        panel body)                    conversation state)
```

### `AIPanelProvider` (`components/ai/AIPanelProvider.tsx`)

Add state and methods, parallel to and independent of the existing `aiContext`/`initialQuery` chat state:

```ts
interface WhyTodayPayload {
  ticker: string;
  price: number;
  change: number;
  changePct: number;
}

whyToday: WhyTodayPayload | null;
openWhyToday: (payload: WhyTodayPayload) => void;  // sets whyToday, setIsOpen(true)
closeWhyToday: () => void;                          // sets whyToday(null); panel stays open on chat
```

`openWhyToday` does **not** touch `initialQuery`/`aiContext`/`conversationId` — those are chat-only state and stay whatever they were. Each call to `openWhyToday` is a fresh view: pass a `key` derived from the call (e.g. an incrementing counter or `Date.now()` captured at click time) so clicking "Why?" again for the same ticker remounts `WhyTodayView` and restarts the fetch, matching today's per-click behavior.

### `AISidePanel` (`components/ai/AISidePanel.tsx`)

- New props `whyToday: WhyTodayPayload | null` and `onCloseWhyToday: () => void`, threaded from the provider the same way `initialQuery`/`aiContext` already are.
- Header: when `whyToday` is set, show "Why $TICKER moved" (or similar) with a back-arrow button calling `onCloseWhyToday()`, in place of the "Ask Bull" title and its new-chat/history/settings controls (those are chat-specific). The panel's own close button (`X`) still closes the whole panel and clears `whyToday`.
- Body: `hasOpened ? <BullpenChat ... style={{display: whyToday ? 'none' : undefined}} /> : null`, with `<WhyTodayView>` rendered (keyed per call) when `whyToday` is set, layered over/instead of the hidden chat. Keeping `BullpenChat` mounted (just visually hidden) means an in-progress chat conversation's `conversationId`/`initialMessages` state, scroll position, and any in-flight stream survive a round trip into Why-Today mode and back. (Edge case: if the user opens Why-Today while Bull is mid-stream, that stream is visually hidden but keeps running in the background — acceptable; going back to chat shows it either finished or still streaming.)
- Auth/terms gating (`AuthGate`, `AiTermsGate`) applies before either branch, same as today — Why Today is Pro-gated at the API layer (402 → upgrade CTA), same as it renders today.

### `WhyTodayView` (new, `components/ai/WhyTodayView.tsx`)

Ports `components/stock/WhyTodayPanel.tsx`'s logic, with changes:

- Drop the `open`/`onClose` collapse props entirely — the component's mount lifecycle *is* its open state (`AISidePanel` conditionally renders it).
- The fetch effect runs once on mount (dependency array is `[]` plus the frozen `ticker/price/change/changePct/i18n.language` props it receives — these never change after mount because they're a one-time snapshot passed via `openWhyToday()`, not a live-ticking prop chain). This is what eliminates the regenerate-on-price-tick bug — structurally, not by tweaking the dependency array in place.
- Streaming states (`searching` / `streaming` / `done` / `error` / `upgrade`), the Pro-upgrade CTA, rate-limit and generic error copy, and the "Powered by Claude + live web search" footer are unchanged in substance.
- Visual treatment changes from a compact inline card (`border-t bg-muted/[0.08] px-5 py-4`) to a full-panel-body layout consistent with `AISidePanel`'s chat body (padding, scroll container, possibly `BullAiIcon` in the searching state) — exact spacing/typography decided during the `/impeccable polish` pass called out in Verification below, not fully speced here.

### Call sites

- `StockPricePanel.tsx`: both "Why?" buttons (desktop ~line 496, mobile ~line 550) call `useAIPanel().openWhyToday({ ticker, price, change, changePct })` instead of toggling local `whyTodayOpen` state. Remove the inline `<WhyTodayPanel>` render (~line 662) and the now-unused `whyTodayOpen` state/import.
- `WhyTodayWidget.tsx`: its "Why?" button calls the same `openWhyToday({ ticker: featured.symbol, price: featured.price, change: featured.change, changePct: featured.changePercent })` instead of toggling local `whyOpen` state. Remove the inline `<WhyTodayPanel>` render and now-unused local state.
- Delete `components/stock/WhyTodayPanel.tsx` once both call sites and `WhyTodayView` are in place.

## Data flow

1. User clicks "Why?" on the stock page or Discover widget with a quote already in hand (both call sites already have `price`/`change`/`changePct` in scope from their existing data sources — no new fetch needed to gather the payload).
2. `openWhyToday(payload)` sets provider state and opens the panel (if not already open).
3. `AISidePanel` renders `WhyTodayView` with that frozen payload as props.
4. `WhyTodayView` POSTs to `/api/ai/why-today` once on mount (unchanged route/protocol), streams SSE events (`searching`/`text`/`done`/`error`), renders bullets as they arrive.
5. User clicks back-arrow → `closeWhyToday()` → panel body swaps back to `BullpenChat`, which resumes exactly where it was (or shows the empty/starter state if no conversation was active).

## Error handling

Unchanged from today's `WhyTodayPanel`: 403 → Pro upgrade CTA with link to `/upgrade`; non-OK response or stream read failure → generic "couldn't load" message; `error` SSE event with `code: 'rate_limited'` → rate-limit copy; any other `error` code → generic message. `AbortController` still aborts the fetch on unmount (now: when the user navigates back to chat or closes the panel, instead of on every prop change).

## Testing

No dedicated test framework in this repo (per `CLAUDE.md`, one-off `tsx` scripts only — no test suite covers UI components like this). Verification is manual: `npm run lint`, then in-browser check via the `run` skill — trigger "Why?" from both the stock page and Discover, confirm the sidepanel opens into the Why-Today view, confirm a live price tick while the panel is open does *not* restart the fetch (the original bug), confirm "back to chat" preserves an existing Bull conversation, confirm the Pro-gate/rate-limit/error states still render correctly, and confirm mobile full-screen behavior (`AISidePanel` already goes full-viewport on mobile).
