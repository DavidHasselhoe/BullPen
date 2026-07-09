# Financial Health Score History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist a Financial Health Score snapshot each time a tracked company's quarterly report lands, and surface the trend on the Health Score card via a small badge that opens a chart + list of past scores.

**Architecture:** A new `health_score_history` table (one row per ticker/fiscal-quarter) is populated by extending the two places that already compute `computeHealthScore()` — the daily screener-refresh cron and the per-ticker `/health-score` route — with a shared, idempotent insert helper keyed on `(ticker, fiscal_date)`. A new read-only API route serves the history to a new modal component wired into the existing `HealthScoreCard`.

**Tech Stack:** Next.js API routes, Supabase (Postgres + RLS), TanStack Query, `recharts`, shadcn `Dialog`.

## Global Constraints

- No backfill — history starts accumulating from the day this ships (per approved design spec, `docs/superpowers/specs/2026-07-09-health-score-history-design.md`).
- A history row is written only when a ticker's latest `income[0].fiscal_date` differs from what's already stored — not on every daily cron run.
- Feature is free for everyone — no Pro gating.
- v1 UI shows the overall score only (line chart + list) — no per-category breakdown view, though the schema stores category data for later.
- No test framework exists in this repo (confirmed: `package.json` has no `jest`/`vitest`; verification is done via one-off `tsx` scripts under `scripts/`, following the existing pattern in `scripts/test-trends.ts`). "Tests" in this plan are these verification scripts, run manually and checked by eye/query, not asserted via a test runner.
- Whenever a new `supabase/migrations/NNN_*.sql` file is created, apply it immediately via the Supabase MCP (`mcp__claude_ai_Supabase__apply_migration`) — per this repo's CLAUDE.md. Project ID: `kgqpzuvhslqazurfrqya`.
- Push commits to the `preview` branch (never `main` directly) — per this repo's CLAUDE.md branch strategy.

---

### Task 1: `health_score_history` table

**Files:**
- Create: `supabase/migrations/078_health_score_history.sql`

**Interfaces:**
- Produces: table `health_score_history` with columns `id, ticker, fiscal_date, snapshot_date, score, grade, categories, created_at`, unique on `(ticker, fiscal_date)`. All later tasks read/write this table by name — no ORM layer, plain Supabase client calls.

- [ ] **Step 1: Write the migration**

```sql
-- Financial Health Score history — one row per ticker per fiscal quarter,
-- written when a new quarterly report is detected (not on every daily
-- recompute). Powers the trend badge + history chart on the Health Score
-- card. No backfill: history starts accumulating from when this ships.

CREATE TABLE IF NOT EXISTS health_score_history (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker        TEXT        NOT NULL,
  fiscal_date   TEXT        NOT NULL,        -- period identifier from income[0].fiscal_date; dedup key
  snapshot_date DATE        NOT NULL,        -- date we actually recorded this row
  score         SMALLINT    NOT NULL,
  grade         TEXT        NOT NULL,
  categories    JSONB       NOT NULL,        -- full HealthScore.categories breakdown, stored for a future per-category view
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ticker, fiscal_date)
);

CREATE INDEX IF NOT EXISTS idx_health_score_history_ticker
  ON health_score_history (ticker, snapshot_date DESC);

ALTER TABLE health_score_history ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read any ticker's history (matches how the
-- current-score route itself is gated — withAuth, no tier check)
CREATE POLICY "Authenticated users can read health score history"
  ON health_score_history FOR SELECT
  TO authenticated
  USING (true);

-- No client INSERT/UPDATE/DELETE — written only by service role
-- (the screener refresh cron and the per-ticker health-score route)
```

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP tool `mcp__claude_ai_Supabase__apply_migration` with:
- `project_id`: `kgqpzuvhslqazurfrqya`
- `name`: `078_health_score_history`
- `query`: the exact SQL from Step 1

- [ ] **Step 3: Verify the table exists**

