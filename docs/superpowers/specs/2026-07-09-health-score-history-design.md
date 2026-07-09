# Financial Health Score History — Design

## Purpose

The Financial Health Score (`components/stock/HealthScoreCard.tsx`) currently shows only a single, ephemeral, current-moment value — recomputed fresh on every page load, with no record of what it was last quarter or the quarter before. Users following a company over time have no way to see whether its financial health is improving or deteriorating. This adds a persisted history of the score, recorded once per quarter as new financial reports land, with a small always-visible trend indicator and an expandable chart on the Health Score card.

## Current state (confirmed by investigation)

- `lib/finance/health-score.ts` — `computeHealthScore(stats, income, balance, cashflow)` is a pure, stateless function returning `{ score, grade, label, summary, categories, metricSignals }`. Despite receiving up to 4 quarters of `income`/`balance`/`cashflow`, every category scorer only reads index `[0]` (the latest quarter) — periods 1–3 are fetched but unused today.
- Five weighted categories sum to 0–100: **Profitability** (30 pts, from `income`/`stats.profitMargin`/`revenueGrowthTTM`), **Financial Strength** (25 pts, from `balance`/`cashflow`), **Valuation** (20 pts, from `stats.peRatioTTM`/`pbRatio`/`evToEbitda`), **Growth** (15 pts, from `stats.*GrowthTTM`), **Market Risk** (10 pts, from `stats.beta`/`shortRatio`).
- **Constraint that shapes this design**: Valuation, Growth, and Market Risk (45 of 100 points) depend on `CompanyStatistics`, fetched from TwelveData's `/statistics` endpoint — a **live snapshot only**, with no historical/point-in-time equivalent available. There is no way to reconstruct "what was this company's P/E as of last quarter" after the fact. Only Profitability + Financial Strength (55 pts) could theoretically be backfilled from already-fetched trailing quarters — but per the scope decision below, we aren't backfilling at all, so this constraint mainly rules out ever offering a *complete* historical reconstruction, not just an initial backfill.
- `app/api/stock/[ticker]/health-score/route.ts` computes the score fresh per request (via `market_data_cache`-backed reads of stats/financials, 1h/24h TTLs) and, as a fire-and-forget side effect, `UPDATE`s `screener_stats.health_score`/`health_score_grade` — a single mutable column, no history, only when none of the 3 statement fetches degraded.
- `lib/market_data/screener-stats.ts` → `fetchAndUpsertScreenerStats()` already fetches fresh `income`/`balance`/`cashflow` and calls `computeHealthScore()` for **every screener-tracked ticker**, **once daily**, driven by existing GitHub Actions crons (`cron-refresh-screener-stats.yml` @ 22:00 UTC batches 0–60, `cron-refresh-screener-extended.yml` @ 03:00 UTC batches 61–115). This is already the exact computation this feature needs — no new cron required.
- `IncomeStatementPeriod`, `BalanceSheetPeriod`, and `CashFlowPeriod` (all in `lib/twelvedata/twelvedata-client.ts`) each carry a `fiscal_date: string` field identifying the period — the natural dedup key for "is this a genuinely new quarter."
- No existing table stores a time series of a computed per-company value. Closest precedent: `daily_briefs` (migration `050_daily_briefs.sql`) — `UNIQUE(published_date)`, service-role-only writes, public `SELECT` — the RLS/index shape this design follows, since health scores are per-ticker/global data, not per-user.
- Charting: `recharts` is already used for comparable small time-series visualizations elsewhere (`components/holdings/PortfolioPerformanceChart.tsx`, `app/tools/dividend/DividendClientPage.tsx`) — this is the library to use here, not `lightweight-charts` (reserved for the dense OHLC price chart).

## Scope decisions (confirmed with user)

