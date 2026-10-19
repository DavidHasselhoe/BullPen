# Architecture reference

_Moved out of CLAUDE.md on 2026-10-19 so it is read when needed instead of sent with every request. CLAUDE.md points here._


**BullPen** is a Next.js 16 App Router application targeting beginner-to-intermediate investors. React 19, TypeScript strict mode, Tailwind CSS 4, Radix UI/shadcn-ui, Framer Motion.

### Data sources

| Source | Used for |
|---|---|
| **Supabase** (Postgres) | User auth, companies DB, holdings, watchlist, social, theses, daily briefs |
| **Twelve Data API** | Primary market data — quotes, candles, stats, financials, earnings, logos, symbol search |
| **Finnhub** | News feed, fallback prices |
| **SnapTrade** | Brokerage sync (connected holdings) |
| **Anthropic Claude** | "Why Today?" price explanations, Daily Brief generation |
| **OpenAI** | BullPen AI research assistant chat |
| **Resend** | Transactional email (price alerts, earnings, filing notifications) |
| **Upstash Redis** | API rate limiting and market data caching |

### Request flow for a stock page

1. `app/stock/[ticker]/page.tsx` — client component, fires `useStockSnapshot(ticker)` on mount
2. `useStockSnapshot` calls `/api/stock/[ticker]/snapshot` — a single batched TwelveData `/batch` request that seeds TanStack Query cache for quote, stats, and earnings in one round trip
3. Dynamic-imported sub-components (`StatisticsGrid`, `FinancialsSection`, etc.) read from that pre-seeded cache and skip their own fetches

### Request flow for a crypto/commodity page

1. `app/asset/[slug]/page.tsx` — universal page for non-stock assets (e.g. `/asset/BTC-USD`)
2. `slug` uses hyphen encoding: `BTC-USD` in URL → `BTC/USD` symbol via `slugToSymbol()` at every API boundary
3. `useAssetProfile(slug)` calls `/api/asset/[slug]/profile` — returns `{ assetType, name, symbol, logoUrl }`
4. All stock API routes (`/api/stock/[ticker]/...`) accept slugs via `slugToSymbol(ticker)` at entry; asset-type guards (`hasEarnings`, `has24hTrading`) skip irrelevant sub-requests

### Symbol search

Search does not call the server per keystroke. `/api/search/index` serves the whole catalogue (~18k US stocks, ETFs and index funds, ~810KB of tab-separated text, ~165KB over the wire, CDN-cached 6h) and the browser fetches it once during idle time, then answers every keystroke locally in well under a millisecond via `lib/search/local-index.ts`. `useInstantSearch()` (`hooks/use-symbol-index.ts`) is the single entry point every search surface uses — command palette, stock search, watchlist, screener, compare, add-holding, buy-here.

`/api/search` (TwelveData `symbol_search`, 0.5-2.4s) still runs behind a 250ms debounce and its results are appended below the local ones, because the catalogue is US stocks and ETFs only: crypto pairs, foreign listings and very new symbols exist only there. Two slots are always reserved for it so a full local list can't crowd out BTC/USD.

Index funds are in there too: TwelveData's `/funds` catalogue is 122k US mutual funds, of which the ~850 whose name says "index" are kept (five-letter ticker ending in X, USD). They route to `/etf/[ticker]` like any other fund and the page labels them via `fundLabel()`. Ranking is precomputed server-side into a 0-99 `rank` column (market-cap magnitude for stocks, a name/ticker heuristic for ETFs, flat for index funds — see `lib/search/index-rank.ts`) so the per-keystroke loop only adds integers. `npm run test-search-ranking` asserts the cases that were actually wrong before ranks existed; `--live` benchmarks against a running dev server.

### Asset type system

`lib/assets/asset-type.ts` is the single source of truth:
- `slugToSymbol('BTC-USD')` → `'BTC/USD'`; `symbolToSlug('BTC/USD')` → `'BTC-USD'`
- `inferAssetType(symbol, instrumentType?)` — infers from TwelveData `instrument_type` with symbol-pattern fallback
- `slugToAssetPath(symbol)` — routes stocks/ETFs to `/stock/`, everything else to `/asset/`
- `has24hTrading(type)` — true for crypto; skips ET timezone logic in candles and extended-hours fetch
- `hasEarnings(type)` — true for stock/ETF; gates earnings sub-requests in snapshot
- `hasFinancials(type)` — true for stock; gates financial section rendering

### AI chat stack

**"Bull" is the product name for this AI chat assistant** (the mascot — see `BullAiIcon.tsx`, the "Ask Bull" trigger button, and the `AISidePanel` header). When the user says "Bull" or "Ask Bull" in conversation (e.g. "allow Bull to..."), they mean this chat assistant — `BullpenChat.tsx` / `lib/ai/agent.ts` / `lib/ai/tools.ts` for the main chat, or `ChartAIPanel.tsx` / `lib/ai/chart-agent.ts` for the in-chart assistant.

```
BullpenChat.tsx (UI)
  → DefaultChatTransport → POST /api/ai/chat/route.ts
    → runAgent() in lib/ai/agent.ts
      → streamText (Vercel AI SDK, OpenAI gpt-4o, maxSteps:5)
        systemPrompt = experiencePrefix + contextPrefix + SYSTEM_PROMPT
```

