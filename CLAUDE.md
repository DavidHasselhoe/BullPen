# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## UI/UX Design Standard

**When doing any frontend work** (new components, pages, layout changes, styling decisions, animations, loading states) — read `.agents/skills/ui-ux-pro-max/SKILL.md` and apply its guidelines before writing code.

Key sections to apply:
- **Priority 1–3** (Accessibility, Touch & Interaction, Performance) — CRITICAL/HIGH, always check
- **§6 Typography & Color** — contrast ratios, semantic tokens, dark mode
- **§7 Animation** — 150–300ms, transform/opacity only, respect reduced-motion
- **Pre-Delivery Checklist** — run through before finishing any UI task

### Pre-ship polish pass

**Before committing UI/UX-heavy work** (new pages, redesigns, hero components, anything visual the user will react to), invoke the `impeccable` skill's polish command on the changed surface:

```
/impeccable polish <file-or-route>
```

It runs a methodical final pass — design-system alignment, spacing/alignment audit, interaction-state coverage, copy consistency, loading/transition smoothness — and is the gate between "functionally done" and "shipped". Skip it for backend-only changes, small bug fixes, or tweaks the user already directed precisely (e.g. "change this color to X"). Required for anything the user might call "vibe coded" if it shipped as-is.

### Design Context

`PRODUCT.md` and `DESIGN.md` at the repo root capture BullPen's strategic and visual design system (register: product, platform: web). Read them before non-trivial frontend work — `/impeccable` commands load them automatically, but if you're working outside that skill, check them directly. Key points: **Signal Emerald/Red** is the only meaningful color, reserved for gain/loss + the landing brand accent; Bloomberg-terminal density is the named anti-reference; Instrument Serif italic is a one-word marketing-headline accent only, never product UI.

### Writing UI Copy

Never use an em dash or en dash to connect clauses in text a user reads: toasts, dialog copy, empty states, error messages, button labels, Academy lessons, marketing pages, the changelog, anything rendered in the app. It is one of the strongest tells that a sentence was written by an AI, and BullPen's whole positioning is a product that does not feel machine-generated. Split into two sentences, or use a comma or period instead.

- Bad: "Thanks — got it. No need to file it twice — one report is plenty."
- Good: "Thanks for the report. No need to send it twice."

This is about user-facing copy only. It does not apply to code comments, commit messages, or your own conversational replies to the user.

## Branch Strategy

Two branches only: `preview` and `main`.

- **`preview`** — active development. All new work is committed and pushed here. Vercel auto-deploys it to the stable preview URL.
- **`main`** — production. Updated at the end of each session by merging `preview` → `main` (see End Session Protocol below). Vercel auto-deploys `main` to production on every push.

**Always push to `preview` during a session:**
```bash
git add <files>
git commit -m "..."
git push origin preview
```

Never create feature branches. Work directly on `preview`.

## End Session Protocol

When the user says **"end session"**, run this sequence in order. Stop and report if any step fails.

**1. Check for uncommitted changes from *any* session**
```bash
git status --short
```
This step exists because "always commit and push as you go" only holds within a session that reaches its own end — a session that's interrupted, crashes, or is closed early can leave real, finished work sitting uncommitted, and nothing about `git log origin/main..origin/preview` (step 3) ever looks at the working tree, so it stays invisible to every later "end session" run until someone thinks to check.

