# Migrate off the dead `financial_metrics` table — Design

**Goal:** Fix four broken product surfaces that still query the `financial_metrics` Supabase table, which was dropped in migration `038_cleanup.sql` when BullPen switched from the old SEC-ingestion pipeline to TwelveData — but never migrated.

## Background

Discovered while testing new AI-chat starter prompts: "Companies with accelerating revenue" routed to `screenCompanies`, which calls `get_screener_data()` — confirmed live via direct RPC call to return `42P01: relation "financial_metrics" does not exist`. Investigating further found the blast radius is bigger than one AI tool:

- `screenCompanies` (AI tool) — broken, via `get_screener_data()` RPC
- `compareCompanies` (AI tool) — broken, queries `financial_metrics` directly
- `getCompanyMetrics` (AI tool) — broken, queries `financial_metrics` directly; backs the `CompanyMetricsResultCard`'s `TrendBars` visualization
- `app/api/compare/route.ts` — **the real, user-facing `/tools/compare` page** — broken, queries `financial_metrics` directly; confirmed live by reproducing the page's 500 in-browser

Everything else in the app (quotes, statistics, earnings, financials, insider activity, health scores, the real screener) already runs on TwelveData or `screener_stats` (a separate, actively-maintained, TwelveData-backed table) and is unaffected.

## Decisions

**`screenCompanies` is retired, not fixed.** Its filter set (sector, revenue range, gross margin, net margin, EPS, free cash flow, revenue growth) doesn't map cleanly onto `screener_stats`, which lacks gross margin and free cash flow entirely. A working, redundant tool already exists: `openScreener` navigates to the real screener page against the same `screener_stats` table, and its tool description already states a preference for it ("Always prefer this over openComparison or screenCompanies when the user wants to browse visually"). Removing `screenCompanies` eliminates the exact tool-selection ambiguity that caused today's bug (the model chose the broken inline tool over the working navigate tool) rather than papering over it.

**`compareCompanies`, `getCompanyMetrics`, and `/api/compare` are migrated to TwelveData**, not retired — each serves a use case not covered by another working tool (inline side-by-side comparison without navigating away; single-metric trend lookup backing a recently-built visual card; the actual Compare product page). The migration reuses the exact TwelveData wrapper functions (`getIncomeStatement`, `getBalanceSheet`, `getCashFlow`) that `getCompanyFinancials` already uses successfully — no new API integration, just extending an established, working pattern to three more call sites.

## Field mapping

TwelveData's three statement endpoints cover all but one of the metrics these tools currently expose:

