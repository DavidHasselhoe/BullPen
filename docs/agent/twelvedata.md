# TwelveData: performance and cost guidelines

_Moved out of CLAUDE.md on 2026-10-19 so it is read when needed instead of sent with every request. CLAUDE.md points here._


**Current plan: Venture (610 API credits/minute, no daily cap).** See `docs/twelve-data-venture-analysis.md` for full plan details. This is not the Basic plan (8/min) — if you see code comments referencing "Basic plan's 8/min cap", they predate the upgrade and are stale; a single page load's credit burst (even the ~71-credit stock snapshot) is not expected to trip rate limiting on its own at this tier. `withRateLimitRetry` (`lib/twelvedata/twelvedata-client.ts`) still exists as a guard against real bursts (many concurrent users, cron overlap) but 429s should be rare in practice — if a card is intermittently empty and reloading fixes it, suspect transient network errors (fetch/socket resets, malformed JSON bodies) over rate limiting first; check Vercel runtime errors for the actual exception before assuming credits.

Every TwelveData call costs API credits. The rules below are binding — violating them either burns the credit budget or causes 429 errors that degrade the entire app.

### Credit costs at a glance

| Endpoint | Wrapper function | Credits | Default cache TTL |
|---|---|---|---|
| `/quote` (via `/batch`) | `getStockQuotes(symbols[])` | 1 per symbol | Redis 15 s (seed) · 30 s (movers) |
| `/batch` | `batchFetch()` | Σ individual costs | — |
| `/time_series` | `getStockCandles()` | 1 per request | Redis 10–300 s (1D) · Supabase 30 min–6 h |
| `/earnings` | `getCompanyEarnings()` | 20 per symbol | Supabase 12 h |
| `/earnings_calendar` | `getEarningsCalendarRange()` | 40 per request | per-day, see below |
| `/statistics` | `getStatistics()` | high (plan-dependent) | Supabase 12 h |
| `/income_statement` | `getIncomeStatement()` | **~101 per request** | Supabase 12 h |
| `/balance_sheet` | `getBalanceSheet()` | **~101 per request** | Supabase 12 h |
| `/cash_flow` | `getCashFlow()` | **~101 per request** | Supabase 12 h |
| `/last_change/{type}` | `getFundamentalsLastChange()` | 1 per symbol per type (5 for the full check) | no-store (freshness check) |
| `/profile` | `getCompanyProfile()` | **10 per request** | Supabase 90 d (`COMPANY_PROFILE_TTL_SECONDS`) |
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

**`/profile` is 10 credits per call, not 1** — measured 2026-09-15 from the `api-credits-used` response header (rose by exactly 10 per call). A sector backfill that reserved 1 per call fired 61 calls into the 610/min cap in 9 seconds. Any fan-out over `getCompanyProfile` reserves 10 per symbol (see `lib/institutions/enrich-holding-sectors.ts`). Before a bulk job, measure an unfamiliar endpoint's real cost with one call and that header rather than trusting this table.

### Golden rules

**0. Never request a multi-day range from `/earnings_calendar` or `/dividends_calendar`.**
Both silently truncate and drop whole days, with no error and a `status: "ok"` body. `/earnings_calendar` caps at 1200 rows and fills from the *latest* date backwards, so a range loses its **earliest** days — verified 2026-08-10: `2026-08-03..2026-08-07` returned 1200 rows covering only Aug 4-7, while Aug 3 alone returned 141 rows including PLTR, SNAP and VRTX. The Market Calendar was showing 2 rows for a week that really had hundreds. `/dividends_calendar` is worse: it is a *global* feed (no `country` param) with thousands of events a day, defaults to 100 rows, and collapsed the same range onto a single day.

Go through **`lib/market-data/calendar-days.ts`**, which fetches those two one day at a time and caches per day. Per-endpoint quirks that do not generalise: `outputsize` is ignored by `/earnings_calendar`, required by `/dividends_calendar`, and makes `/splits_calendar` return **zero** rows. `/earnings_calendar` also reports a genuinely empty day as an **error** (`"No earning were found between..."`) rather than an empty payload — treat that as `[]`, or every weekend re-fetches at 40 credits forever.

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
Costs 5 credits (one `/last_change/{type}` call per data type) and tells you whether financials have updated since last cache, vs. ~303 credits to re-fetch all three statements. Used by the stock page's freshness check (`/api/stock/[ticker]/freshness`, throttled to once an hour per company) and `/api/admin/refresh-fundamentals`. The endpoint used to be called as `/fundamentals/last_changes`, which does not exist (plain-text 404): every check failed until 2026-09-24.

**6. Expensive endpoints need long cache TTLs.**
| Endpoint | Why it's safe to cache long |
|---|---|
| `/insider_transactions` (200 credits) | Insider filings are delayed by days; data doesn't change intraday |
| `/earnings_calendar` (40 credits) | Earnings dates are set weeks in advance |
| `/dividends_calendar` (40 credits) | Ex-dividend dates are published weeks ahead |
| `/statistics` (high) | Fundamental ratios update at most daily, often weekly |
| `/profile` (10 credits) | Company metadata changes rarely |

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

