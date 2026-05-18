# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## UI/UX Design Standard

**When doing any frontend work** (new components, pages, layout changes, styling decisions, animations, loading states) — read `.agents/skills/ui-ux-pro-max/SKILL.md` and apply its guidelines before writing code.

Key sections to apply:
- **Priority 1–3** (Accessibility, Touch & Interaction, Performance) — CRITICAL/HIGH, always check
- **§6 Typography & Color** — contrast ratios, semantic tokens, dark mode
- **§7 Animation** — 150–300ms, transform/opacity only, respect reduced-motion
- **Pre-Delivery Checklist** — run through before finishing any UI task

## Branch Strategy

Two branches only: `preview` and `main`.

- **`preview`** — active development. All new work is committed and pushed here. Vercel auto-deploys it to the stable preview URL.
- **`main`** — production. Only promoted to from `preview` when work is ready to ship (done manually via Vercel dashboard or by merging `preview` → `main`).

**Always push to `preview` only:**
```bash
git add <files>
git commit -m "..."
git push origin preview
```

Never create feature branches. Work directly on `preview`.

## Supabase Migrations

Whenever you create a new `supabase/migrations/NNN_*.sql` file, **apply it immediately via the Supabase MCP** (`mcp__claude_ai_Supabase__apply_migration`). Do not wait for the user to run it manually.

- Project ID: `kgqpzuvhslqazurfrqya` (BullPen, eu-central-1)
- Use `apply_migration` for DDL (CREATE TABLE, ALTER, indexes, RLS policies, etc.)
- Use `execute_sql` for one-off data updates (e.g. setting `account_tier` for an admin user)
- The file in `supabase/migrations/` is the source of truth — what you push must match what was applied

If the migration fails, fix the SQL in the file and re-apply rather than committing a broken migration.

## Commands

```bash
npm run dev          # Start dev server on localhost:3000
npm run build        # Production build
npm run lint         # ESLint check

# One-off scripts (run with tsx via ts-node, no test framework)
npm run test-ai      # Test AI analysis pipeline
npm run test-signals # Test signal generation
npm run test-score   # Test health score calculation
npm run trigger-cron # Manually fire the daily cron job
```

TypeScript build errors are intentionally suppressed in `next.config.ts` (Supabase type mismatches); the `lint` command is the primary code-quality gate.

## Architecture Overview

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

### Asset type system

`lib/assets/asset-type.ts` is the single source of truth:
- `slugToSymbol('BTC-USD')` → `'BTC/USD'`; `symbolToSlug('BTC/USD')` → `'BTC-USD'`
- `inferAssetType(symbol, instrumentType?)` — infers from TwelveData `instrument_type` with symbol-pattern fallback
- `slugToAssetPath(symbol)` — routes stocks/ETFs to `/stock/`, everything else to `/asset/`
- `has24hTrading(type)` — true for crypto; skips ET timezone logic in candles and extended-hours fetch
- `hasEarnings(type)` — true for stock/ETF; gates earnings sub-requests in snapshot
- `hasFinancials(type)` — true for stock; gates financial section rendering

### AI chat stack

```
BullpenChat.tsx (UI)
  → DefaultChatTransport → POST /api/ai/chat/route.ts
    → runAgent() in lib/ai/agent.ts
      → streamText (Vercel AI SDK, OpenAI gpt-4o, maxSteps:5)
        systemPrompt = experiencePrefix + contextPrefix + SYSTEM_PROMPT
```

- `lib/ai/systemPrompt.ts` — 280+ line prompt; documents all 15 tools with credit costs and routing rules
- `lib/ai/tools.ts` — Vercel AI SDK tools that call Supabase or TwelveData
- Experience level (`beginner | intermediate | advanced`) is sent from the client via `body.experienceLevel` and prepended as a system instruction
- Page context (`{tickers, label}`) is injected via `body.context` so the AI knows which stock the user is viewing

### Anthropic Claude usage

Two separate Anthropic-powered features (not using Vercel AI SDK):
- **"Why Today?"** — `app/api/stock/[ticker]/why-today/route.ts` — Claude + Brave web search explains daily price movement (Pro feature)
- **Daily Brief** — `app/api/cron/generate-daily-brief/route.ts` — Claude generates a personalized market summary at 06:30 UTC for Pro users; stored in `daily_briefs` Supabase table

### Experience level system

`hooks/use-experience-level.ts` reads `user.experience_level` from Supabase auth context. `isSimplified = level === 'beginner'`. Components use this to switch between plain-language labels and full financial terminology. `TermTooltip` in `components/ui/TermTooltip.tsx` renders the adaptive label + glossary tooltip on every metric.

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

### Scheduled work

Five Vercel crons defined in `vercel.json`. All are protected by the `CRON_SECRET` header. Trigger any manually with `npm run trigger-cron`.

| Endpoint | Schedule (UTC) | Purpose |
|---|---|---|
| `/api/cron/update-stale-companies` | `0 8 * * *` | Re-ingest SEC filings for the 10 stalest companies; send filing alerts |
| `/api/cron/check-earnings-upcoming` | `0 8 * * *` | Email users about upcoming earnings in held/watched stocks |
| `/api/cron/check-price-moves` | `30 21 * * 1-5` | Email on 5%+ price moves for held/watched stocks |
| `/api/cron/generate-daily-brief` | `30 6 * * *` | Generate AI daily brief for Pro users (Anthropic Claude) |
| `/api/cron/prefetch-market-data` | `0 5 * * *` | Pre-cache S&P 500 + NASDAQ 100 stats/financials |

## Environment variables

Copy `.env.example` (or see `ENV_SETUP.md`) and create `.env.local`. Required:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
TWELVE_DATA_API_KEY
```

Optional but used in production: `FINNHUB_API_KEY`, `RESEND_API_KEY`, `CRON_SECRET`, `LOGO_DEV_KEY`, `NEXT_PUBLIC_APP_URL`, `ANTHROPIC_API_KEY` (Why Today? + Daily Brief), `SNAPTRADE_CLIENT_ID`, `SNAPTRADE_CONSUMER_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