- `lib/ai/systemPrompt.ts` — 3,224 tokens after the 2026-09-22 audit (was 9,022). **It must not document individual tools.** What a tool does, when to use it and what it costs belongs in its `description` in `lib/ai/tools.ts`, which ships in the same request: the prompt used to carry a second copy of all 23, the two wordings had drifted apart, and two conditionally-registered tools were described to users who did not have them. The prompt carries audience, how to answer, cross-tool routing, and the product and policy boundaries. `npm run test-bull-routing` probes the routing it is responsible for. `getPortfolioContext` (read-only holdings/watchlist access) is opt-in — only registered when the user enables it in Settings > Ask Bull, same conditional pattern as `createAlert` needing `userId`
- `lib/ai/tools.ts` — Vercel AI SDK tools that call Supabase or TwelveData
- Experience level (`beginner | intermediate | advanced`) is sent from the client via `body.experienceLevel` and prepended as a system instruction
- Page context (`{tickers, label}`) is injected via `body.context` so the AI knows which stock the user is viewing

### Anthropic Claude usage

Two separate Anthropic-powered features (not using Vercel AI SDK):
- **"Why Today?"** — `app/api/stock/[ticker]/why-today/route.ts` — Claude + Brave web search explains daily price movement (Pro feature)
- **Daily Brief** — `app/api/cron/generate-daily-brief/route.ts` — Claude generates a personalized market summary at 06:30 UTC for Pro users; stored in `daily_briefs` Supabase table
- **Bull's Weekly Pick** — `lib/ai/picks/pipeline.ts` (v2 since 2026-Q4, Opus 5.5): a deterministic factor screen (`lib/picks/factor-screen.ts`) picks the 25-name shortlist, Opus with web search does due diligence, then three independent commit runs vote. The model does not propose ideas: when it did, 9 of the first 10 picks were the same AI-capex trade. Don't backtest the LLM stages on past weeks, the model has memorised them. `npm run test-weekly-pick` (screen only, free) / `-- --full` (real Opus calls). The track record can be scoped by quarter (`?quarter=2026-Q3`); quarters group picks, they never close or reset them.

### Experience level system

`hooks/use-experience-level.ts` reads `user.experience_level` from Supabase auth context. `isSimplified = level === 'beginner'`. Components use this to switch between plain-language labels and full financial terminology. `TermTooltip` in `components/ui/TermTooltip.tsx` renders the adaptive label + glossary tooltip on every metric.

### Display clock (time zone + 12/24h)

`lib/dates/clock.ts` decides how a time of day is shown: the zone from `users.settings.time_zone` (`'auto'` = the device, `'market'` = New York, or an IANA zone, set in Settings > Preferences) and 12- vs 24-hour from the app language. `ClockSync` (mounted in `app/providers.tsx`) keeps it current; `useClock()` subscribes. Format new time-of-day UI with `fmtClockTime` / `fmtClockDate` rather than a fresh `toLocaleTimeString`. Two things must never go through it: exchange logic (session and trading-day bucketing pins `America/New_York` itself) and date-only values (a daily bar, an earnings date), which a zone shift moves to another day. Charts, 1D/5D axes and economic release times use it; the rest of the app still formats on the device clock, which is identical under `'auto'`.

### Auth

`components/auth/AuthProvider.tsx` owns auth state via `supabase.auth.onAuthStateChange()`. It provides `{ user: AuthUser | null, isLoading, isAuthenticated, refresh() }`. Use `useAuth()` (from `hooks/use-auth.ts`) in page components. Server-side auth uses `createServerClient()` (service role, no session refresh).

`middleware.ts` runs on every route, refreshes the Supabase session cookie, and applies security headers (CSP, HSTS, etc.).

### Data fetching conventions

- All client-side fetching goes through **TanStack Query** (`useQuery` / `useMutation`).
- `queryKey` conventions: `['company-info', ticker]`, `['stock-statistics', ticker]`, `['holdings-quotes', symbols]`, etc. — always include the dynamic param so cache is scoped correctly.
- Live prices use SSE via `useLivePrices(symbols)` → `useThrottle(livePrices, 3000)` before passing to memos/components to avoid per-tick re-renders.

### Supabase clients

```ts
createBrowserClient()  // lib/supabase/client.ts — cookie-based, use in Client Components and Server Actions
createServerClient()   // lib/supabase/server.ts  — service role, use in API routes and Server Components
```

Never expose the service role key client-side.

### Key lib directories

| Path | Purpose |
|---|---|
| `lib/ai/` | Agent, system prompt, tool definitions |
| `lib/assets/` | Asset type utilities (`slugToSymbol`, `inferAssetType`, `slugToAssetPath`, type guards) |
| `lib/finance/` | Glossary, health-score algorithm, signal scoring |
| `lib/twelvedata/` | Typed TwelveData API client (`TwelveDataRateLimitError` for 429s) |
| `lib/supabase/` | Typed DB clients, shared `Database` type |
| `lib/security/` | Rate limiting helpers (used in API routes) |
| `lib/currency/` | FX conversion (`convertCurrency`, `getExchangeRates`) |
| `lib/ingestion/` | SEC filing ingestion pipeline (10-K, 10-Q, 8-K) |
| `lib/search/` | TwelveData symbol search ranking and deduplication logic |

### API route conventions

All API routes live under `app/api/`. They follow these patterns:
- Auth check: `createServerClient()` → `supabase.auth.getUser()`
- Rate limiting: `lib/security/rate-limit.ts` applied at the handler level
- TwelveData errors: catch `TwelveDataRateLimitError` and return `{ error: 'plan_restricted' }` with status 200 so components render a plan-gated message rather than an error state
- Streaming responses: `/api/market/prices` and `/api/ai/chat` use SSE / `streamText`

### Path alias

`@/*` maps to the repository root (configured in `tsconfig.json`). Use `@/components/...`, `@/lib/...`, `@/hooks/...` everywhere.

