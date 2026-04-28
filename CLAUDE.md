# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Preview Branch Rule

There is a permanent `preview` branch that is deployed to a single stable Vercel preview URL. It always contains every feature across all branches.

**After pushing any feature branch, always also merge it into `preview` and push:**
```bash
git checkout preview
git merge <your-branch> --no-edit
git push origin preview
git checkout <your-branch>  # return to feature branch
```

Merges from `main` → `preview` happen automatically via `.github/workflows/sync-preview.yml` on every push to `main`. Feature branch → `preview` syncs must be done manually (or by Claude).

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
| **Supabase** (Postgres) | User auth, companies DB, holdings, watchlist, social, theses |
| **Twelve Data API** | Primary market data — quotes, candles, stats, financials, earnings |
| **Finnhub** | News feed, fallback prices |
| **SnapTrade** | Brokerage sync (connected holdings) |

### Request flow for a stock page

1. `app/stock/[ticker]/page.tsx` — client component, fires `useStockSnapshot(ticker)` on mount
2. `useStockSnapshot` calls `/api/stock/[ticker]/snapshot` — a single batched TwelveData `/batch` request that seeds TanStack Query cache for quote, stats, and earnings in one round trip
3. Dynamic-imported sub-components (`StatisticsGrid`, `FinancialsSection`, etc.) read from that pre-seeded cache and skip their own fetches

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
| `lib/finance/` | Glossary, health-score algorithm, signal scoring |
| `lib/twelvedata/` | Typed TwelveData API client (`TwelveDataRateLimitError` for 429s) |
| `lib/supabase/` | Typed DB clients, shared `Database` type |
| `lib/security/` | Rate limiting helpers (used in API routes) |
| `lib/currency/` | FX conversion (`convertCurrency`, `getExchangeRates`) |
| `lib/ingestion/` | SEC filing ingestion pipeline (10-K, 10-Q, 8-K) |

### API route conventions

All API routes live under `app/api/`. They follow these patterns:
- Auth check: `createServerClient()` → `supabase.auth.getUser()`
- Rate limiting: `lib/security/rate-limit.ts` applied at the handler level
- TwelveData errors: catch `TwelveDataRateLimitError` and return `{ error: 'plan_restricted' }` with status 200 so components render a plan-gated message rather than an error state
- Streaming responses: `/api/market/prices` and `/api/ai/chat` use SSE / `streamText`

### Path alias

`@/*` maps to the repository root (configured in `tsconfig.json`). Use `@/components/...`, `@/lib/...`, `@/hooks/...` everywhere.

### Scheduled work

One Vercel cron defined in `vercel.json`: `GET /api/cron/update-stale-companies` at `0 8 * * *` (08:00 UTC). Trigger manually with `npm run trigger-cron`. Protected by `CRON_SECRET` header.

## Environment variables

Copy `.env.example` (or see `ENV_SETUP.md`) and create `.env.local`. Required:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
TWELVE_DATA_API_KEY
```

Optional but used in production: `FINNHUB_API_KEY`, `RESEND_API_KEY`, `CRON_SECRET`, `LOGO_DEV_KEY`, `NEXT_PUBLIC_APP_URL`.
