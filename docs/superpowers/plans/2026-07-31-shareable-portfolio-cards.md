# Shareable Portfolio Performance Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user share today's portfolio performance as a link that unfurls as a rich image card, landing a logged-out visitor on a focused signup page — with basic attribution so we know whether a share produced a signup.

**Architecture:** One additive Supabase table (`portfolio_shares`) storing an immutable snapshot (percent, optional $, a downsampled sparkline). Three new routes: `POST /api/shares` (create the snapshot), `GET /api/og/share/[id]` (the rendered image via `next/og`), `GET /share/[id]` (the public landing page). Attribution is a first-touch cookie set by middleware and read by the two existing client-side auth entry points — no changes to the `handle_new_user` DB trigger.

**Tech Stack:** Next.js 16 App Router, `next/og` (`ImageResponse`), Supabase (Postgres + RLS), TanStack Query, existing TwelveData candle client.

## Global Constraints

- Dollar amounts are **never** shown unless the sharer explicitly opts in per-share (`includeAmount`) — default is percent-only.
- The share row is a **frozen snapshot** — `pct`/`pnl_usd`/`sparkline` never recompute after creation.
- The `bp_ref` attribution cookie is **not** `httpOnly` — both client-side auth paths (`signUp()`, the OAuth callback page) need to read it with `document.cookie`, and there's no monetary/access stake in it (no rewards system).
- No new toast/notification component. "Copied" feedback is a button-label swap.
- `next/og`'s `ImageResponse` runs on the **Node runtime**, not edge (this project's standing guidance: Edge is inferior in nearly every case now that Fluid Compute exists).
- Share IDs are short, random, **non-enumerable** (crypto-random, not sequential) — generated in-app, not via Postgres `gen_random_uuid()` (which would produce a much longer, uglier URL).
- Migrations are applied immediately via `mcp__claude_ai_Supabase__apply_migration` (project `kgqpzuvhslqazurfrqya`), per this repo's CLAUDE.md — never left for the user to run manually.

---

## File Map

| File | Role |
|---|---|
| `supabase/migrations/100_portfolio_shares.sql` | New table + RLS + signup-count RPC |
| `lib/holdings/today-sparkline.ts` | Pure computation + cache-aware candle fetch for "today's" portfolio curve |
| `lib/shares/generate-share-id.ts` | Short random slug generator |
| `lib/shares/get-share.ts` | Service-role lookup of one share row, shared by both public routes |
| `app/api/shares/route.ts` | `POST` — creates the snapshot |
| `app/api/og/share/[id]/route.tsx` | `GET` — renders the image |
| `app/share/[id]/page.tsx` | Public landing page + `generateMetadata` |
| `middleware.ts` (modify) | Sets the `bp_ref` first-touch cookie on `/share/[id]` |
| `lib/auth/share-attribution.ts` | Cookie read + the settings write + RPC call |
| `lib/auth/auth.ts` (modify) | Calls attribution claim in `signUp()` and `signIn()` |
| `app/auth/callback/page.tsx` (modify) | Calls attribution claim after OAuth session lands |
| `components/holdings/ShareSheet.tsx` | Preview, toggles, share/copy action |
| `components/holdings/PortfolioDashboard.tsx` (modify) | Adds the share icon button |

---

### Task 1: Migration — `portfolio_shares` table

**Files:**
- Create: `supabase/migrations/100_portfolio_shares.sql`

**Interfaces:**
- Produces: table `public.portfolio_shares` (columns below), RPC `public.increment_share_signup_count(share_id text)`.

- [ ] **Step 1: Write the migration**

```sql
-- 100_portfolio_shares.sql
-- Shareable portfolio-performance cards: an immutable snapshot of "today's"
-- gain, created when a user clicks Share. Never recomputed after insert —
-- the link should show the same thing next week that it showed today, the
-- same guarantee a screenshot gives.

CREATE TABLE public.portfolio_shares (
  id             TEXT PRIMARY KEY,
  user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Snapshotted alongside pct/pnl_usd/sparkline, same reasoning: must survive
  -- the account being renamed OR deleted later without the card silently
  -- changing or breaking. NULL whenever `anonymous` is true (never captured).
  username       TEXT,
  date           DATE NOT NULL,
  pct            NUMERIC NOT NULL,
  pnl_usd        NUMERIC,
  currency       TEXT NOT NULL DEFAULT 'USD',
  sparkline      JSONB NOT NULL,
  anonymous      BOOLEAN NOT NULL DEFAULT FALSE,
  signup_count   INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_portfolio_shares_user ON public.portfolio_shares (user_id, created_at DESC);

ALTER TABLE public.portfolio_shares ENABLE ROW LEVEL SECURITY;

-- Owners can create and browse their own share history. The public /share/[id]
-- page and OG image route do NOT go through these policies — they read via a
-- service-role client (lib/shares/get-share.ts), since a logged-out visitor
-- has no auth.uid() at all.
CREATE POLICY "Users create their own shares"
  ON public.portfolio_shares FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users view their own shares"
  ON public.portfolio_shares FOR SELECT
  USING (auth.uid() = user_id);

-- SECURITY DEFINER: a brand-new signup crediting a share is never that share's
-- owner, so this has to bypass the owner-only RLS above. Scoped to exactly one
-- counter on one row — no broader access than that.
CREATE OR REPLACE FUNCTION public.increment_share_signup_count(share_id TEXT)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.portfolio_shares SET signup_count = signup_count + 1 WHERE id = share_id;
$$;
```

- [ ] **Step 2: Apply the migration**