- **No backfill.** History starts accumulating from the day this ships. No attempt to reconstruct scores for past quarters (see the Valuation/Growth/Market-Risk constraint above — a full backfill isn't cleanly possible anyway).
- **Snapshot trigger: new quarterly report only**, not a dense daily series. A history row is written only when a ticker's latest `income[0].fiscal_date` differs from its last recorded snapshot — roughly 4 points/year per company, not ~250.
- **Free for everyone** — not Pro-gated. The current-score card itself is already free; gating only its history would be an inconsistent, arbitrary line.
- **Modal scope: overall score only for v1** — a line chart of total score over time plus a simple per-quarter list (date, score, grade, delta from prior quarter). No per-category breakdown view yet (the schema stores category data now so this can be added later without a migration, but the UI for it is out of scope here).

## Data flow

1. `fetchAndUpsertScreenerStats()` (existing daily cron, full tracked universe) computes `computeHealthScore()` as it already does today.
2. New step: compare the freshly-fetched `income[0].fiscal_date` against the ticker's most recent `health_score_history` row. If different (or no row exists yet), insert a new history row via a shared helper, `recordHealthScoreSnapshot(ticker, healthScore, fiscalDate)` (new file `lib/finance/health-score-history.ts`).
3. The same helper is also called from the existing fire-and-forget sync in `/api/stock/[ticker]/health-score/route.ts`, as a safety net for tickers a user actively views that fall outside the screener's tracked universe (e.g. a long-tail holding not in the S&P 500/NASDAQ 100 batches).
4. `recordHealthScoreSnapshot` uses `UNIQUE(ticker, fiscal_date)` as an upsert conflict target (`ON CONFLICT DO NOTHING`), so both call sites can race harmlessly — whichever runs first wins, no double-insert.
5. Guard: only record when none of the 3 statement fetches degraded (mirrors the existing `screener_stats` update guard) — a snapshot from incomplete data is worse than no snapshot.

## Schema — new table `health_score_history`

```sql
CREATE TABLE IF NOT EXISTS health_score_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker        TEXT NOT NULL,
  fiscal_date   TEXT NOT NULL,        -- period identifier from income[0].fiscal_date; dedup key
  snapshot_date DATE NOT NULL,        -- date we actually recorded this row
  score         SMALLINT NOT NULL,
  grade         TEXT NOT NULL,
  categories    JSONB NOT NULL,       -- full HealthScore.categories breakdown, stored for a future per-category view
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ticker, fiscal_date)
);

CREATE INDEX IF NOT EXISTS idx_health_score_history_ticker
  ON health_score_history (ticker, snapshot_date DESC);

ALTER TABLE health_score_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access to health score history"
  ON health_score_history FOR SELECT
  USING (true);
```

No client-side INSERT/UPDATE/DELETE policies — writes go through the service-role client only (same pattern as `daily_briefs`).

## API

New route `GET /api/stock/[ticker]/health-score/history`:
- Reads all rows for the ticker from `health_score_history`, ordered by `snapshot_date ASC`.
- Returns `{ success: true, data: Array<{ fiscalDate, snapshotDate, score, grade }> }` (category breakdown omitted from the response for now — not used by v1 UI, easy to add later since it's already stored).
- No TwelveData calls, no credit cost — pure Supabase read.
- `TwelveDataRateLimitError` handling doesn't apply here; standard try/catch → 500 on unexpected failure is sufficient.

## UI

- `HealthScoreCard.tsx` adds a second TanStack Query call: `useQuery({ queryKey: ['health-score-history', ticker], queryFn: ... , staleTime: 60 * 60_000, gcTime: 120 * 60_000, refetchOnWindowFocus: false })` — matches the "Earnings / calendar" tier in the app's cache-hygiene conventions (infrequently-changing data).
- **Trend badge**: small, always-visible next to the score/grade — e.g. "▲ +3 pts since Q2" or "▼ −5 pts since Q1" — computed from the last two history rows. Rendered only when ≥2 rows exist; otherwise omitted entirely (no placeholder/skeleton needed — most tickers will start with 0–1 rows at launch).
- Clicking the badge opens a `Dialog` (shadcn, matching existing modal patterns like `ProfileModal`) containing:
  - A `recharts` `LineChart`: x-axis = formatted fiscal quarter (e.g. "Q2 '26"), y-axis 0–100, single line + dot markers for `score`, tooltip on hover showing score + grade.
  - Below the chart, a simple list: one row per snapshot, newest first — date, score, grade, delta vs. the prior row (colored red/green with an arrow, reusing the same up/down convention as `DirectionBadge` in `NotificationItem.tsx`).
- **Empty state** (0 or 1 history rows): the badge doesn't render; if the modal is somehow opened anyway (or for a "History" entry point if ever added independently of the badge), show "We just started tracking history for this company — check back after the next earnings report."

## Out of scope

- Any backfill of past quarters (see Scope decisions).
- Per-category historical breakdown UI (data is stored for this; view is not built now).
- A daily/dense snapshot cadence — quarterly-report-triggered only.
- Pro-gating.
- Changes to `computeHealthScore()` itself, or to what data feeds the *current* score.
- A dedicated standalone "History" button — the trend badge is the sole entry point (per the approved UI direction).