Use `mcp__claude_ai_Supabase__execute_sql` with `project_id: kgqpzuvhslqazurfrqya` and query:

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'health_score_history' ORDER BY ordinal_position;
```

Expected: 8 rows (`id`, `ticker`, `fiscal_date`, `snapshot_date`, `score`, `grade`, `categories`, `created_at`) matching the migration.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/078_health_score_history.sql
git commit -m "feat(health-score): add health_score_history table"
git push origin preview
```

---

### Task 2: `recordHealthScoreSnapshot` helper

**Files:**
- Create: `lib/finance/health-score-history.ts`
- Create: `scripts/test-health-score-history.ts`

**Interfaces:**
- Consumes: `HealthScore` type from `lib/finance/health-score.ts` (already exists: `{ score, grade, label, summary, categories, metricSignals }`).
- Produces: `recordHealthScoreSnapshot(ticker: string, healthScore: HealthScore, fiscalDate: string | null | undefined): Promise<void>` — used by Task 3 and Task 4.

- [ ] **Step 1: Write the helper**

```ts
// lib/finance/health-score-history.ts
/**
 * Records a Financial Health Score snapshot for a ticker's fiscal quarter,
 * if one hasn't already been recorded for that exact quarter.
 *
 * Relies entirely on the `UNIQUE (ticker, fiscal_date)` constraint on
 * health_score_history + `ignoreDuplicates: true` — this makes the insert an
 * upsert-or-noop, so the two call sites (the daily screener cron and the
 * per-ticker health-score route) can both call this for the same
 * ticker/quarter without coordinating: whichever runs first wins, the other
 * silently no-ops. No pre-read/compare step needed.
 */

import { createServerClient } from '@/lib/supabase/client';
import type { HealthScore } from './health-score';

export async function recordHealthScoreSnapshot(
  ticker: string,
  healthScore: HealthScore,
  fiscalDate: string | null | undefined
): Promise<void> {
  if (!fiscalDate) return;

  const supabase = createServerClient();
  const { error } = await supabase
    .from('health_score_history')
    .upsert(
      {
        ticker,
        fiscal_date: fiscalDate,
        snapshot_date: new Date().toISOString().slice(0, 10),
        score: healthScore.score,
        grade: healthScore.grade,
        categories: healthScore.categories,
      },
      { onConflict: 'ticker,fiscal_date', ignoreDuplicates: true }
    );

  if (error) {
    console.warn(`[health-score-history] snapshot insert failed for ${ticker}:`, error.message);
  }
}
```

- [ ] **Step 2: Write the verification script**

```ts
// scripts/test-health-score-history.ts
// Verifies recordHealthScoreSnapshot: inserts a snapshot, inserts the same
// fiscal quarter again (must no-op, not duplicate), inserts a second distinct
// quarter (must add a new row), then prints + cleans up the test rows.

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';
import { recordHealthScoreSnapshot } from '../lib/finance/health-score-history';
import type { HealthScore } from '../lib/finance/health-score';

const TEST_TICKER = 'ZZZTEST';

function fakeScore(score: number, grade: HealthScore['grade']): HealthScore {
  return {
    score,
    grade,
    label: 'Test',
    summary: 'Test summary',
    categories: [
      { name: 'Profitability', score: score * 0.3, max: 30, label: 'Test' },
    ],
    metricSignals: {},
  };
}

async function main() {
  const supabase = createServerClient();

  // Clean slate
  await supabase.from('health_score_history').delete().eq('ticker', TEST_TICKER);

  console.log('1) Inserting Q1 snapshot (score 60)...');
  await recordHealthScoreSnapshot(TEST_TICKER, fakeScore(60, 'C'), '2026-03-31');

  console.log('2) Re-inserting the SAME Q1 quarter with a different score (80) — must NOT create a second row or overwrite...');
  await recordHealthScoreSnapshot(TEST_TICKER, fakeScore(80, 'B'), '2026-03-31');

  console.log('3) Inserting a distinct Q2 quarter (score 75)...');
  await recordHealthScoreSnapshot(TEST_TICKER, fakeScore(75, 'B'), '2026-06-30');

  const { data, error } = await supabase
    .from('health_score_history')
    .select('fiscal_date, snapshot_date, score, grade')
    .eq('ticker', TEST_TICKER)
    .order('fiscal_date', { ascending: true });

  if (error) {
    console.error('❌ Query failed:', error.message);
    process.exit(1);
  }

  console.log('\nRows for', TEST_TICKER, ':', JSON.stringify(data, null, 2));

  const pass = data?.length === 2 && data[0].score === 60 && data[1].score === 75;
  console.log(pass
    ? '\n✅ PASS — exactly 2 rows, first quarter kept its original score (80 did not overwrite 60).'
    : '\n❌ FAIL — expected exactly 2 rows with scores [60, 75].');

  // Clean up
  await supabase.from('health_score_history').delete().eq('ticker', TEST_TICKER);
  console.log('Cleaned up test rows.');

  process.exit(pass ? 0 : 1);
}

main();
```