Apply via `mcp__claude_ai_Supabase__apply_migration` against project `kgqpzuvhslqazurfrqya` (per this repo's CLAUDE.md — never left for manual application). If it fails, fix the SQL in the file and re-apply.

- [ ] **Step 3: Verify**

Via `mcp__claude_ai_Supabase__list_tables`, confirm `portfolio_shares` exists with RLS enabled, and confirm `increment_share_signup_count` appears as a function (e.g. via `execute_sql` running `select proname from pg_proc where proname = 'increment_share_signup_count';`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/100_portfolio_shares.sql
git commit -m "feat: add portfolio_shares table for shareable performance cards"
```

---

### Task 2: Today's-sparkline computation

**Files:**
- Create: `lib/holdings/today-sparkline.ts`
- Test: `scratch script run via tsx, per this repo's convention (no test framework — see CLAUDE.md)`

**Interfaces:**
- Consumes: `getStockCandles(symbol, from, to, resolution, options)` and `StockCandles` from `@/lib/twelvedata/twelvedata-client`; `withRateLimitRetry`, `TwelveDataRateLimitError` from the same module; `rget`, `rset`, `candleTtlSeconds` from `@/lib/cache/redis-cache`; `todayET` from `@/lib/dates/calendar-format`.
- Produces: `computeTodaySparkline(holdings, candlesBySymbol): TodaySparklineResult | null`, `getTodayCandlesForSymbol(symbol): Promise<CandleData | null>`, types `SparklineHolding`, `CandleData`, `TodaySparklineResult`.

This mirrors the proven reconstruction technique already used for the portfolio sparkline in `components/discover/PortfolioSummaryWidget.tsx`'s `usePortfolioSparkline` (1-week version) — same math, adapted to a plain server-side function instead of a React hook, and to "today" (1D) instead of "this week" (1W).

- [ ] **Step 1: Write the pure computation with an inline check script**

```typescript
// lib/holdings/today-sparkline.ts
import { getStockCandles, withRateLimitRetry, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { rget, rset, candleTtlSeconds } from '@/lib/cache/redis-cache';
import { todayET } from '@/lib/dates/calendar-format';

export interface CandleData {
  t: number[];
  c: number[];
}

export interface SparklineHolding {
  symbol: string;
  avgPrice: number;
  quantity: number;
  /** Unix ms — date_purchased ?? created_at, whichever the holding row has. */
  startMs: number;
}

export interface TodaySparklineResult {
  /** Downsampled to ~32 points — the sparkline's y-values, ascending by time. */
  points: number[];
  /** Percent change of the whole portfolio today, from the same series (last point). */
  pct: number;
  /** USD change of the whole portfolio today. */
  pnlUsd: number;
}

const MAX_SPARKLINE_POINTS = 32;

function downsample(points: number[], maxPoints: number): number[] {
  if (points.length <= maxPoints) return points;
  const step = (points.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, i) => points[Math.round(i * step)]);
}

/**
 * Reconstructs today's portfolio P/L curve from each holding's 1D candles.
 * Returns null when there's nothing to show yet (no candles for any symbol,
 * or the reconstructed basis is zero) — the caller treats that as "share
 * button disabled," never as a fabricated 0%.
 */
export function computeTodaySparkline(
  holdings: SparklineHolding[],
  candlesBySymbol: Record<string, CandleData | null>
): TodaySparklineResult | null {
  const dollarPlByTime = new Map<number, number>();
  const basisByTime = new Map<number, number>();
  let sawAnyCandles = false;

  for (const h of holdings) {
    const candles = candlesBySymbol[h.symbol];
    if (!candles || candles.t.length === 0) continue;
    sawAnyCandles = true;

    const { t, c } = candles;
    const periodStartMs = t[0] * 1000;
    // Position opened after today's window started (rare for "today," but
    // matches the same rule PortfolioSummaryWidget's weekly version uses):
    // baseline off the actual purchase price, not today's opening tick.
    const boughtDuringPeriod = h.startMs > periodStartMs;
    const basePrice = boughtDuringPeriod ? h.avgPrice : c[0];

    for (let i = 0; i < t.length; i++) {
      if (t[i] * 1000 < h.startMs) continue;
      dollarPlByTime.set(t[i], (dollarPlByTime.get(t[i]) ?? 0) + (c[i] - basePrice) * h.quantity);
      basisByTime.set(t[i], (basisByTime.get(t[i]) ?? 0) + basePrice * h.quantity);
    }
  }

  if (!sawAnyCandles) return null;

  const sortedTimes = Array.from(dollarPlByTime.keys()).sort((a, b) => a - b);
  const rawPoints = sortedTimes.map((t) => {
    const basis = basisByTime.get(t) ?? 0;
    return basis > 0 ? ((dollarPlByTime.get(t) ?? 0) / basis) * 100 : 0;
  });

  const lastTime = sortedTimes[sortedTimes.length - 1];
  const finalDollarPl = dollarPlByTime.get(lastTime) ?? 0;
  const finalBasis = basisByTime.get(lastTime) ?? 0;
  if (finalBasis <= 0) return null;

  return {
    points: downsample(rawPoints, MAX_SPARKLINE_POINTS),
    pct: (finalDollarPl / finalBasis) * 100,
    pnlUsd: finalDollarPl,
  };
}

/**
 * Today's 1D candles for one symbol, US-equities-only (crypto/24h assets are
 * out of scope for this first slice — see spec Non-goals). Reads/writes the
 * SAME Redis key the existing `/api/stock/[ticker]/candles?range=1D` route
 * uses, so a user who just looked at their Holdings page (where the Share
 * button lives) gets a free cache hit here instead of a second TwelveData
 * call for the same data.
 *
 * Deliberately does NOT walk backward across days on a miss (unlike the
 * candles route's chart-continuity fallback) — a share card's entire point is
 * "today's" number, so no data for today means "nothing to share yet," not
 * "silently substitute yesterday and call it today."
 */
export async function getTodayCandlesForSymbol(symbol: string): Promise<CandleData | null> {
  const dateET = todayET();
  const rKey = `candles:1D:${symbol}:${dateET}`;

  const cached = await rget<{ candles?: CandleData | null }>(rKey);
  if (cached?.candles) return cached.candles;

  const now = Math.floor(Date.now() / 1000);
  const from = now - 24 * 60 * 60;

  try {
    const result = await withRateLimitRetry(() =>
      getStockCandles(symbol, from, now, '1', {
        extendedHours: true,
        startDate: `${dateET} 04:00:00`,
        endDate: `${dateET} 23:59:00`,
      })
    );
    if (result.s === 'no_data' || result.t.length === 0) return null;

    const candles: CandleData = { t: result.t, c: result.c };
    void rset(rKey, { candles }, candleTtlSeconds());
    return candles;
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) return null;
    throw err;
  }
}
```

- [ ] **Step 2: Write and run an inline verification script**

Create a temporary scratch file (per this repo's convention of `tsx`-run scripts, no test framework — see CLAUDE.md) to check the pure function with fixed data, no network:

```typescript
// scratchpad check — not committed
import { computeTodaySparkline } from './lib/holdings/today-sparkline';

const result = computeTodaySparkline(
  [{ symbol: 'AAPL', avgPrice: 100, quantity: 10, startMs: Date.parse('2020-01-01') }],
  { AAPL: { t: [1000, 1060, 1120], c: [100, 102, 105] } }
);
console.log(result);
// Expect: pct = 5, pnlUsd = 50, points.length = 3 (under the 32-point downsample threshold)
if (!result || result.pct !== 5 || result.pnlUsd !== 50) throw new Error('computeTodaySparkline mismatch');

const noBasis = computeTodaySparkline([], {});
if (noBasis !== null) throw new Error('expected null with no holdings');

console.log('today-sparkline checks passed');
```

Run: `npx tsx <scratch-file-path>`
Expected: logs the result object, then `today-sparkline checks passed`, no thrown error.

- [ ] **Step 3: Delete the scratch file** (it was only for manual verification, not a committed test)

- [ ] **Step 4: Commit**

```bash
git add lib/holdings/today-sparkline.ts
git commit -m "feat: add today's-portfolio-sparkline computation for share cards"
```

---

### Task 3: Share ID generator

**Files:**
- Create: `lib/shares/generate-share-id.ts`

**Interfaces:**
- Produces: `generateShareId(): string`

- [ ] **Step 1: Write it**

```typescript
// lib/shares/generate-share-id.ts
import { randomBytes } from 'crypto';

/**
 * An 8-character URL-safe, cryptographically random slug for a share link
 * (e.g. "xK3mQ2Fh") — not sequential, so shares can't be enumerated by
 * incrementing an ID. 6 random bytes / base64url gives ~2.8×10^14 possible
 * values; collision risk against a share table is negligible even at scale
 * (birthday-bound collisions only become non-trivial in the billions of rows).
 */
export function generateShareId(): string {
  return randomBytes(6).toString('base64url');
}
```

- [ ] **Step 2: Verify uniqueness shape with a quick script**

```typescript
import { generateShareId } from './lib/shares/generate-share-id';
const ids = new Set(Array.from({ length: 10_000 }, () => generateShareId()));
if (ids.size !== 10_000) throw new Error('unexpected collision in 10k samples');
for (const id of ids) {
  if (!/^[A-Za-z0-9_-]{8}$/.test(id)) throw new Error(`not URL-safe/8-char: ${id}`);
}
console.log('generate-share-id checks passed');
```

Run: `npx tsx <scratch-file-path>`
Expected: `generate-share-id checks passed`, no thrown error. Delete the scratch file after.

- [ ] **Step 3: Commit**

```bash
git add lib/shares/generate-share-id.ts
git commit -m "feat: add share ID generator"
```

---

### Task 4: Share lookup helper

**Files:**
- Create: `lib/shares/get-share.ts`

**Interfaces:**
- Consumes: `createServerClient` from `@/lib/supabase/client`.
- Produces: `getShareById(id: string): Promise<PortfolioShare | null>`, type `PortfolioShare`.

Shared by both public routes (the OG image and the landing page) so the "look up a share row" query exists in exactly one place.

- [ ] **Step 1: Write it**

```typescript
// lib/shares/get-share.ts
import { createServerClient } from '@/lib/supabase/client';

export interface PortfolioShare {
  id: string;
  user_id: string | null;
  /** Snapshotted at share time — null when anonymous, independent of whether
   *  the account still exists or has since been renamed. */
  username: string | null;
  date: string;
  pct: number;
  pnl_usd: number | null;
  currency: string;
  sparkline: number[];
  anonymous: boolean;
  signup_count: number;
  created_at: string;
}

/**
 * Service-role lookup — used by the two PUBLIC routes (/share/[id],
 * /api/og/share/[id]). A logged-out visitor has no auth.uid(), so this
 * deliberately bypasses the owner-only RLS policies on portfolio_shares
 * rather than trying to route a service-role read through them.
 */
export async function getShareById(id: string): Promise<PortfolioShare | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('portfolio_shares')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return data as PortfolioShare;
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "get-share"`
Expected: no output (no errors referencing this file).

- [ ] **Step 3: Commit**

```bash
git add lib/shares/get-share.ts
git commit -m "feat: add shared portfolio_shares lookup helper"
```

---

### Task 5: `POST /api/shares`

**Files:**
- Create: `app/api/shares/route.ts`

**Interfaces:**
- Consumes: `withAuth`, `addSecurityHeaders` from `@/lib/security/api-security`; `createServerClient` from `@/lib/supabase/client`; `computeTodaySparkline`, `getTodayCandlesForSymbol`, `SparklineHolding` from `@/lib/holdings/today-sparkline` (Task 2); `generateShareId` from `@/lib/shares/generate-share-id` (Task 3).
- Produces: `POST` handler returning `{ success: true, id, url }` or `{ success: false, error }`.

- [ ] **Step 1: Write the route**

```typescript
// app/api/shares/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { computeTodaySparkline, getTodayCandlesForSymbol, type SparklineHolding, type CandleData } from '@/lib/holdings/today-sparkline';
import { generateShareId } from '@/lib/shares/generate-share-id';

interface CreateShareBody {
  includeAmount?: boolean;
  anonymous?: boolean;
}

interface HoldingRow {
  symbol: string;
  avg_price: number | null;
  quantity: number | null;
  date_purchased: string | null;
  created_at: string;
}

async function handler(
  request: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as CreateShareBody;
  const includeAmount = body.includeAmount === true;
  const anonymous = body.anonymous === true;

  const supabase = createServerClient();
  const { data: holdingRows } = await supabase
    .from('user_holdings')
    .select('symbol, avg_price, quantity, date_purchased, created_at')
    .eq('user_id', session.userId);

  // Snapshotted onto the row below (not joined live at render time) — same
  // "frozen, independent of what happens to the account later" reasoning as
  // pct/pnl_usd/sparkline. Never fetched at all when anonymous is true.
  let username: string | null = null;
  if (!anonymous) {
    const { data: userRow } = await supabase
      .from('users')
      .select('username')
      .eq('id', session.userId)
      .single();
    username = userRow?.username ?? null;
  }

  const eligible: SparklineHolding[] = ((holdingRows ?? []) as HoldingRow[])
    .filter((h) => h.avg_price != null && (h.quantity ?? 0) > 0)
    .map((h) => ({
      symbol: h.symbol.toUpperCase(),
      avgPrice: h.avg_price as number,
      quantity: h.quantity as number,
      startMs: new Date(h.date_purchased ?? h.created_at).getTime(),
    }));

  if (eligible.length === 0) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'no_holdings' }, { status: 200 })
    );
  }

  const candleResults = await Promise.all(
    eligible.map(async (h) => ({ symbol: h.symbol, candles: await getTodayCandlesForSymbol(h.symbol) }))
  );
  const candlesBySymbol: Record<string, CandleData | null> = {};
  for (const { symbol, candles } of candleResults) candlesBySymbol[symbol] = candles;

  const result = computeTodaySparkline(eligible, candlesBySymbol);
  if (!result) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'no_data_yet' }, { status: 200 })
    );
  }

  // Retry once on the astronomically-rare slug collision (unique violation).
  for (let attempt = 0; attempt < 2; attempt++) {
    const id = generateShareId();
    const { error } = await supabase.from('portfolio_shares').insert({
      id,
      user_id: session.userId,
      username,
      date: new Date().toISOString().slice(0, 10),
      pct: result.pct,
      pnl_usd: includeAmount ? result.pnlUsd : null,
      currency: 'USD',
      sparkline: result.points,
      anonymous,
    });

    if (!error) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
      return addSecurityHeaders(
        NextResponse.json({ success: true, id, url: `${appUrl}/share/${id}` })
      );
    }
    if (error.code !== '23505') {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'insert_failed' }, { status: 500 })
      );
    }
    // 23505 = unique_violation — loop and try a fresh id.
  }

  return addSecurityHeaders(
    NextResponse.json({ success: false, error: 'insert_failed' }, { status: 500 })
  );
}

export const POST = withAuth(handler, { rateLimit: { windowMs: 60 * 60 * 1000, maxRequests: 10 } });
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "api/shares"`
Expected: no output.

- [ ] **Step 3: Manual verification against the running dev server**

Start `npm run dev`, sign in as a test account with at least one holding, then from the browser console on any authenticated page:

```javascript
fetch('/api/shares', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
  .then(r => r.json()).then(console.log);
```

Expected: `{ success: true, id: "<8 chars>", url: "http://localhost:3000/share/<id>" }`. Confirm the row exists via `mcp__claude_ai_Supabase__execute_sql`: `select * from portfolio_shares order by created_at desc limit 1;`.

- [ ] **Step 4: Commit**

```bash
git add app/api/shares/route.ts
git commit -m "feat: add POST /api/shares to snapshot today's portfolio performance"
```

---

### Task 6: `GET /api/og/share/[id]` — the rendered image

**Files:**
- Create: `app/api/og/share/[id]/route.tsx`

**Interfaces:**
- Consumes: `getShareById` from `@/lib/shares/get-share` (Task 4).
- Produces: `GET` handler returning a PNG (`ImageResponse`) or a 404 `NextResponse`.

- [ ] **Step 1: Write the route**

```tsx
// app/api/og/share/[id]/route.tsx
import { ImageResponse } from 'next/og';
import { NextRequest, NextResponse } from 'next/server';
import { getShareById } from '@/lib/shares/get-share';
import { formatCurrency, type CurrencyCode } from '@/lib/currency/currency-conversion';

export const runtime = 'nodejs';

const WIDTH = 1200;
const HEIGHT = 630;

// Fetched once per cold start, reused across warm invocations — avoids
// re-fetching the same font bytes on every image render.
let cachedFontData: ArrayBuffer | null = null;

async function loadNumeralsFont(): Promise<ArrayBuffer> {
  if (cachedFontData) return cachedFontData;
  const cssUrl = 'https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@600&text=' +
    encodeURIComponent('+-.0123456789%');
  const css = await (await fetch(cssUrl)).text();
  const match = css.match(/src: url\(([^)]+)\)/);
  if (!match) throw new Error('Google Fonts CSS did not contain a src url()');
  const fontRes = await fetch(match[1]);
  cachedFontData = await fontRes.arrayBuffer();
  return cachedFontData;
}

function sparklinePoints(values: number[], width: number, height: number): string {
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;
  const share = await getShareById(id);
  if (!share) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const positive = share.pct >= 0;
  const color = positive ? '#34d399' : '#f87171';
  // share.username is the snapshot taken at creation time (Task 5) — never a
  // live lookup, and never present at all when the share was made anonymous.
  const handle = !share.anonymous && share.username ? `@${share.username}` : 'A BullPen investor';
  const pctLabel = `${positive ? '+' : ''}${share.pct.toFixed(2)}%`;
  const dateLabel = new Date(share.date + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
  const points = sparklinePoints(share.sparkline, 260, 60);
  // Percent-only unless the sharer explicitly opted in per-share (Task 10's
  // "Include dollar amount" toggle) — pnl_usd is null whenever they didn't.
  const amountLabel = share.pnl_usd != null
    ? `${share.pnl_usd >= 0 ? '+' : ''}${formatCurrency(share.pnl_usd, share.currency as CurrencyCode, { round: true })} today`
    : 'today, tracked on BullPen';

  const fontData = await loadNumeralsFont();

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          justifyContent: 'center', paddingLeft: 72, backgroundColor: '#101410', color: '#e8e8e6',
          fontFamily: 'Roboto Mono',
        }}
      >
        <div style={{ position: 'absolute', top: 32, left: 48, fontSize: 20, letterSpacing: 4, color: '#8a8f89' }}>
          BULLPEN
        </div>
        <div style={{ display: 'flex', fontFamily: 'serif', fontStyle: 'italic', fontSize: 30, color: '#8a8f89' }}>
          {handle} is up
        </div>
        <div style={{ display: 'flex', fontSize: 118, fontWeight: 600, color, lineHeight: 1.05 }}>
          {pctLabel}
        </div>
        <div style={{ display: 'flex', fontSize: 20, color: '#8a8f89', marginTop: 8 }}>
          {amountLabel}
        </div>
        <svg
          width="260" height="60"
          style={{ position: 'absolute', bottom: 56, right: 72, opacity: 0.7 }}
          viewBox="0 0 260 60"
        >
          <polyline points={points} fill="none" stroke={color} strokeWidth="3" />
        </svg>
        <div style={{ position: 'absolute', bottom: 32, left: 48, fontSize: 18, color: '#6b706a' }}>
          {handle} &middot; {dateLabel}
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: [{ name: 'Roboto Mono', data: fontData, weight: 600, style: 'normal' }],
      headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
    }
  );
}
```

No `withRateLimit` wrapper here, deliberately: that helper's type signature requires the handler to return `Promise<NextResponse>`, but `ImageResponse` is a plain `Response` (not a `NextResponse` subclass), so wrapping it would either fail to typecheck or need `ImageResponse`'s output re-packed into a `NextResponse` — losing the point of using `ImageResponse` at all. Skipping rate limiting here is a reasonable tradeoff for this specific route: it's `Cache-Control: immutable`, so a CDN absorbs virtually all repeat traffic before it reaches this handler, and even an unlimited hit does only one cheap DB row lookup plus a bounded local image render — nothing that costs money per request the way the TwelveData-backed routes do.

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "og/share"`
Expected: no output.

- [ ] **Step 3: Manual verification**

With the dev server running and a real share `id` from Task 5's test, visit `http://localhost:3000/api/og/share/<id>` directly in a browser. Expected: renders a 1200×630 PNG matching the approved mockup (serif "is up" line, big percent, sparkline, handle + date). Visit `http://localhost:3000/api/og/share/does-not-exist`. Expected: JSON 404.

- [ ] **Step 4: Commit**

```bash
git add app/api/og/share/[id]/route.tsx
git commit -m "feat: add OG image generation for shared portfolio cards"
```

---

### Task 7: `GET /share/[id]` — public landing page

**Files:**
- Create: `app/share/[id]/page.tsx`

**Interfaces:**
- Consumes: `getShareById` from `@/lib/shares/get-share` (Task 4); `AuthModal`, `AuthMode` from `@/components/auth/AuthModal`.
- Produces: default export page component + `generateMetadata`.

Deliberately does **not** route the CTA to `/get-started` (the marketing site's multi-step onboarding quiz). That quiz is right for an exploring visitor; someone who just saw a compelling result wants the fastest possible path in — the same reasoning that picked the focused, single-CTA landing layout over the value-props version. This mounts `AuthModal` directly, the same way the marketing landing page's Sign In and Subscribe flows already do (just not its primary Sign Up button, which is the one path that *does* go to the quiz).

- [ ] **Step 1: Write the metadata + server shell**

```tsx
// app/share/[id]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getShareById } from '@/lib/shares/get-share';
import { ShareLanding } from './ShareLanding';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const share = await getShareById(id);
  if (!share) return { title: 'Share not found — BullPen' };

  const positive = share.pct >= 0;
  const who = !share.anonymous && share.username ? `@${share.username}` : 'A BullPen investor';
  const title = `${who} is ${positive ? 'up' : 'down'} ${Math.abs(share.pct).toFixed(2)}% today`;
  const description = 'Track your own portfolio with real market data and AI-powered explanations — free to start.';
  const ogImageUrl = `/api/og/share/${id}`;

  return {
    title: `${title} — BullPen`,
    description,
    openGraph: { title, description, images: [{ url: ogImageUrl, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, description, images: [ogImageUrl] },
  };
}

export default async function SharePage({ params }: Props) {
  const { id } = await params;
  const share = await getShareById(id);
  if (!share) notFound();

  return <ShareLanding share={share} />;
}
```

- [ ] **Step 2: Write the client landing component**

```tsx
// app/share/[id]/ShareLanding.tsx
'use client';

import { lazy, Suspense, useState } from 'react';
import type { AuthMode } from '@/components/auth/AuthModal';
import type { PortfolioShare } from '@/lib/shares/get-share';

const AuthModal = lazy(() => import('@/components/auth/AuthModal').then((m) => ({ default: m.AuthModal })));

export function ShareLanding({ share }: { share: PortfolioShare }) {
  const [authOpen, setAuthOpen] = useState(false);
  const [authMounted, setAuthMounted] = useState(false);
  const authMode: AuthMode = 'signup';

  const positive = share.pct >= 0;
  // share.username is the snapshot taken at creation time — never a live
  // lookup, never present when the share was made anonymous.
  const hasProfile = !share.anonymous && !!share.username;
  const handle = hasProfile ? `@${share.username}` : 'A BullPen investor';

  const openSignUp = () => {
    setAuthMounted(true);
    setAuthOpen(true);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#101410' }}>
      <div style={{ maxWidth: 480, width: '100%', textAlign: 'center', color: '#e8e8e6', fontFamily: 'var(--font-geist-mono)' }}>
        <img
          src={`/api/og/share/${share.id}`}
          alt={`${handle} is ${positive ? 'up' : 'down'} ${Math.abs(share.pct).toFixed(2)}% today, tracked on BullPen`}
          style={{ width: '100%', borderRadius: 12, marginBottom: 24 }}
        />
        <button
          type="button"
          onClick={openSignUp}
          style={{
            background: '#34d399', color: '#0a0c0a', fontWeight: 600, padding: '14px 32px',
            borderRadius: 8, fontSize: 15, border: 'none', cursor: 'pointer',
          }}
        >
          Start tracking your portfolio
        </button>
        <p style={{ fontSize: 12, color: '#6b706a', marginTop: 12 }}>Free to start &middot; no card required</p>

        {/* The one piece of real social proof this page has: a link to the
            sharer's own public profile (already public/browsable — see
            app/users/[username]/page.tsx), when they weren't anonymous. */}
        {hasProfile && (
          <p style={{ fontSize: 12, color: '#6b706a', marginTop: 20 }}>
            Shared by{' '}
            <a href={`/users/${share.username}`} style={{ color: '#8a8f89' }}>
              {handle}
            </a>
          </p>
        )}
      </div>

      {authMounted && (
        <Suspense fallback={null}>
          <AuthModal open={authOpen} onOpenChange={setAuthOpen} initialMode={authMode} redirectTo="/dashboard" />
        </Suspense>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "share/\["`
Expected: no output.

- [ ] **Step 4: Manual verification**

With the dev server running, open the share `id` from Task 5 in an **incognito/private window** (logged out). Expected: page renders with no auth redirect, shows the card image, clicking the CTA opens the sign-up form. View page source or use browser devtools' Elements → `<head>` to confirm `og:image`/`og:title` point at `/api/og/share/<id>` with the right copy. Visit `/share/does-not-exist`. Expected: Next.js's default 404 page (via `notFound()`).

- [ ] **Step 5: Commit**

```bash
git add app/share/
git commit -m "feat: add public /share/[id] landing page"
```

---

### Task 8: Attribution cookie in middleware

**Files:**
- Modify: `middleware.ts`

**Interfaces:**
- Produces: sets a `bp_ref` cookie (first-touch, 30-day) on any request to `/share/[id]`.

Server Components can't mutate cookies during render — only middleware, Route Handlers, and Server Actions can — so this has to live in `middleware.ts`, which already runs on every request and already builds the `response` object this appends to.

- [ ] **Step 1: Add the cookie logic**

In `middleware.ts`, immediately after the existing session-refresh block (after the `if (!isApiRoute && supabaseUrl && supabaseAnonKey) { ... }` block, before the `// Security Headers` comment), add:

```typescript
  // Attribution: first-touch cookie for the shareable-card growth loop.
  // Only set if absent, so a user who visits several shared links before
  // signing up gets credited to whichever one they saw first.
  const shareMatch = request.nextUrl.pathname.match(/^\/share\/([A-Za-z0-9_-]{6,12})$/);
  if (shareMatch && !request.cookies.has('bp_ref')) {
    response.cookies.set('bp_ref', shareMatch[1], {
      maxAge: 60 * 60 * 24 * 30,
      httpOnly: false, // read by client-side signUp()/callback code — see lib/auth/share-attribution.ts
      sameSite: 'lax',
      path: '/',
    });
  }
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep middleware`
Expected: no output.

- [ ] **Step 3: Manual verification**

With the dev server running, visit `http://localhost:3000/share/<a real id>` in a browser with no existing `bp_ref` cookie, then check devtools → Application → Cookies. Expected: `bp_ref` present, value matches the share id, not `HttpOnly`. Reload the same page. Expected: cookie value unchanged (first-touch, not overwritten).

- [ ] **Step 4: Commit**

```bash
git add middleware.ts
git commit -m "feat: set first-touch attribution cookie on share landing pages"
```

---

### Task 9: Attribution claim helper + wiring into both signup paths

**Files:**
- Create: `lib/auth/share-attribution.ts`
- Modify: `lib/auth/auth.ts:48-182` (the `signUp()` function) and `lib/auth/auth.ts:237-284` (the `signIn()` function, as a safety net)
- Modify: `app/auth/callback/page.tsx:50-64` (the `runExchange` function)

**Interfaces:**
- Consumes: `createBrowserClient` from `@/lib/supabase/client`.
- Produces: `getShareRefCookie(): string | null`, `maybeClaimShareAttribution(userId: string): Promise<void>`.

One shared helper, called from all three places a session can newly appear (email/password signup, the OAuth callback, and — as a safety net for the "email confirmation required" signup path, where no session exists yet at signup time — the next successful sign-in). Idempotent and cheap to call even when there's nothing to do: it no-ops immediately if there's no cookie, and never overwrites an already-set attribution.

- [ ] **Step 1: Write the helper**

```typescript
// lib/auth/share-attribution.ts
import { createBrowserClient } from '@/lib/supabase/client';

const REF_COOKIE_NAME = 'bp_ref';

/** Reads the bp_ref cookie set by middleware on /share/[id], or null if absent. */
export function getShareRefCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${REF_COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * If a bp_ref cookie is present and this account hasn't already been
 * attributed, tags settings.acquired_via_share_id and bumps that share's
 * signup_count. Safe to call on every login/signup completion — a no-op
 * whenever there's no cookie or the account is already attributed.
 */
export async function maybeClaimShareAttribution(userId: string): Promise<void> {
  const shareId = getShareRefCookie();
  if (!shareId) return;

  const supabase = createBrowserClient();
  const { data: row } = await supabase.from('users').select('settings').eq('id', userId).single();
  const settings = (row?.settings as Record<string, unknown>) ?? {};
  if (settings.acquired_via_share_id) return;

  await supabase
    .from('users')
    .update({ settings: { ...settings, acquired_via_share_id: shareId } })
    .eq('id', userId);

  await supabase.rpc('increment_share_signup_count', { share_id: shareId });
}
```

- [ ] **Step 2: Wire into `signUp()`**

In `lib/auth/auth.ts`, import `maybeClaimShareAttribution` at the top:

```typescript
import { maybeClaimShareAttribution } from './share-attribution';
```

Then in `signUp()`, right before each of its two `return { success: true, user: ... }` statements that run once a profile is confirmed to exist (the polled-profile-found path around line 171, and the manual-insert-fallback path around line 168 assigning `userProfile = newProfile`), add a call:

```typescript
    if (userProfile) {
      await maybeClaimShareAttribution(userProfile.id);
    }

    return {
      success: true,
      user: userProfile as AuthUser,
    };
```

(This single insertion point covers both paths, since both fall through to the same final `return` — no need to duplicate the call at two separate return sites.)

- [ ] **Step 3: Wire into `signIn()` as a safety net**

In `signIn()`, immediately after the existing `await supabase.from('users').update({ last_login_at: ... })` call, add:

```typescript
    await maybeClaimShareAttribution(userId);
```

This covers the "email confirmation required" signup branch, where `signUp()` returns before a session exists (so it can't call the helper itself) — the user's *next* sign-in, once their session is real, claims it instead. Safe to run on every sign-in: it no-ops instantly once `settings.acquired_via_share_id` is already set.

- [ ] **Step 4: Wire into the OAuth callback**

In `app/auth/callback/page.tsx`, import the helper:

```typescript
import { maybeClaimShareAttribution } from '@/lib/auth/share-attribution';
```

In `runExchange()`, after `if (data.session) redirectHome();`, add the claim call using the newly-established session's user id:

```typescript
      if (data.session) {
        void maybeClaimShareAttribution(data.session.user.id);
        redirectHome();
      }
```

(`void` because this must not delay the redirect — attribution is a side effect, not something the user should wait on.)

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "auth\.ts|auth/callback|share-attribution"`
Expected: no output.

- [ ] **Step 6: Manual verification**

Using a fresh throwaway email: visit a real `/share/<id>` link, confirm the `bp_ref` cookie is set (Task 8), then sign up via email/password. After signup completes, check via `mcp__claude_ai_Supabase__execute_sql`: `select settings->>'acquired_via_share_id' from users where email = '<test email>';` — expected: the share id. Then: `select signup_count from portfolio_shares where id = '<share id>';` — expected: `1`.

Repeat with a second fresh account, visiting a *different* share link before signing up, to confirm that share's `signup_count` also increments independently and the two don't cross-contaminate.

- [ ] **Step 7: Commit**

```bash
git add lib/auth/share-attribution.ts lib/auth/auth.ts app/auth/callback/page.tsx
git commit -m "feat: attribute signups to the share link that produced them"
```

---

### Task 10: Share button + share sheet on the Holdings dashboard

**Files:**
- Create: `components/holdings/ShareSheet.tsx`
- Modify: `components/holdings/PortfolioDashboard.tsx:1-16` (imports/props) and `:91-132` (the Today P&L card)

**Interfaces:**
- Consumes: `Popover`, `PopoverTrigger`, `PopoverContent` from `@/components/ui/popover`; `Switch` from `@/components/ui/switch`; `Button` from `@/components/ui/button`; `Share2` icon from `lucide-react`.
- Produces: `<ShareSheet />` component, rendered inside the existing Today P&L card.

- [ ] **Step 1: Write the share sheet**

```tsx
// components/holdings/ShareSheet.tsx
'use client';

import { useState } from 'react';
import { Share2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';

interface ShareSheetProps {
  /** True when today's figure doesn't exist yet — disables the trigger with an explanatory tooltip. */
  disabled?: boolean;
}

type Phase = 'idle' | 'creating' | 'ready' | 'error';

export function ShareSheet({ disabled }: ShareSheetProps) {
  const [open, setOpen] = useState(false);
  const [includeAmount, setIncludeAmount] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState('Copy link');

  const createShare = async () => {
    setPhase('creating');
    try {
      const res = await fetch('/api/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ includeAmount, anonymous }),
      });
      const json = await res.json();
      if (!json.success) {
        setPhase('error');
        return;
      }
      setShareUrl(json.url);
      setPhase('ready');
    } catch {
      setPhase('error');
    }
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && phase === 'idle') void createShare();
  };

  const handleShare = async () => {
    if (!shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({ url: shareUrl });
      } catch {
        // user cancelled the native share sheet — not an error
      }
      return;
    }
    await navigator.clipboard.writeText(shareUrl);
    setCopyLabel('Copied!');
    setTimeout(() => setCopyLabel('Copy link'), 2000);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={disabled}
          title={disabled ? "Today's figure isn't ready yet" : 'Share today\'s performance'}
          aria-label="Share today's performance"
        >
          <Share2 className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 space-y-3">
        {phase === 'creating' && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Preparing your card…
          </div>
        )}

        {phase === 'error' && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Couldn&apos;t create a share link right now. Try again in a moment.
          </p>
        )}

        {phase === 'ready' && shareUrl && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- external OG route, not a static/optimizable local asset */}
            <img src={`${shareUrl.replace(/\/share\//, '/api/og/share/')}`} alt="Share preview" className="w-full rounded-lg border border-border" />

            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Include dollar amount</span>
              <Switch
                checked={includeAmount}
                onCheckedChange={(checked) => { setIncludeAmount(checked); setPhase('idle'); void createShare(); }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Post anonymously</span>
              <Switch
                checked={anonymous}
                onCheckedChange={(checked) => { setAnonymous(checked); setPhase('idle'); void createShare(); }}
              />
            </div>

            <Button size="sm" className="w-full" onClick={handleShare}>
              {typeof navigator !== 'undefined' && 'share' in navigator ? 'Share' : copyLabel}
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Wire it into the Today P&L card**

In `components/holdings/PortfolioDashboard.tsx`, add the import:

```typescript
import { ShareSheet } from './ShareSheet';
```

Change the Today P&L card's header row (currently just the `TermTooltip` at lines 98-103) to sit alongside the share button:

```tsx
        <div className="mb-2 flex items-center justify-between">
          <TermTooltip
            term="Today P&L"
            className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
          />
          <ShareSheet disabled={stats.todayDollar === 0 && stats.todayPct === 0} />
        </div>
```

(The `disabled` check treats an exact `0`/`0` as "no real figure yet" — the same state a fresh, all-zero `stats` object would have before any holding has priced today. This mirrors the API route's own `no_data_yet` case, so the button and the endpoint agree on when there's nothing to share.)

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "ShareSheet|PortfolioDashboard"`
Expected: no output.

- [ ] **Step 4: Run the lint gate**

Run: `npm run lint`
Expected: 0 errors (warnings acceptable, per this repo's existing baseline).

- [ ] **Step 5: Manual verification in the browser**

Start `npm run dev`, sign in to an account with at least one priced holding, open `/holdings`. Expected: a small share icon sits beside the "Today P&L" label. Click it: a preview card loads, showing the sparkline/percent card matching Task 6's image. Toggle "Include dollar amount" — expected: the preview regenerates and (once the share is re-fetched and viewed) shows a dollar figure. Toggle "Post anonymously" — expected: preview regenerates showing "A BullPen investor" instead of "@you". Click Share/Copy link — expected: either the native share sheet opens (mobile) or the button reads "Copied!" for ~2 seconds (desktop).

- [ ] **Step 6: Commit**

```bash
git add components/holdings/ShareSheet.tsx components/holdings/PortfolioDashboard.tsx
git commit -m "feat: add share button and share sheet to the Holdings dashboard"
```

---

## Self-Review Notes

**Spec coverage:** every section of the spec maps to a task — data model (Task 1), the three routes (Tasks 5, 6, 7), attribution (Tasks 8-9), UI (Task 10), the today-sparkline reuse (Task 2), and the non-enumerable slug (Task 3). The one spec statement corrected during planning: the OAuth callback (`app/auth/callback/page.tsx`) turned out to be a **client** component, not server-side as the spec assumed — this actually simplifies attribution (one shared client-side helper covers both signup paths identically) rather than requiring the two different mechanisms the spec implied.

**Real deviation worth flagging to the reviewer:** the spec said the share landing page reuses `AuthModal` "exactly as `LandingClient.tsx` already does." On inspection, the marketing landing page's own primary Sign Up button actually routes to `/get-started` (a multi-step onboarding quiz) — only its Sign In and Subscribe paths use `AuthModal` directly. Task 7 deliberately uses the low-friction `AuthModal` path instead of the quiz, reasoning that someone arriving with peak motivation (they just saw a compelling result) shouldn't hit more friction than someone casually browsing the marketing site — consistent with why the focused single-CTA landing layout was chosen over the value-props version earlier in the design.

**Three concrete gaps caught and fixed during this self-review pass** (not left as follow-ups):
1. The card/landing-page code originally hardcoded the literal string `"@you"` instead of the sharer's real handle — the schema never captured a username at all. Fixed by snapshotting `username` onto `portfolio_shares` at creation time (same reasoning as the frozen `pct`/`sparkline`: survives the account being renamed or deleted later) and threading it through Tasks 5-7, including the actual profile link the spec's own social-proof reasoning called for but no task had implemented.
2. The `includeAmount` toggle stored `pnl_usd` but nothing ever rendered it — a share created with amounts revealed would have looked identical to one without. Fixed in Task 6 with a conditional line using the existing `formatCurrency` helper.
3. Task 6 originally wrapped the image route in `withRateLimit`, whose type signature requires `Promise<NextResponse>` — but `ImageResponse` is a plain `Response`, not a `NextResponse` subclass, so this wouldn't have typechecked. Fixed by dropping the wrapper for this one route, with the reasoning (immutable/CDN-cached, cheap per-request cost) written into the task itself rather than silently changed.

**End-to-end verification, once all tasks land:** create a share as a real logged-in test user, open the link in a separate private window, confirm the OG unfurl renders correctly when the raw URL is pasted into an actual chat client (iMessage or Discord — rendering varies enough across platforms that curling the route isn't sufficient proof), sign up through it, and confirm attribution landed in the database.
