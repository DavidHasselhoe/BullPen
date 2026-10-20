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

### Long pick lists get a search box

A dropdown with more than ~20 options (time zones, industries, countries, currencies if the list grows) uses `<SearchableSelect>` (`components/ui/searchable-select.tsx`), not `<Select>`. A plain Select of 400 time zones ran past the Settings modal with no way to jump to Oslo. Count the real worst case, not the usual one: the screener's Industry list is ~20 inside a sector and 125 with none picked. Options like "Automatic" or "Any" go in `pinned`, which stays above the list.

### Writing UI Copy

Never use an em dash or en dash to connect clauses in text a user reads: toasts, dialog copy, empty states, error messages, button labels, Academy lessons, marketing pages, the changelog, anything rendered in the app. It is one of the strongest tells that a sentence was written by an AI, and BullPen's whole positioning is a product that does not feel machine-generated. Split into two sentences, or use a comma or period instead.

- Bad: "Thanks — got it. No need to file it twice — one report is plenty."
- Good: "Thanks for the report. No need to send it twice."

This is about user-facing copy only. It does not apply to code comments, commit messages, or your own conversational replies to the user.

### Never cut off generated text

A sentence that ends in "…" with no way to read the rest is the app telling someone there is more and refusing to show it. In model-written content the cut-off half is usually the part carrying the number or the caveat. The risk hero shipped `MU represents 35.3% of the total portfolio, a dangerously high single-stock weig…` for exactly this reason.

So: **model-written prose is never truncated without an expand affordance.**

- **Prose** (a risk description, a thesis bullet, a company summary, an error message) — wrap it in `<ClampedText>` (`components/ui/ClampedText.tsx`). It clamps to 2-4 lines and shows a translated Show more **only when the text really overflows**, measured with a ResizeObserver. Never guess from string length: the same sentence clamps in one column width and not another.
- **Short labels that genuinely cannot wrap** (a ticker, a company name, a sector in a dense table row) — plain `truncate` is still right, ideally with a `title`. Mark the line with `{/* clamp-ok: why */}` so the choice is written down rather than defaulted into.
- **Never** `.slice(0, n) + '…'` on generated text. CSS truncation hides; a slice destroys, and no amount of UI can recover it.

`npm run test-no-truncated-text` enforces this across the generated-content directories and fails on an unmarked `truncate` / `line-clamp-N`. Run it after touching any surface that renders AI output.

## Branch Strategy

Two branches only: `preview` and `main`.

- **`preview`** — active development. All new work is committed and pushed here. Vercel auto-deploys it to the stable preview URL.
- **`main`** — production. Updated at the end of each session by merging `preview` → `main` (see End Session Protocol). Vercel auto-deploys `main` to production on every push.

**Always push to `preview` during a session:**
```bash
git add <files>
git commit -m "..."
git push origin preview
```

Never create feature branches. Work directly on `preview`.

## End Session Protocol