- [ ] **Step 3: Run the verification script**

Run: `npx tsx scripts/test-health-score-history.ts`

Expected output ends with:
```
✅ PASS — exactly 2 rows, first quarter kept its original score (80 did not overwrite 60).
Cleaned up test rows.
```

If it prints ❌ FAIL, check that Task 1's migration applied correctly (the `UNIQUE (ticker, fiscal_date)` constraint is what makes step 2 a no-op).

- [ ] **Step 4: Lint**

Run: `npx eslint lib/finance/health-score-history.ts scripts/test-health-score-history.ts`
Expected: no errors (warnings for any pre-existing patterns are fine, but this is a new file so expect a clean pass).

- [ ] **Step 5: Commit**

```bash
git add lib/finance/health-score-history.ts scripts/test-health-score-history.ts
git commit -m "feat(health-score): add recordHealthScoreSnapshot helper"
git push origin preview
```

---

### Task 3: Wire snapshot recording into the daily screener cron

**Files:**
- Modify: `lib/market-data/screener-stats.ts:248` (right after the existing `computeHealthScore(...)` call inside `fetchAndUpsertScreenerStats`)

**Interfaces:**
- Consumes: `recordHealthScoreSnapshot` from Task 2 (`lib/finance/health-score-history.ts`).

- [ ] **Step 1: Add the import**

In `lib/market-data/screener-stats.ts`, after the existing `import { computeHealthScore } from '@/lib/finance/health-score';` line, add:

```ts
import { recordHealthScoreSnapshot } from '@/lib/finance/health-score-history';
```

- [ ] **Step 2: Call the helper after computing the score**

Find this existing block (inside the `for (const sym of group)` loop):

```ts
      const { income, balance, cashflow, degraded } = financialsMap.get(sym) ?? { income: [], balance: [], cashflow: [], degraded: false };
      if (degraded) degradedSymbols.add(sym);
      const healthScore = computeHealthScore(companyStats, income, balance, cashflow);
```

Add immediately after it:

```ts
      // Fire-and-forget: record a history snapshot only when we have complete,
      // non-degraded financials AND a real fiscal quarter identifier. The helper's
      // UNIQUE(ticker, fiscal_date) constraint makes this a no-op if this exact
      // quarter was already recorded (e.g. by yesterday's cron run, or by a user
      // visiting the stock page directly — see Task 4).
      if (!degraded && income[0]?.fiscal_date) {
        void recordHealthScoreSnapshot(sym, healthScore, income[0].fiscal_date);
      }
```

- [ ] **Step 3: Verify with a real single-symbol run**

This calls real TwelveData (~53 credits for one cold symbol; likely fewer if `market_data_cache` already has a warm entry for AAPL from prior work in this session).

Create a temporary one-off check — run this directly with `npx tsx -e`, or add and then delete a scratch script; either is fine since this is a one-time verification, not a permanent script:

```bash
npx tsx -e "
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
import('./lib/market-data/screener-stats').then(async (m) => {
  const rows = await m.fetchAndUpsertScreenerStats(['AAPL']);
  console.log('Screener rows:', rows.map(r => ({ ticker: r.ticker, health_score: r.health_score })));
});
"
```