If `git status --short` is empty, skip to step 2. Otherwise, inspect every changed/untracked file (`git diff` per file, not just the stat line) and sort into:
- **Real, coherent, finished-looking work** (has a clear purpose, no `TODO`/debug leftovers, reads as complete) — stage and commit each distinct piece of work as its own commit with a real description, same as any other commit in this repo. Don't lump unrelated features into one commit just because they were discovered together.
- **Ambiguous or partial work** — surface it to the user with a summary of what it looks like; don't guess at intent or silently commit something that might be mid-edit.
- **Stray files** (unreferenced assets, tool-cache directories, anything that doesn't look like it belongs in the repo) — do not commit. Flag them and ask before doing anything else with them (never auto-delete).

Never commit a whole pile of unrelated uncommitted files as a single sweep — the same care applied to work written in the current session applies here.

**2. Lint check**
```bash
npm run lint
```
Fix any errors before proceeding. Warnings are acceptable.

**3. Confirm preview is ahead of main**
```bash
git log origin/main..origin/preview --oneline
```
If there are no commits ahead, nothing to merge — tell the user and stop.

**4. Generate changelog entry**
Find the last commit that touched the changelog with `git log -1 --format=%H -- content/changelog.json`, then run `git log <that commit>..HEAD --date=iso-strict --pretty=format:'%ad %H %s'` on `preview` to see everything shipped since, **with each commit's timestamp**.

Date every changelog entry by the **UTC calendar date of the commit(s) that shipped it** — never by "today" / the date the end-session protocol happens to run. Convert each commit's local timestamp to UTC before bucketing (e.g. a commit at `2026-07-21T00:15:00+02:00` is UTC `2026-07-20T22:15:00Z`, so it belongs to the **2026-07-20** entry, not 2026-07-21). This matters because the dashboard's commit activity heatmap (`lib/github/commit-activity.ts`) buckets commits by GitHub's `commit.author.date` UTC day — if the changelog uses a different day, the two views disagree for anyone working past midnight local time.

If the commits since the last changelog entry span more than one UTC calendar day, **write one entry per day** (grouping each shipped item under the UTC date of the commit that introduced it), not one entry dated "today" for everything. Insert them newest-first, same as any other entries.

If there's user-facing material in that range — new features, meaningful UX/behavior changes, user-noticeable bug fixes — write it to `content/changelog.json`. Use plain, non-technical language: no file paths, no commit/ticket references, no jargon. Each item's `type` is exactly one of `"new" | "improved" | "fixed"`. Exclude pure internal refactors, perf/RLS-only commits, dependency bumps, doc/CLAUDE.md-only changes, and **anything scoped entirely to the public marketing/landing site** (the logged-out homepage and its sections, About/Contact/Roadmap/Glossary/Help Center/Disclosures/Security/Privacy/Changelog pages, footer/nav changes on those pages) — visual redesigns, copy tweaks, and new informational pages there are not product changes. Users only care about what changed in the actual app (dashboard, stock pages, tools, alerts, AI features); the changelog is for that, not the brochure. If nothing in the range qualifies, skip this step silently — do not add an empty or filler entry. Commit the change to `preview` before continuing. If an entry was added, run `npm run post-changelog-discord` to announce it in Discord.

**5. Merge preview → main and push**
```bash
git checkout main
git pull origin main
git merge origin/preview --no-edit
git push origin main
git checkout preview
```

**6. Confirm deployment triggered**
Use `mcp__claude_ai_Vercel__list_deployments` to verify a new deployment appeared for `main`. Report the deployment URL to the user.

**Why this matters:** Keeping `main` = what's in production means git history is the source of truth, the `sync-preview` GitHub Action stays a no-op, and there's no drift between the dashboard-promoted build and the actual branch state.

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

**"Bull" is the product name for this AI chat assistant** (the mascot — see `BullAiIcon.tsx`, the "Ask Bull" trigger button, and the `AISidePanel` header). When the user says "Bull" or "Ask Bull" in conversation (e.g. "allow Bull to..."), they mean this chat assistant — `BullpenChat.tsx` / `lib/ai/agent.ts` / `lib/ai/tools.ts` for the main chat, or `ChartAIPanel.tsx` / `lib/ai/chart-agent.ts` for the in-chart assistant.

```
BullpenChat.tsx (UI)
  → DefaultChatTransport → POST /api/ai/chat/route.ts
    → runAgent() in lib/ai/agent.ts
      → streamText (Vercel AI SDK, OpenAI gpt-4o, maxSteps:5)
        systemPrompt = experiencePrefix + contextPrefix + SYSTEM_PROMPT
```

- `lib/ai/systemPrompt.ts` — 280+ line prompt; documents all 16 tools with credit costs and routing rules. `getPortfolioContext` (read-only holdings/watchlist access) is opt-in — only registered when the user enables it in Settings > Ask Bull, same conditional pattern as `createAlert` needing `userId`
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

Split across two schedulers. All cron routes are protected by the `CRON_SECRET` bearer header regardless of who triggers them. Local manual trigger: `npm run trigger-cron` (or `trigger-alerts`). Run `npm run test-cron-coverage` after touching any cron route or scheduler — it fails if a route has no scheduler pointing at it, or a scheduler references a route that doesn't exist.

**Vercel crons** (`vercel.json`) — time-critical, capped at 2 by the Hobby plan, both currently in use:

| Endpoint | Schedule (UTC) | Purpose |
|---|---|---|
| `/api/cron/generate-daily-brief` | `30 6 * * *` | Generate AI daily brief for Pro users (Anthropic Claude) |
| `/api/cron/generate-weekly-pick` | `30 6 * * 1` | Generate Bull's Weekly Pick, published before pre-market so it's actionable from that session's open |

**GitHub Actions crons** (`.github/workflows/cron-*.yml`) — time-tolerant jobs. Each workflow `POST`s/`GET`s the same Vercel route with `Bearer $CRON_SECRET`, so the route code is unchanged; only the scheduler differs. GH cron drift is usually ~5–15 min but has been observed running hours late during high scheduler load — fine for these, which is why anything timing-sensitive (weekly pick, alerts) lives on Vercel instead:

| Endpoint | Schedule (UTC) | Purpose |
|---|---|---|
| `/api/cron/check-user-alerts` | `30 14-21 * * 1-5` | Evaluate user-defined price/metric alerts hourly through market hours (can't be a Vercel cron — Hobby plan only allows once-per-day schedules) |
| `/api/cron/check-earnings-upcoming` | `0 8 * * *` | Email users about upcoming earnings in held/watched stocks |
| `/api/cron/check-price-moves` | `30 21 * * 1-5` | Email on 5%+ price moves for held/watched stocks |
| `/api/cron/prefetch-market-data` | `0 5 * * *` | Pre-cache S&P 500 + NASDAQ 100 stats/earnings |
| `/api/cron/prefetch-market-data?phase=financials` | `0 12 * * *` | Pre-cache income/balance/cash-flow for the full screener universe (own workflow, `cron-prefetch-financials.yml`, since it no longer fits in the same job as the stats phase) |
| `/api/screener/refresh` (active mode) | `0 22 * * *` | Refresh `/statistics` + health score for the top half of the active screener universe by market cap (`cron-refresh-screener-stats.yml`) |
| `/api/screener/refresh` (active + discovery mode) | `0 3 * * *` | Covers the rest of the active universe, then sweeps tier-0 tickers for promotion (`cron-refresh-screener-extended.yml`). Both this and the 22:00 job skip any ticker whose `screener_stats` row is <12h old, so they don't re-fetch what `prefetch-market-data` just warmed. |
| `/api/cron/instagram-earnings-weekly` | `0 12 * * 0` | Generate + stage next week's earnings-calendar Instagram carousel, notify Discord for review. Does not publish — see `scripts/publish-instagram.ts` and `docs/instagram-setup.md`. |

`seed-screener-universe.yml` (`/api/screener/seed-universe`) is `workflow_dispatch`-only — a manual/occasional bootstrap for newly-listed tickers, not a recurring schedule.

The GitHub Actions workflows require **`CRON_SECRET`** to be set in repo secrets (Settings → Secrets and variables → Actions). The production URL defaults to `https://bullpen.no` — override with an `APP_URL` repo variable if needed.

## Market Data: TwelveData Performance & Cost Guidelines

**Current plan: Venture (610 API credits/minute, no daily cap).** See `docs/twelve-data-venture-analysis.md` for full plan details. This is not the Basic plan (8/min) — if you see code comments referencing "Basic plan's 8/min cap", they predate the upgrade and are stale; a single page load's credit burst (even the ~71-credit stock snapshot) is not expected to trip rate limiting on its own at this tier. `withRateLimitRetry` (`lib/twelvedata/twelvedata-client.ts`) still exists as a guard against real bursts (many concurrent users, cron overlap) but 429s should be rare in practice — if a card is intermittently empty and reloading fixes it, suspect transient network errors (fetch/socket resets, malformed JSON bodies) over rate limiting first; check Vercel runtime errors for the actual exception before assuming credits.

Every TwelveData call costs API credits. The rules below are binding — violating them either burns the credit budget or causes 429 errors that degrade the entire app.

### Credit costs at a glance

| Endpoint | Wrapper function | Credits | Default cache TTL |
|---|---|---|---|
| `/quote` (via `/batch`) | `getStockQuotes(symbols[])` | 1 per symbol | Redis 15 s (seed) · 30 s (movers) |
| `/batch` | `batchFetch()` | Σ individual costs | — |
| `/time_series` | `getStockCandles()` | 1 per request | Redis 10–300 s (1D) · Supabase 30 min–6 h |
| `/earnings` | `getCompanyEarnings()` | 20 per symbol | Supabase 12 h |
| `/earnings_calendar` | `getEarningsCalendarRange()` | 40 per request | Next.js 24 h |
| `/statistics` | `getStatistics()` | high (plan-dependent) | Supabase 12 h |
| `/income_statement` | `getIncomeStatement()` | **~101 per request** | Supabase 12 h |
| `/balance_sheet` | `getBalanceSheet()` | **~101 per request** | Supabase 12 h |
| `/cash_flow` | `getCashFlow()` | **~101 per request** | Supabase 12 h |
| `/fundamentals/last_changes` | `getFundamentalsLastChange()` | 1 per symbol | no-store (freshness check) |
| `/profile` | `getCompanyProfile()` | 1 per request | Supabase 24 h |
| `/logo` | `getLogoUrl()` | 1 per symbol | Next.js 24 h |
| `/press_releases` | `getPressReleases()` | 1 per request | Next.js 1 h |
| `/symbol_search` | `symbolSearch()` | 1 per request | no-store |
| `/splits` | `getSplits()` | 20 per request | Next.js 24 h |
| `/dividends` | `getDividends()` | 1 per request | Supabase 12 h |
| `/dividends_calendar` | `getDividendsCalendar()` | 40 per request | Next.js 1 h |
| `/splits_calendar` | `getSplitsCalendar()` | 40 per request | Next.js 1 h |
| `/ipo_calendar` | `getIPOCalendar()` | 40 per request | Next.js 1 h |
| `/insider_transactions` | `getInsiderTransactions()` | **200 per symbol** | Next.js 1 h |
| `/indicator` (SMA/EMA/RSI…) | `getIndicator()` | 1 per request | Next.js 5 min |

**`/income_statement`, `/balance_sheet`, `/cash_flow` are NOT 1-credit calls on this plan** — confirmed live against TwelveData's `/api_usage` endpoint on 2026-08-04 (each cost ~101 credits regardless of `outputsize` or `period`; this plan bills fundamentals at their full-history tier per `docs/twelve-data-venture-analysis.md`). Treat any caller of `getIncomeStatement`/`getBalanceSheet`/`getCashFlow` as expensive: always check cache first, and if it fans out over multiple symbols in one request (a cron batch, a company-compare page), it must reserve against `lib/twelvedata/credit-budget.ts`'s shared guard before firing — `~303 credits per symbol` (all three statements) is enough on its own to blow past the 610/min account cap with just 2 symbols.

### Golden rules

**1. Always batch quotes — never call `getStockQuote` in a loop.**
`getStockQuotes(symbols[])` sends one `/batch` POST. N individual `/quote` GETs cost the same credits but use N round-trips and are far more likely to hit the per-minute rate limit. The batch cap is ~120 requests per POST; use `SEED_CHUNK = 100` as the safe limit.

**2. Check both cache layers before calling TwelveData.**
```
Request → Redis (rget, ~2 ms) → Supabase market_data_cache (getCached, ~20 ms) → TwelveData (100–500 ms, costs credits)
```
- **Redis** (`lib/cache/redis-cache.ts`) — for hot paths: 1D candles, movers, seed quotes. Sub-5 ms reads, shared across serverless instances.
- **Supabase market_data_cache** (`lib/cache/market-data-cache.ts`) — for warm paths: stats, financials, earnings, candles ≥ 1 W. Persisted across cold starts.

Write to both caches fire-and-forget (`void rset(...)`, `void setCached(...)`) so they never block the response.

**3. Use session-aware TTLs for 1D candle data.**
`candleTtlSeconds()` in `lib/cache/redis-cache.ts` reads the ET clock and returns:
- Regular hours (9:30–16:00 ET): **10 s** — prices move every few seconds
- Extended hours (4:00–9:30, 16:00–20:00 ET): **30 s** — slower movement
- Market closed (overnight/weekends): **300 s** — fully static

Always call this function instead of hardcoding a TTL for 1D data.

**4. Check WsManager before fetching seed prices.**
`WsManager.hasPrevClose(symbol)` is a zero-cost in-process check. The SSE stream already seeds WsManager on first delivery and writes each symbol to Redis for 15 s. The three-level dedup in `seedInitialPrices()` is the model to follow for any new real-time data path:
```
WsManager (in-process, 0 ms) → Redis (shared, ~2 ms) → TwelveData (paid)
```

**5. Use `getFundamentalsLastChange()` before re-fetching fundamentals.**
Costs 1 credit and tells you whether financials have updated since last cache. The daily prefetch cron uses this pattern — each symbol costs 1 credit to check vs. 1–20 credits to re-fetch unnecessarily. Do not skip this check in the cron.

**6. Expensive endpoints need long cache TTLs.**
| Endpoint | Why it's safe to cache long |
|---|---|
| `/insider_transactions` (200 credits) | Insider filings are delayed by days; data doesn't change intraday |
| `/earnings_calendar` (40 credits) | Earnings dates are set weeks in advance |
| `/dividends_calendar` (40 credits) | Ex-dividend dates are published weeks ahead |
| `/statistics` (high) | Fundamental ratios update at most daily, often weekly |
| `/profile` (1 credit) | Company metadata changes rarely |

**7. Always catch `TwelveDataRateLimitError` at every API boundary.**
```ts
} catch (error) {
  if (error instanceof TwelveDataRateLimitError) {
    return NextResponse.json({ error: 'plan_restricted' }, { status: 200 });
  }
  // ...
}
```
Return status 200 with `error: 'plan_restricted'` so components render a plan-gated UI instead of an error state. Never let it propagate to a 500 — a 500 triggers retries which amplify the rate limit hit.

### Enabling usage logging

Set `TWELVE_DATA_USAGE_LOG=true` in `.env.local` to log every TwelveData call:
```json
{ "ts": 1716900000000, "source": "twelvedata", "endpoint": "quote", "symbol": "AAPL" }
```
Run a real session with this enabled and `grep twelvedata` the output to identify hot endpoints before optimising.

### TwelveData datetime parsing

TwelveData returns US stock datetimes as ET strings (`"2024-04-29 09:35:00"`). **Never parse these with `new Date()` on a UTC server** — it will apply the server's local timezone and produce wrong timestamps. Use `etDatetimeToUnix()` from `lib/twelvedata/twelvedata-client.ts`, which resolves the EDT/EST offset via `Intl.DateTimeFormat` and caches the result per date.

For market session detection, use `getMarketSession()` (`lib/cache/redis-cache.ts`) or `isExtendedHoursET()` (`lib/twelvedata/twelvedata-client.ts`). Both read the ET clock correctly via `Intl`.

### TanStack Query cache hygiene

Client-side cache settings to enforce for TwelveData-backed hooks:

| Data type | `staleTime` | `gcTime` | `refetchOnWindowFocus` |
|---|---|---|---|
| Live prices (SSE) | N/A — use `useLivePrices` | N/A | N/A |
| Quotes / snapshot | 3 min | 5 min | default (true) |
| Sparklines (decorative) | 20 min | 60 min | `false` |
| Statistics / financials | 30 min | 60 min | `false` |
| Earnings / calendar | 60 min | 120 min | `false` |
| Company profile / logo | 24 h | 48 h | `false` |

Omitting `staleTime` defaults to 0 — the query refetches on every component mount. This is the single most common source of unnecessary TwelveData calls in the codebase.

## Environment variables

Copy `.env.example` (or see `ENV_SETUP.md`) and create `.env.local`. Required:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
TWELVE_DATA_API_KEY
```

Optional but used in production: `FINNHUB_API_KEY`, `RESEND_API_KEY`, `CRON_SECRET`, `LOGO_DEV_KEY`, `NEXT_PUBLIC_APP_URL`, `ANTHROPIC_API_KEY` (Why Today? + Daily Brief), `SNAPTRADE_CLIENT_ID`, `SNAPTRADE_CONSUMER_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `DISCORD_CHANGELOG_WEBHOOK_URL` (Discord changelog announcements — see `scripts/post-changelog-discord.ts`), `DISCORD_INSTAGRAM_WEBHOOK_URL`, `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_BUSINESS_ACCOUNT_ID` (automated Instagram content pipeline — see `docs/instagram-setup.md`).