When the user says **"end session"**, read `docs/agent/end-session.md` and follow it exactly, in order: uncommitted work from any session, lint, preview ahead of main, code review (plus security review on billing/auth/admin/migration changes), changelog (dated by each commit's UTC day), merge preview → main, confirm the Vercel deployment.

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
npm run test-signals # Test signal generation
npm run test-score   # Test health score calculation
npm run trigger-cron # Manually fire the daily cron job
```

TypeScript build errors are intentionally suppressed in `next.config.ts` (Supabase type mismatches); the `lint` command is the primary code-quality gate.

## Reference docs (read when the task touches them)

| Read | Before |
|---|---|
| `docs/agent/architecture.md` | Data sources, stock/asset page request flow, symbol search, asset types, AI chat stack, Anthropic features (Why Today, Daily Brief, Weekly Pick), experience level, display clock, auth, Supabase clients, API route conventions |
| `docs/agent/twelvedata.md` | Any TwelveData call: per-endpoint credit costs, cache layers and TTLs, calendar truncation quirks, datetime parsing, TanStack cache settings |
| `docs/agent/scheduled-work.md` | Touching any cron route or scheduler (Vercel, QStash, GitHub Actions); then run `npm run test-cron-coverage` |
| `docs/agent/environment.md` | Adding or reading an env var |
| `docs/agent/legal-compliance.md` | Signup or age checks, any email send, billing or trial copy, PostHog config |

## Architecture essentials

Next.js 16 App Router, React 19, TypeScript strict, Tailwind 4, Radix/shadcn, Framer Motion, for beginner-to-intermediate investors. Supabase (auth, data), TwelveData (market data, paid per credit), Finnhub (news; no display license, diagnostics only), SnapTrade (brokerage sync), Anthropic and OpenAI (AI), Resend (email), Upstash Redis (cache, rate limits).

- **"Bull" is the AI chat assistant** (`BullpenChat.tsx` / `lib/ai/agent.ts` / `lib/ai/tools.ts`; in-chart: `ChartAIPanel.tsx` / `lib/ai/chart-agent.ts`). "Ask Bull" means that. `lib/ai/systemPrompt.ts` must not document individual tools: a tool's behaviour lives in its `description` in `tools.ts`.
- **Supabase clients:** `createBrowserClient()` (`lib/supabase/client.ts`, cookie-based) in Client Components; `createServerClient()` (service role) in API routes and Server Components. Never expose the service role key. The service role bypasses RLS, so a broken policy stays invisible: check member visibility with `lib/social/visibility.ts`.
- **Asset types:** `lib/assets/asset-type.ts` is the single source (`slugToSymbol`, `symbolToSlug`, `slugToAssetPath`, `inferAssetType`). URLs use hyphen slugs (`BTC-USD`), APIs use `BTC/USD`.
- **Client data:** TanStack Query only, with the dynamic param in every `queryKey` and an explicit `staleTime`. Live prices via `useLivePrices` + `useThrottle`.
- **Auth:** `useAuth()` in components; `middleware.ts` refreshes the session and sets security headers.
- **Times of day:** `fmtClockTime` / `fmtClockDate` (`lib/dates/clock.ts`), never a fresh `toLocaleTimeString`. Exchange logic pins `America/New_York`; date-only values never go through the clock.
- **Path alias:** `@/*` is the repo root.
- **API routes:** auth via `createServerClient()` + `getUser()`, rate limit from `lib/security/rate-limit.ts`, and catch `TwelveDataRateLimitError` to return `{ error: 'plan_restricted' }` with status 200 (a 500 triggers retries that amplify the rate limit).

## TwelveData: binding rules

Plan: Venture, 610 credits/minute. Full costs and quirks in `docs/agent/twelvedata.md`; the rules that must never be broken:

- **Fundamentals are expensive:** `/income_statement`, `/balance_sheet`, `/cash_flow` cost ~101 credits each (~303 per symbol for all three); `/profile` costs 10, `/insider_transactions` 200. Check cache first; any fan-out over symbols reserves against `lib/twelvedata/credit-budget.ts`. Measure an unfamiliar endpoint's real cost with one call and the `api-credits-used` header.
- **Never request a multi-day range from `/earnings_calendar` or `/dividends_calendar`:** both silently drop days. Go through `lib/market-data/calendar-days.ts`.
- **Batch quotes** with `getStockQuotes(symbols[])`, never `getStockQuote` in a loop.
- **Cache before calling:** Redis (`lib/cache/redis-cache.ts`) then Supabase `market_data_cache`, written fire-and-forget. 1D candles use `candleTtlSeconds()`, never a hardcoded TTL.
- **Use `getFundamentalsLastChange()`** (5 credits) before re-fetching fundamentals.
- **Parse TwelveData datetimes with `etDatetimeToUnix()`**, never `new Date()` (they are New York time strings).

## Scheduled work

Three schedulers, every cron route protected by the `CRON_SECRET` bearer header: Vercel crons (`vercel.json`, once-a-day jobs), Upstash QStash (sub-daily and time-sensitive: user alerts), GitHub Actions (`.github/workflows/cron-*.yml`, long batch loops and jobs that commit to git). The full table is in `docs/agent/scheduled-work.md`. Run `npm run test-cron-coverage` after touching any cron route or scheduler.

## Environment variables

Copy `.env.example` (or see `ENV_SETUP.md`) to `.env.local`. Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `TWELVE_DATA_API_KEY`. The optional ones and what reads them: `docs/agent/environment.md`.

## Legal compliance (load-bearing, read `docs/agent/legal-compliance.md` before touching)

Age gate (18+, enforced in `lib/auth/age-gate.ts` and migration 147's trigger: change both or neither); every email goes through `sendEmail` with a `kind` that picks the CAN-SPAM footer; `renewalTerms()` in `lib/billing/trial-copy.ts` is the single auto-renewal disclosure; PostHog session replay is off in both the code and the project.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