| Metric | Source |
|---|---|
| `revenue`, `gross_profit`, `operating_income`, `net_income`, `eps_diluted`, `eps_basic` | `getIncomeStatement` |
| `total_assets`, `total_liabilities`, `shareholders_equity` (→ `total_stockholders_equity`) | `getBalanceSheet` |
| `operating_cash_flow`, `free_cash_flow`, `capital_expenditures` | `getCashFlow` |
| `shares_outstanding` | **No TwelveData equivalent** — none of the three statement endpoints carry a historical share-count series (only `getStatistics`'s point-in-time float estimate). Dropped from `getCompanyMetrics`'s metric enum rather than faking a time series from a single snapshot. |

## Per-file changes

### `lib/ai/tools.ts`

- **Delete** `screenCompanies` (the tool definition, its `METRIC_LABELS`/`METRIC_VALUES`-adjacent constants if unused elsewhere, and its `BULLPEN_TOOLS` registration).
- **Rewrite** `getCompanyMetrics`: drop the Supabase `financial_metrics` query and `resolveCompanyId`-based company lookup (keep `resolveCompanyId` if still used elsewhere — it is, by `compareCompanies`). Map the requested `metric` to the right TwelveData call (income/balance/cashflow), fetch up to 8 periods, reshape into the existing `{ period, periodEnd, value, formatted }` row output — **the `CompanyMetricsResultCard` component requires zero changes**. Remove `shares_outstanding` from `METRIC_VALUES`. Wrap in `TwelveDataRateLimitError` handling matching `getCompanyFinancials`'s existing pattern.
- **Rewrite** `compareCompanies`: keep the existing `Promise.all` per-ticker shape and output structure (`{ comparison: [{ ticker, company, metric, period, data: [...] }] }`), swap the `financial_metrics` query for a TwelveData call per ticker (income/balance/cashflow based on the requested `metric`), same `TwelveDataRateLimitError` handling.

### `lib/ai/systemPrompt.ts`

Remove the `screenCompanies` tool-doc block and its "Recommended workflows" line (systemPrompt.ts:130-131, 264-265 per the version read during brainstorming — exact lines will shift, verify against current file during implementation).

### `components/ai/ToolResultCard.tsx` + `components/ai/cards/ScreenerResultCard.tsx`

Remove the `screenCompanies` switch case from `ToolResultCard.tsx`. Delete `ScreenerResultCard.tsx` entirely — nothing else renders it once the case is gone.

### `app/api/compare/route.ts`

Keep the existing `companies` table lookup (sector, industry, description, logo, employee_count, fiscal_year_end, sic_code, incorporation_location — unaffected by the dead table). Replace the `financial_metrics` query with per-ticker TwelveData fetches (income/balance/cashflow), computing the same derived fields the route already computes today (`grossMargin`, `operatingMargin`, `netMargin`, `revenueGrowth`, 4-period `history` array) from the new source. Preserve the route's existing JSON response shape (`CompareCompany` interface) — **`app/tools/compare/*` page components require zero changes**. Add `TwelveDataRateLimitError` handling matching the app's `{ error: 'plan_restricted' }` @ 200 convention (this route currently doesn't have this — it's a gap worth closing while touching this code, since a rate limit today would otherwise surface as an unhandled 500, same failure mode as the bug being fixed).

## Cost & rate-limit impact

Comparing up to 5 tickers now costs up to 5 × 3 = 15 TwelveData calls (income + balance + cashflow per ticker) instead of one Supabase query. `getCompanyMetrics` costs up to 1 TwelveData call per invocation (unchanged call count, different source). Both are small relative to the Venture plan's 610 credits/minute, but worth noting as a real cost increase over the old (currently-broken) single-query design. No new caching is introduced beyond what `getIncomeStatement`/`getBalanceSheet`/`getCashFlow` already do internally, matching `getCompanyFinancials`'s existing behavior — this migration intentionally matches an established pattern rather than introducing new caching strategy.

## Testing

No unit test framework in this repo. Verification is manual, per surface:
- `getCompanyMetrics`: ask Bull about a specific metric for a known ticker (e.g. "Show me AAPL's revenue history"), confirm the `TrendBars` card renders with real multi-period data.
- `compareCompanies`: ask a comparison question phrased to avoid `openComparison`'s trigger phrases (e.g. "which has higher net margin, AAPL or MSFT?" — a specific analytical question per its own tool description), confirm an inline answer with real numbers.
- `/tools/compare`: navigate directly to `/tools/compare?tickers=NVDA,AMD`, confirm the page renders real company + financial data with no 500s in the network tab.
- `screenCompanies` retirement: confirm it's absent from `BULLPEN_TOOLS`, confirm a "list top N companies" style prompt now falls back to `openScreener` or answers via another working tool instead of erroring.
- `npm run lint` before each commit.

## Out of scope

- No new database tables, no revival of the SEC ingestion pipeline.
- No changes to `screener_stats`/`openScreener`/the real Screener page — already working, untouched.
- No changes to `getCompanyFinancials` — already working, serves as the reference pattern.
- The avatar-upload "permission denied" bug (separate investigation, same session) — the RLS policies for it were already fixed and applied directly via Supabase MCP; the actual root cause of that specific error (an HTTP 400, not a permission error) remains unresolved and needs live reproduction with full response-body capture to diagnose further. Not part of this plan.

## Critical files

- `lib/ai/tools.ts` (modify: delete `screenCompanies`, rewrite `getCompanyMetrics` + `compareCompanies`)
- `lib/ai/systemPrompt.ts` (modify: remove `screenCompanies` docs)
- `components/ai/ToolResultCard.tsx` (modify: remove `screenCompanies` case)
- `components/ai/cards/ScreenerResultCard.tsx` (delete)
- `app/api/compare/route.ts` (modify: replace `financial_metrics` query with TwelveData)
- Reference pattern: `getCompanyFinancials` in `lib/ai/tools.ts` (existing, working, unchanged)