Then check the history table via `mcp__claude_ai_Supabase__execute_sql` (`project_id: kgqpzuvhslqazurfrqya`):

```sql
SELECT ticker, fiscal_date, score, grade FROM health_score_history WHERE ticker = 'AAPL';
```

Expected: exactly 1 row for AAPL with a `fiscal_date` matching AAPL's most recent reported quarter, and `score` matching the `health_score` printed above.

- [ ] **Step 4: Lint**

Run: `npx eslint lib/market-data/screener-stats.ts`
Expected: no new errors (pre-existing warnings, if any, are unrelated to this change).

- [ ] **Step 5: Commit**

```bash
git add lib/market-data/screener-stats.ts
git commit -m "feat(health-score): record history snapshot from the daily screener cron"
git push origin preview
```

---

### Task 4: Wire snapshot recording into the per-ticker health-score route

**Files:**
- Modify: `app/api/stock/[ticker]/health-score/route.ts:76-91`

**Interfaces:**
- Consumes: `recordHealthScoreSnapshot` from Task 2.

- [ ] **Step 1: Add the import**

In `app/api/stock/[ticker]/health-score/route.ts`, after the existing `import { computeHealthScore } from '@/lib/finance/health-score';` line, add:

```ts
import { recordHealthScoreSnapshot } from '@/lib/finance/health-score-history';
```

- [ ] **Step 2: Call the helper alongside the existing screener_stats sync**

Find this existing block:

```ts
    const financialsDegraded = incomeDegraded || balanceDegraded || cashflowDegraded;
    if (!financialsDegraded) {
      void createServerClient()
        .from('screener_stats')
        .update({ health_score: healthScore.score, health_score_grade: healthScore.grade })
        .eq('ticker', symbol)
        .then(({ error }) => {
          if (error) console.warn('[health-score] screener_stats sync failed:', error.message);
        });
    }
```

Replace it with:

```ts
    const financialsDegraded = incomeDegraded || balanceDegraded || cashflowDegraded;
    if (!financialsDegraded) {
      void createServerClient()
        .from('screener_stats')
        .update({ health_score: healthScore.score, health_score_grade: healthScore.grade })
        .eq('ticker', symbol)
        .then(({ error }) => {
          if (error) console.warn('[health-score] screener_stats sync failed:', error.message);
        });

      // Safety net for tickers outside the screener's tracked universe (e.g. a
      // long-tail holding) — the daily cron (Task 3) covers the tracked universe;
      // this covers any ticker a user actually views. Same UNIQUE(ticker,
      // fiscal_date) no-op behavior means this can't double-record what the cron
      // already caught.
      void recordHealthScoreSnapshot(symbol, healthScore, income[0]?.fiscal_date);
    }
```

- [ ] **Step 3: Verify with the dev server**

Run: `npm run dev` (background)

Then: `curl -s http://localhost:3000/api/stock/MSFT/health-score -H "Cookie: <a valid session cookie>"` — since this route uses `withAuth`, an unauthenticated curl will get a 401. If no session cookie is easily available, instead verify via the browser: navigate to `http://localhost:3000/stock/MSFT` while logged in, which triggers the same route.

Then check via `mcp__claude_ai_Supabase__execute_sql`:

```sql
SELECT ticker, fiscal_date, score, grade FROM health_score_history WHERE ticker = 'MSFT';
```

Expected: exactly 1 row for MSFT.

- [ ] **Step 4: Lint**

Run: `npx eslint app/api/stock/[ticker]/health-score/route.ts`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add "app/api/stock/[ticker]/health-score/route.ts"
git commit -m "feat(health-score): record history snapshot from the per-ticker route"
git push origin preview
```

---

### Task 5: History API route

**Files:**
- Create: `app/api/stock/[ticker]/health-score/history/route.ts`

**Interfaces:**
- Produces: `GET /api/stock/[ticker]/health-score/history` → `{ success: true, data: Array<{ fiscalDate: string; snapshotDate: string; score: number; grade: string }> }`, ascending by `snapshotDate`. Consumed by Task 6.

- [ ] **Step 1: Write the route**

```ts
// app/api/stock/[ticker]/health-score/history/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';

interface HealthScoreHistoryRow {
  fiscal_date: string;
  snapshot_date: string;
  score: number;
  grade: string;
}

async function handler(
  _request: NextRequest,
  context: { params: Promise<{ ticker: string }> },
  _session: { userId: string }
): Promise<NextResponse> {
  const { ticker } = await context.params;
  const symbol = ticker.toUpperCase();

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('health_score_history')
      .select('fiscal_date, snapshot_date, score, grade')
      .eq('ticker', symbol)
      .order('snapshot_date', { ascending: true });

    if (error) throw new Error(error.message);

    const rows = (data ?? []) as HealthScoreHistoryRow[];

    return addSecurityHeaders(
      NextResponse.json(
        {
          success: true,
          data: rows.map((r) => ({
            fiscalDate: r.fiscal_date,
            snapshotDate: r.snapshot_date,
            score: r.score,
            grade: r.grade,
          })),
        },
        { headers: { 'Cache-Control': 'private, max-age=3600' } }
      )
    );
  } catch (err) {
    console.error(`[health-score-history] Error for ${symbol}:`, err);
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to fetch health score history' }, { status: 500 })
    );
  }
}

export const GET = withRateLimit(withAuth(handler), { windowMs: 60 * 1000, maxRequests: 30 });
```

- [ ] **Step 2: Verify with the dev server**

Run: `npm run dev` (background, if not already running from Task 4)

In the browser (logged in), navigate to `http://localhost:3000/api/stock/AAPL/health-score/history` (or `MSFT`, whichever has a row from Task 3/4's verification).

Expected JSON:
```json
{ "success": true, "data": [ { "fiscalDate": "...", "snapshotDate": "...", "score": ..., "grade": "..." } ] }
```

- [ ] **Step 3: Lint**

Run: `npx eslint "app/api/stock/[ticker]/health-score/history/route.ts"`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/api/stock/[ticker]/health-score/history/route.ts"
git commit -m "feat(health-score): add GET /health-score/history route"
git push origin preview
```

---

### Task 6: Trend badge + history modal on the Health Score card

**Files:**
- Create: `components/stock/HealthScoreHistoryModal.tsx`
- Modify: `components/stock/HealthScoreCard.tsx`

**Interfaces:**
- Consumes: `GET /api/stock/[ticker]/health-score/history` from Task 5.
- Produces: `HealthScoreHistoryModal` component, exported `HealthScoreHistoryPoint` type — both used only within `HealthScoreCard.tsx`, no other consumers.

- [ ] **Step 1: Write the modal component**

```tsx
// components/stock/HealthScoreHistoryModal.tsx
'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface HealthScoreHistoryPoint {
  fiscalDate: string;
  snapshotDate: string;
  score: number;
  grade: string;
}

interface Props {
  ticker: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  history: HealthScoreHistoryPoint[];
}

function formatQuarterLabel(fiscalDate: string): string {
  const d = new Date(fiscalDate);
  if (Number.isNaN(d.getTime())) return fiscalDate;
  const quarter = Math.floor(d.getMonth() / 3) + 1;
  return `Q${quarter} '${String(d.getFullYear()).slice(2)}`;
}

function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function HealthScoreHistoryModal({ ticker, open, onOpenChange, history }: Props) {
  const chartData = history.map((h) => ({ ...h, label: formatQuarterLabel(h.fiscalDate) }));
  const listNewestFirst = [...history].reverse();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{ticker} — Financial Health History</DialogTitle>
        </DialogHeader>

        {history.length < 2 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            We just started tracking history for this company — check back after the next earnings report.
          </p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <YAxis domain={[0, 100]} hide />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#71717a', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  dy={6}
                />
                <ReferenceLine y={70} stroke="#71717a" strokeDasharray="3 3" strokeOpacity={0.3} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const pt = payload[0].payload as (typeof chartData)[number];
                    return (
                      <div className="rounded-lg border border-border bg-background/95 px-3 py-2 shadow-lg backdrop-blur-sm text-xs space-y-0.5">
                        <p className="font-semibold text-foreground">{pt.score}/100 · {pt.grade}</p>
                        <p className="text-muted-foreground">{formatFullDate(pt.snapshotDate)}</p>
                      </div>
                    );
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#10b981', strokeWidth: 0 }}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>

            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {listNewestFirst.map((pt, i) => {
                const prev = listNewestFirst[i + 1];
                const delta = prev ? pt.score - prev.score : null;
                return (
                  <div
                    key={pt.fiscalDate}
                    className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-border/40 last:border-0"
                  >
                    <span className="text-muted-foreground">{formatFullDate(pt.snapshotDate)}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground tabular-nums">{pt.score}/100</span>
                      <span className="text-muted-foreground">{pt.grade}</span>
                      {delta !== null && delta !== 0 && (
                        <span className={cn(
                          'flex items-center gap-0.5 font-medium tabular-nums',
                          delta > 0 ? 'text-emerald-500' : 'text-red-500'
                        )}>
                          {delta > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                          {Math.abs(delta)}
                        </span>
                      )}
                      {delta === 0 && (
                        <span className="flex items-center text-muted-foreground/50">
                          <Minus className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire the trend badge + modal into HealthScoreCard**

In `components/stock/HealthScoreCard.tsx`, update the imports at the top — change:

```tsx
import { HelpCircle, X, Sparkles } from 'lucide-react';
```

to:

```tsx
import { HelpCircle, X, Sparkles, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
```

and after the existing `import { HealthRing } from '@/components/finance/HealthRing';` line, add:

```tsx
import { HealthScoreHistoryModal, type HealthScoreHistoryPoint } from '@/components/stock/HealthScoreHistoryModal';
```

Then find this existing block near the top of the component:

```tsx
interface HealthScoreResponse {
  success: boolean;
  data?: HealthScore;
  error?: string;
}
```

Add right after it:

```tsx
interface HealthScoreHistoryResponse {
  success: boolean;
  data?: HealthScoreHistoryPoint[];
  error?: string;
}
```

Then find this existing block inside the component function:

```tsx
  const { data, isLoading } = useQuery<HealthScoreResponse>({
    queryKey: ['health-score', ticker],
    queryFn: async () => {
      const res = await fetch(`/api/stock/${ticker}/health-score`);
      return res.json();
    },
    enabled: !!ticker,
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
```

Add right after it:

```tsx
  const { data: historyData } = useQuery<HealthScoreHistoryResponse>({
    queryKey: ['health-score-history', ticker],
    queryFn: async () => {
      const res = await fetch(`/api/stock/${ticker}/health-score/history`);
      return res.json();
    },
    enabled: !!ticker,
    staleTime: 60 * 60 * 1000,
    gcTime: 120 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const history = historyData?.success ? historyData.data ?? [] : [];
  const trend = history.length >= 2
    ? history[history.length - 1].score - history[history.length - 2].score
    : null;

  const [historyOpen, setHistoryOpen] = useState(false);
```

Then find this existing header block:

```tsx
          {/* Rendered outside card via fixed positioning so it's never clipped */}
          {showMethodology && (
            <MethodologyPopover
              onClose={() => setShowMethodology(false)}
              anchorRect={anchorRect}
            />
          )}
          <span className={cn(
            'text-xs font-semibold px-2.5 py-0.5 rounded-full border',
            gradeBadgeClass(hs.grade)
          )}>
            {hs.label}
          </span>
```

Replace it with:

```tsx
          {/* Rendered outside card via fixed positioning so it's never clipped */}
          {showMethodology && (
            <MethodologyPopover
              onClose={() => setShowMethodology(false)}
              anchorRect={anchorRect}
            />
          )}
          <div className="flex items-center gap-2">
            {trend !== null && (
              <button
                onClick={() => setHistoryOpen(true)}
                className={cn(
                  'flex items-center gap-0.5 text-xs font-semibold tabular-nums hover:opacity-80 transition-opacity',
                  trend > 0 ? 'text-emerald-500' : trend < 0 ? 'text-red-500' : 'text-muted-foreground'
                )}
                aria-label="View financial health score history"
              >
                {trend > 0 ? <ArrowUpRight className="h-3 w-3" /> : trend < 0 ? <ArrowDownRight className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                {Math.abs(trend)}
              </button>
            )}
            <span className={cn(
              'text-xs font-semibold px-2.5 py-0.5 rounded-full border',
              gradeBadgeClass(hs.grade)
            )}>
              {hs.label}
            </span>
          </div>
```

Finally, find the component's closing tags:

```tsx
      </CardContent>
    </Card>
  );
}
```

Replace with:

```tsx
      </CardContent>

      <HealthScoreHistoryModal
        ticker={ticker}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        history={history}
      />
    </Card>
  );
}
```

- [ ] **Step 3: Verify in the browser**

After Tasks 3–4's verification, AAPL has exactly 1 real history row (one fiscal quarter) — not enough to show a trend, since the badge needs ≥2. Insert one temporary second row so the UI can be verified end-to-end, via `mcp__claude_ai_Supabase__execute_sql` (`project_id: kgqpzuvhslqazurfrqya`):

```sql
INSERT INTO health_score_history (ticker, fiscal_date, snapshot_date, score, grade, categories)
SELECT ticker, '1999-01-01', '2025-01-01', GREATEST(score - 8, 0), grade, categories
FROM health_score_history WHERE ticker = 'AAPL' ORDER BY fiscal_date DESC LIMIT 1;
```

This clones AAPL's real row as a fabricated earlier quarter with a lower score, so the trend badge has something to compute a positive delta from.

Run: `npm run dev` (if not already running)

Use Playwright (or manual browser) to:
1. Navigate to `http://localhost:3000/stock/AAPL`.
2. Confirm the trend badge (colored arrow + number) renders next to the grade badge in the Financial Health card header, and the number matches `real_score - (real_score - 8)` i.e. `8`.
3. Click the badge — confirm the modal opens showing the line chart (2 points) and the per-quarter list (2 rows, newest first, with a `+8` delta on the newer row).
4. Click outside the modal or the X — confirm it closes.
5. Take a screenshot of both the card (with badge) and the open modal.

Then delete the fabricated row (leave only the real one from Task 3):

```sql
DELETE FROM health_score_history WHERE ticker = 'AAPL' AND fiscal_date = '1999-01-01';
```

- [ ] **Step 4: Lint**

Run: `npx eslint components/stock/HealthScoreHistoryModal.tsx components/stock/HealthScoreCard.tsx`
Expected: no new errors.

- [ ] **Step 5: Full repo lint**

Run: `npm run lint`
Expected: 0 errors (same warning count as before this plan started, or fewer — no new warnings introduced).

- [ ] **Step 6: Commit**

```bash
git add components/stock/HealthScoreHistoryModal.tsx components/stock/HealthScoreCard.tsx
git commit -m "feat(health-score): add trend badge and history modal to Health Score card"
git push origin preview
```

---

## Self-Review Notes

**Spec coverage:** Schema (Task 1) ✓, snapshot-trigger data flow via both call sites (Tasks 3–4) ✓, idempotent dedup helper (Task 2) ✓, API route (Task 5) ✓, trend badge + modal UI, empty state, free access (Task 6 — no gating code added anywhere) ✓. Backfill and per-category breakdown UI are explicitly out of scope per the spec and no task builds them.

**Type consistency:** `HealthScoreHistoryPoint` (Task 6) matches the exact shape returned by the Task 5 route (`fiscalDate, snapshotDate, score, grade`). `recordHealthScoreSnapshot`'s signature (Task 2) is called identically in Task 3 (`recordHealthScoreSnapshot(sym, healthScore, income[0].fiscal_date)`) and Task 4 (`recordHealthScoreSnapshot(symbol, healthScore, income[0]?.fiscal_date)`) — both pass `(ticker: string, healthScore: HealthScore, fiscalDate: string | undefined)`, matching the helper's declared parameter types.
