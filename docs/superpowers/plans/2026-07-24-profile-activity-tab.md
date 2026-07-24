# Profile Activity Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Activity" tab to `/users/[username]` showing a merged, chronological feed of stock theses/replies the user has posted and portfolio moves (opened/increased/trimmed/closed) on their manually-entered holdings.

**Architecture:** One new table (`portfolio_activity`) logs buy/sell events at their two existing write points in `lib/holdings/holdings-db.ts`. Comments need no new schema — they're read live from the existing `stock_theses`/`stock_thesis_replies` tables. A new API route merges all three sources at read time, sorted by timestamp, cursor-paginated. The profile page gains a shadcn `Tabs` split between the existing Portfolio view and the new Activity feed.

**Tech Stack:** Next.js App Router API routes, Supabase (Postgres + RLS), TanStack Query (`useInfiniteQuery`), shadcn/ui `Tabs`, TypeScript.

**Spec:** `docs/superpowers/specs/2026-07-24-profile-activity-tab-design.md` — read this first for full rationale; this plan implements it task-by-task.

## Global Constraints

- No share counts or dollar values in any activity entry — percentage-of-position only (spec: Goals).
- Only `addHolding`, `addOrUpdateHolding` (existing-row branch), and `sellHolding` generate portfolio events. `updateHolding`, `updateHoldingBySymbol`, `removeHolding`, `removeHoldingBySymbol` never do (spec: Non-goals).
- No historical backfill — `portfolio_activity` starts accumulating from the migration's apply date forward (spec: Non-goals).
- Activity visibility follows the two existing flags exactly: `settings.profile_public === false` → whole route 403s (no self-view exception, matching the existing `/api/users/[username]` route's behavior); `settings.holdings_public === false` → portfolio events are omitted but theses/replies still show (spec: API).
- Portfolio-event writes are fire-and-forget (`void recordPortfolioActivity(...)`) — a logging failure must never fail the underlying holdings mutation, matching the existing `recordHealthScoreSnapshot` convention.
- This is a new UI surface: check `.agents/skills/ui-ux-pro-max/SKILL.md` during Task 7, and run `/impeccable polish` on `app/users/[username]/page.tsx` before considering this shippable (CLAUDE.md UI/UX Design Standard).
- Apply the new migration immediately via `mcp__claude_ai_Supabase__apply_migration` per CLAUDE.md's Supabase Migrations protocol (project ID `kgqpzuvhslqazurfrqya`) — don't wait for the user to run it manually.

---

### Task 1: Migration + TypeScript types

**Files:**
- Create: `supabase/migrations/092_portfolio_activity.sql`
- Modify: `lib/types/database.ts` (append after the existing `HoldingSale`/`InsertHoldingSale` block, ~line 158)

**Interfaces:**
- Produces: `portfolio_activity` table (columns: `id`, `user_id`, `symbol`, `company_name`, `action`, `percent_change`, `created_at`); `PortfolioActivity` and `InsertPortfolioActivity` TypeScript types, used by Task 2 and Task 4.

- [ ] **Step 1: Write the migration**

```sql
-- 092_portfolio_activity.sql
-- Portfolio activity log: records deliberate buy-more/open/sell/close events
-- on manually-entered holdings, surfaced on the profile Activity tab. Mirrors
-- health_score_history's write-only-by-service-role pattern. No backfill —
-- starts accumulating from ship date forward (buys were never logged before
-- this, and existing holding_sales rows don't store quantity-before-sale
-- needed to compute a historical trim percentage).
-- See docs/superpowers/specs/2026-07-24-profile-activity-tab-design.md.

CREATE TABLE IF NOT EXISTS public.portfolio_activity (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol         TEXT NOT NULL,
  company_name   TEXT NOT NULL,
  action         TEXT NOT NULL CHECK (action IN ('opened', 'increased', 'trimmed', 'closed')),
  percent_change NUMERIC,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_activity_user
  ON public.portfolio_activity (user_id, created_at DESC);

ALTER TABLE public.portfolio_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read portfolio activity"
  ON public.portfolio_activity FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE public.portfolio_activity IS
  'Deliberate buy-more/open/sell/close events on manually-entered holdings, for the profile Activity tab. No client INSERT/UPDATE/DELETE — written only by holdings-db.ts via the service-role client.';
COMMENT ON COLUMN public.portfolio_activity.percent_change IS
  'Percent of the pre-event position added/removed. Only set for increased/trimmed; null for opened/closed (open is from zero, close is definitionally -100%).';
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Call `mcp__claude_ai_Supabase__apply_migration` with `project_id: kgqpzuvhslqazurfrqya`, the migration name `092_portfolio_activity`, and the SQL above.

- [ ] **Step 3: Verify the table exists**

Call `mcp__claude_ai_Supabase__execute_sql` with:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'portfolio_activity' ORDER BY ordinal_position;
```
Expected: 7 rows (`id`, `user_id`, `symbol`, `company_name`, `action`, `percent_change`, `created_at`) — no error.

- [ ] **Step 4: Add the TypeScript types**

In `lib/types/database.ts`, immediately after the existing `InsertHoldingSale` type (currently ending at line 158), add:

```ts
export interface PortfolioActivity {
  id: string;
  user_id: string;
  symbol: string;
  company_name: string;
  action: 'opened' | 'increased' | 'trimmed' | 'closed';
  percent_change: number | null;
  created_at: string;
}

export type InsertPortfolioActivity = Omit<PortfolioActivity, 'id' | 'created_at'> & {
  id?: string;
};
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/092_portfolio_activity.sql lib/types/database.ts
git commit -m "feat(activity): add portfolio_activity table + types"
```

---

### Task 2: Write-side helper + test script

**Files:**
- Create: `lib/holdings/portfolio-activity.ts`
- Create: `scripts/test-portfolio-activity.ts`

**Interfaces:**
- Consumes: `PortfolioActivity` type from Task 1 (`lib/types/database.ts`).
- Produces: `recordPortfolioActivity(userId: string, symbol: string, companyName: string, action: PortfolioActivity['action'], percentChange?: number | null): Promise<void>` — used by Task 3.

- [ ] **Step 1: Write the helper**

```ts
// lib/holdings/portfolio-activity.ts
/**
 * Records a portfolio activity event (opened/increased/trimmed/closed) for a
 * manually-entered holding, surfaced on the profile Activity tab. Callers use
 * this fire-and-forget (`void recordPortfolioActivity(...)`) — a logging
 * failure must never block or fail the underlying holdings mutation.
 */

import { createServerClient } from '@/lib/supabase/client';
import type { PortfolioActivity } from '@/lib/types/database';

export async function recordPortfolioActivity(
  userId: string,
  symbol: string,
  companyName: string,
  action: PortfolioActivity['action'],
  percentChange: number | null = null
): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase.from('portfolio_activity').insert({
    user_id: userId,
    symbol,
    company_name: companyName,
    action,
    percent_change: percentChange,
  });

  if (error) {
    console.warn(`[portfolio-activity] insert failed for ${symbol} (${action}):`, error.message);
  }
}
```

- [ ] **Step 2: Write the test script**

```ts
// scripts/test-portfolio-activity.ts
// Verifies recordPortfolioActivity: inserts one row per action type against a
// real existing user (FK-constrained to auth.users), confirms percent_change
// is set for increased/trimmed and null for opened/closed, then cleans up.

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';
import { recordPortfolioActivity } from '../lib/holdings/portfolio-activity';

const TEST_SYMBOL = 'ZZZTEST';

async function main() {
  const supabase = createServerClient();

  const { data: anyUser, error: userErr } = await supabase
    .from('users')
    .select('id')
    .limit(1)
    .single();

  if (userErr || !anyUser) {
    console.error('❌ Could not find any user to test against:', userErr?.message);
    process.exit(1);
  }
  const testUserId = anyUser.id;

  // Clean slate
  await supabase.from('portfolio_activity').delete().eq('symbol', TEST_SYMBOL);

  console.log('1) Recording "opened"...');
  await recordPortfolioActivity(testUserId, TEST_SYMBOL, 'Test Co', 'opened');

  console.log('2) Recording "increased" (+50%)...');
  await recordPortfolioActivity(testUserId, TEST_SYMBOL, 'Test Co', 'increased', 50);

  console.log('3) Recording "trimmed" (-25%)...');
  await recordPortfolioActivity(testUserId, TEST_SYMBOL, 'Test Co', 'trimmed', 25);

  console.log('4) Recording "closed"...');
  await recordPortfolioActivity(testUserId, TEST_SYMBOL, 'Test Co', 'closed');

  const { data, error } = await supabase
    .from('portfolio_activity')
    .select('action, percent_change')
    .eq('symbol', TEST_SYMBOL)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('❌ Query failed:', error.message);
    process.exit(1);
  }

  console.log('\nRows for', TEST_SYMBOL, ':', JSON.stringify(data, null, 2));

  const pass =
    data?.length === 4 &&
    data[0].action === 'opened' && data[0].percent_change === null &&
    data[1].action === 'increased' && data[1].percent_change === 50 &&
    data[2].action === 'trimmed' && data[2].percent_change === 25 &&
    data[3].action === 'closed' && data[3].percent_change === null;

  console.log(pass
    ? '\n✅ PASS — 4 rows in order with correct action/percent_change values.'
    : '\n❌ FAIL — see rows above.');

  // Clean up (only this test's rows — never touches the real user's own data)
  await supabase.from('portfolio_activity').delete().eq('symbol', TEST_SYMBOL);
  console.log('Cleaned up test rows.');

  process.exit(pass ? 0 : 1);
}

main();
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx tsx scripts/test-portfolio-activity.ts`
Expected: fails with a module-not-found error (`lib/holdings/portfolio-activity.ts` doesn't exist yet) — if you wrote Step 1 first, skip straight to Step 4's run instead, since the file already exists; the point of this step is to confirm the script actually exercises real code, not a typo. If the table from Task 1 isn't applied yet, expect an insert error instead ("relation portfolio_activity does not exist").

- [ ] **Step 4: Run it to verify it passes**

Run: `npx tsx scripts/test-portfolio-activity.ts`
Expected: ends with `✅ PASS — 4 rows in order with correct action/percent_change values.` and exit code 0.

- [ ] **Step 5: Commit**

```bash
git add lib/holdings/portfolio-activity.ts scripts/test-portfolio-activity.ts
git commit -m "feat(activity): add recordPortfolioActivity helper + test script"
```

---

### Task 3: Wire event recording into holdings-db.ts

**Files:**
- Modify: `lib/holdings/holdings-db.ts` (add import; edit `addHolding`, `addOrUpdateHolding`, `sellHolding`)

**Interfaces:**
- Consumes: `recordPortfolioActivity` from Task 2 (`lib/holdings/portfolio-activity.ts`).
- Produces: nothing new for other tasks — this task's effect is observable only via `portfolio_activity` rows appearing after real holdings mutations, exercised end-to-end in Task 7's manual verification.

- [ ] **Step 1: Add the import**

In `lib/holdings/holdings-db.ts`, add near the top (after the existing `import { getCompanyProfile } ...` line):

```ts
import { recordPortfolioActivity } from '@/lib/holdings/portfolio-activity';
```

- [ ] **Step 2: Record "opened" in `addHolding`**

Find this block (currently the end of `addHolding`):

```ts
    if (insertError) {
      logger.error('Error adding holding:', insertError);
      return {
        success: false,
        error: insertError.message || 'Failed to add holding',
      };
    }

    return {
      success: true,
      holding: newHolding as UserHolding,
    };
```

Replace with:

```ts
    if (insertError) {
      logger.error('Error adding holding:', insertError);
      return {
        success: false,
        error: insertError.message || 'Failed to add holding',
      };
    }

    void recordPortfolioActivity(userId, newHolding.symbol, newHolding.company_name, 'opened');

    return {
      success: true,
      holding: newHolding as UserHolding,
    };
```

- [ ] **Step 3: Record "opened"/"increased" in `addOrUpdateHolding`**

Find this block (the `existing` branch of `addOrUpdateHolding`):

```ts
      const { data: updated, error } = await supabase
        .from('user_holdings')
        .update({
          quantity: newQuantity,
          avg_price: newAvgPrice,
          company_name: holding.company_name,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true, holding: updated as UserHolding };
    }

    return addHolding(userId, holding);
```

Replace with:

```ts
      const { data: updated, error } = await supabase
        .from('user_holdings')
        .update({
          quantity: newQuantity,
          avg_price: newAvgPrice,
          company_name: holding.company_name,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      if (existingQty <= 0) {
        void recordPortfolioActivity(userId, updated.symbol, updated.company_name, 'opened');
      } else {
        void recordPortfolioActivity(userId, updated.symbol, updated.company_name, 'increased', (addQty / existingQty) * 100);
      }

      return { success: true, holding: updated as UserHolding };
    }

    return addHolding(userId, holding);
```

Note: the `addHolding(userId, holding)` fallback on the last line already records its own `'opened'` event (Step 2) — do not add a second insert here, or a brand-new symbol added through `addOrUpdateHolding` would double-log.

- [ ] **Step 4: Record "trimmed"/"closed" in `sellHolding`**

Find this block (the end of `sellHolding`):

```ts
    const newQuantity = Math.max(0, currentQty - input.quantitySold);
    const { data: updatedHolding, error: updateErr } = await supabase
      .from('user_holdings')
      .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
      .eq('id', holding.id)
      .eq('user_id', userId)
      .select()
      .single();

    if (updateErr) {
      // Sale is already recorded; surface the error but don't lose the sale record.
      return { success: false, sale: sale as HoldingSale, error: `Sale recorded, but updating quantity failed: ${updateErr.message}` };
    }

    return { success: true, sale: sale as HoldingSale, holding: updatedHolding as UserHolding };
```

Replace with:

```ts
    const newQuantity = Math.max(0, currentQty - input.quantitySold);
    const { data: updatedHolding, error: updateErr } = await supabase
      .from('user_holdings')
      .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
      .eq('id', holding.id)
      .eq('user_id', userId)
      .select()
      .single();

    if (updateErr) {
      // Sale is already recorded; surface the error but don't lose the sale record.
      return { success: false, sale: sale as HoldingSale, error: `Sale recorded, but updating quantity failed: ${updateErr.message}` };
    }

    if (newQuantity <= SELL_EPSILON) {
      void recordPortfolioActivity(userId, holding.symbol, holding.company_name, 'closed');
    } else {
      void recordPortfolioActivity(userId, holding.symbol, holding.company_name, 'trimmed', (input.quantitySold / currentQty) * 100);
    }

    return { success: true, sale: sale as HoldingSale, holding: updatedHolding as UserHolding };
```

- [ ] **Step 5: Run the existing lint gate**

Run: `npm run lint`
Expected: 0 errors (warnings-only is fine, per CLAUDE.md's quality gate).

- [ ] **Step 6: Manual smoke test against the real dev flow**

Run: `npm run dev`, sign in, go to Holdings, add a brand-new symbol not already in your portfolio, then add more shares to an existing one, then sell part of one. After each action, check via `mcp__claude_ai_Supabase__execute_sql`:
```sql
SELECT symbol, action, percent_change, created_at FROM portfolio_activity
ORDER BY created_at DESC LIMIT 5;
```
Expected: one new row per action, with `action` matching what you did and `percent_change` populated only for increase/trim.

- [ ] **Step 7: Commit**

```bash
git add lib/holdings/holdings-db.ts
git commit -m "feat(activity): record portfolio_activity events on buy/sell"
```

---

### Task 4: Activity feed API route

**Files:**
- Create: `app/api/users/[username]/activity/route.ts`

**Interfaces:**
- Consumes: existing tables `stock_theses`, `stock_thesis_replies`, `users`, and `portfolio_activity` from Task 1.
- Produces: `GET /api/users/[username]/activity?cursor=<ISO timestamp>` returning `{ success: boolean, items: ActivityItem[], nextCursor: string | null }`; the exported `ActivityItem` type is used by Task 5 and Task 6.

- [ ] **Step 1: Write the route**

```ts
// app/api/users/[username]/activity/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export interface ActivityItem {
  type: 'thesis' | 'reply' | 'portfolio';
  created_at: string;
  symbol: string;
  company_name?: string;
  action?: 'opened' | 'increased' | 'trimmed' | 'closed';
  percent_change?: number | null;
  content?: string;
  sentiment?: 'bull' | 'bear' | 'neutral';
  reply_to_username?: string | null;
}

const PAGE_SIZE = 20;

function makeSupabase(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {}
        },
      },
    }
  );
}

async function handler(
  req: NextRequest,
  context: { params: Promise<{ username: string }> },
  _session: { userId: string }
): Promise<NextResponse> {
  const { username } = await context.params;
  const cursor = req.nextUrl.searchParams.get('cursor') ?? new Date().toISOString();

  if (!username || username.length < 1 || username.length > 60) {
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'Invalid username' }, { status: 400 }));
  }

  const cookieStore = await cookies();
  const supabase = makeSupabase(cookieStore);

  const SELECT_COLS = 'id, settings';
  let userRow: { id: string; settings: Record<string, unknown> | null } | null = null;
  const { data: byUsername } = await supabase.from('users').select(SELECT_COLS).eq('username', username).maybeSingle();
  if (byUsername) {
    userRow = byUsername;
  } else {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (UUID_RE.test(username)) {
      const { data: byId } = await supabase.from('users').select(SELECT_COLS).eq('id', username).maybeSingle();
      userRow = byId ?? null;
    }
  }

  if (!userRow) {
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'User not found' }, { status: 404 }));
  }

  const settings = userRow.settings ?? {};
  if (settings.profile_public === false) {
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'This profile is private' }, { status: 403 }));
  }
  const holdingsPublic = settings.holdings_public !== false;
  const targetId = userRow.id;

  const [thesesRes, repliesRes, portfolioRes] = await Promise.all([
    supabase
      .from('stock_theses')
      .select('id, symbol, content, sentiment, created_at')
      .eq('user_id', targetId)
      .lt('created_at', cursor)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE),
    supabase
      .from('stock_thesis_replies')
      .select('id, thesis_id, content, created_at')
      .eq('user_id', targetId)
      .lt('created_at', cursor)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE),
    holdingsPublic
      ? supabase
          .from('portfolio_activity')
          .select('symbol, company_name, action, percent_change, created_at')
          .eq('user_id', targetId)
          .lt('created_at', cursor)
          .order('created_at', { ascending: false })
          .limit(PAGE_SIZE)
      : Promise.resolve({ data: [] as { symbol: string; company_name: string; action: string; percent_change: number | null; created_at: string }[], error: null }),
  ]);

  const theses = thesesRes.data ?? [];
  const replies = repliesRes.data ?? [];
  const portfolio = portfolioRes.data ?? [];

  // Replies don't carry their own symbol — resolve each reply's parent thesis
  // (for symbol) and that thesis's author (for "replied to @username").
  let replyItems: ActivityItem[] = [];
  if (replies.length > 0) {
    const thesisIds = [...new Set(replies.map((r) => r.thesis_id))];
    const { data: parentTheses } = await supabase
      .from('stock_theses')
      .select('id, symbol, user_id')
      .in('id', thesisIds);
    const parentMap = new Map((parentTheses ?? []).map((t) => [t.id, t]));

    const authorIds = [...new Set((parentTheses ?? []).map((t) => t.user_id))];
    const { data: authorRows } = authorIds.length > 0
      ? await supabase.from('users').select('id, username').in('id', authorIds)
      : { data: [] as { id: string; username: string | null }[] };
    const authorMap = new Map((authorRows ?? []).map((u) => [u.id, u.username]));

    replyItems = replies
      .map((r): ActivityItem | null => {
        const parent = parentMap.get(r.thesis_id);
        if (!parent) return null; // parent thesis was deleted — nothing to link to
        return {
          type: 'reply',
          created_at: r.created_at,
          symbol: parent.symbol,
          content: r.content,
          reply_to_username: authorMap.get(parent.user_id) ?? null,
        };
      })
      .filter((r): r is ActivityItem => r !== null);
  }

  const thesisItems: ActivityItem[] = theses.map((t) => ({
    type: 'thesis',
    created_at: t.created_at,
    symbol: t.symbol,
    content: t.content,
    sentiment: t.sentiment as 'bull' | 'bear' | 'neutral',
  }));

  const portfolioItems: ActivityItem[] = portfolio.map((p) => ({
    type: 'portfolio',
    created_at: p.created_at,
    symbol: p.symbol,
    company_name: p.company_name,
    action: p.action as 'opened' | 'increased' | 'trimmed' | 'closed',
    percent_change: p.percent_change,
  }));

  const merged = [...thesisItems, ...replyItems, ...portfolioItems]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, PAGE_SIZE);

  const nextCursor = merged.length === PAGE_SIZE ? merged[merged.length - 1].created_at : null;

  return addSecurityHeaders(NextResponse.json({ success: true, items: merged, nextCursor }));
}

export const GET = withRateLimit(withAuth(handler), { windowMs: 60 * 1000, maxRequests: 60 });
```

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: 0 errors.

- [ ] **Step 3: Manual verification against a real profile**

Run: `npm run dev`, sign in in a browser, then in another terminal:
```bash
curl -s "http://localhost:3000/api/users/<your-username>/activity" -H "Cookie: <paste your sb cookies from devtools>"
```
Expected: `{"success":true,"items":[...],"nextCursor":...}` — if you ran Task 3's manual smoke test first, the portfolio events you created should appear here, newest first. If your profile has `holdings_public: false` in `settings`, confirm portfolio items are absent but theses/replies (if any) still appear. If `profile_public: false`, confirm the response is `403`.

(This route requires cookie-based auth like every other route under `app/api/users/`, so a plain unauthenticated curl will 401 — verifying through the browser's Network tab while signed in is simpler than reconstructing cookies manually.)

- [ ] **Step 4: Commit**

```bash
git add app/api/users/[username]/activity/route.ts
git commit -m "feat(activity): add GET /api/users/[username]/activity route"
```

---

### Task 5: `useProfileActivity` hook

**Files:**
- Create: `hooks/use-profile-activity.ts`

**Interfaces:**
- Consumes: `ActivityItem` type from Task 4 (`@/app/api/users/[username]/activity/route`).
- Produces: `useProfileActivity(username: string)` — a TanStack `useInfiniteQuery` result (`data`, `isLoading`, `fetchNextPage`, `hasNextPage`, `isFetchingNextPage`), used by Task 6.

- [ ] **Step 1: Write the hook**

```ts
// hooks/use-profile-activity.ts
'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import type { ActivityItem } from '@/app/api/users/[username]/activity/route';

interface ActivityPage {
  success: boolean;
  items: ActivityItem[];
  nextCursor: string | null;
}

export function useProfileActivity(username: string) {
  return useInfiniteQuery<ActivityPage>({
    queryKey: ['profile-activity', username],
    queryFn: async ({ pageParam }) => {
      const url = pageParam
        ? `/api/users/${encodeURIComponent(username)}/activity?cursor=${encodeURIComponent(pageParam as string)}`
        : `/api/users/${encodeURIComponent(username)}/activity`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch activity');
      return res.json();
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 3 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: !!username,
  });
}
```

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add hooks/use-profile-activity.ts
git commit -m "feat(activity): add useProfileActivity hook"
```

---

### Task 6: `ActivityFeed` component

**Files:**
- Create: `components/user/ActivityFeed.tsx`

**Interfaces:**
- Consumes: `useProfileActivity` from Task 5, `ActivityItem` type from Task 4, `slugToAssetPath` from `@/lib/assets/asset-type`.
- Produces: `<ActivityFeed username={string} />`, used by Task 7.

- [ ] **Step 1: Write the component**

```tsx
// components/user/ActivityFeed.tsx
'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { TrendingUp, TrendingDown, PlusCircle, XCircle, MessageCircle, CornerDownRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { useProfileActivity } from '@/hooks/use-profile-activity';
import type { ActivityItem } from '@/app/api/users/[username]/activity/route';

const SENTIMENT_LABEL: Record<'bull' | 'bear' | 'neutral', string> = {
  bull: 'Bull',
  bear: 'Bear',
  neutral: 'Neutral',
};

const PREVIEW_LENGTH = 100;

function preview(content: string | undefined): string {
  if (!content) return '';
  return content.length > PREVIEW_LENGTH ? `${content.slice(0, PREVIEW_LENGTH)}…` : content;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function SymbolLink({ symbol }: { symbol: string }) {
  return (
    <Link href={slugToAssetPath(symbol)} className="font-semibold text-foreground hover:text-primary transition-colors">
      {symbol}
    </Link>
  );
}

function portfolioSentence(item: ActivityItem): { icon: ReactNode; text: ReactNode } {
  const pct = item.percent_change != null ? Math.round(item.percent_change) : null;

  switch (item.action) {
    case 'opened':
      return { icon: <PlusCircle className="h-4 w-4 text-emerald-500" />, text: <>Opened a new position in <SymbolLink symbol={item.symbol} /></> };
    case 'increased':
      return { icon: <TrendingUp className="h-4 w-4 text-emerald-500" />, text: <>Increased position in <SymbolLink symbol={item.symbol} /> by {pct}%</> };
    case 'trimmed':
      return { icon: <TrendingDown className="h-4 w-4 text-red-500" />, text: <>Trimmed <SymbolLink symbol={item.symbol} /> position by {pct}%</> };
    case 'closed':
      return { icon: <XCircle className="h-4 w-4 text-red-500" />, text: <>Closed their position in <SymbolLink symbol={item.symbol} /></> };
    default:
      return { icon: null, text: null };
  }
}

function ActivityRow({ item }: { item: ActivityItem }) {
  if (item.type === 'portfolio') {
    const { icon, text } = portfolioSentence(item);
    return (
      <div className="flex items-start gap-2.5 py-3 border-b border-border/50 last:border-0">
        <div className="mt-0.5 shrink-0">{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground">{text}</p>
          <span className="text-xs text-muted-foreground">{timeAgo(item.created_at)}</span>
        </div>
      </div>
    );
  }

  if (item.type === 'thesis') {
    return (
      <div className="flex items-start gap-2.5 py-3 border-b border-border/50 last:border-0">
        <MessageCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground">
            Posted a{' '}
            <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
              {SENTIMENT_LABEL[item.sentiment ?? 'neutral']}
            </span>{' '}
            take on <SymbolLink symbol={item.symbol} />: &quot;{preview(item.content)}&quot;
          </p>
          <span className="text-xs text-muted-foreground">{timeAgo(item.created_at)}</span>
        </div>
      </div>
    );
  }

  // reply
  return (
    <div className="flex items-start gap-2.5 py-3 border-b border-border/50 last:border-0">
      <CornerDownRight className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground">
          Replied to {item.reply_to_username ? `@${item.reply_to_username}` : 'a'}&apos;s take on{' '}
          <SymbolLink symbol={item.symbol} />: &quot;{preview(item.content)}&quot;
        </p>
        <span className="text-xs text-muted-foreground">{timeAgo(item.created_at)}</span>
      </div>
    </div>
  );
}

export function ActivityFeed({ username }: { username: string }) {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useProfileActivity(username);
  const items = data?.pages.flatMap((p) => p.items) ?? [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
      </div>
    );
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">No activity yet.</p>;
  }

  return (
    <div>
      {items.map((item, i) => <ActivityRow key={`${item.type}-${item.created_at}-${i}`} item={item} />)}
      {hasNextPage && (
        <div className="pt-3 text-center">
          <Button variant="outline" size="sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: 0 errors. (The `&quot;`/`&apos;` entities avoid the `react/no-unescaped-entities` rule this project's ESLint config likely enforces, matching JSX text conventions elsewhere in the codebase.)

- [ ] **Step 3: Commit**

```bash
git add components/user/ActivityFeed.tsx
git commit -m "feat(activity): add ActivityFeed component"
```

---

### Task 7: Wire the Activity tab into the profile page

**Files:**
- Modify: `app/users/[username]/page.tsx`

**Interfaces:**
- Consumes: `ActivityFeed` from Task 6, `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` from `@/components/ui/tabs` (already in the codebase, no new dependency).

- [ ] **Step 1: Add imports**

At the top of `app/users/[username]/page.tsx`, add alongside the existing imports:

```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ActivityFeed } from '@/components/user/ActivityFeed';
```

- [ ] **Step 2: Wrap the Portfolio section in Tabs, add the Activity tab**

Find the current end of the page (the Portfolio card through the closing tags):

```tsx
        {/* Portfolio */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">
              Portfolio
              {(holdings?.length ?? 0) > 0 && (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  · {holdings!.length} stock{holdings!.length === 1 ? '' : 's'}
                </span>
              )}
            </h2>
          </div>
          <PublicHoldingsList holdings={holdings ?? []} />
        </div>
      </div>
    </div>
  );
}
```

Replace with:

```tsx
        {/* Portfolio / Activity */}
        <Tabs defaultValue="portfolio">
          <TabsList>
            <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="portfolio">
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">
                  Portfolio
                  {(holdings?.length ?? 0) > 0 && (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      · {holdings!.length} stock{holdings!.length === 1 ? '' : 's'}
                    </span>
                  )}
                </h2>
              </div>
              <PublicHoldingsList holdings={holdings ?? []} />
            </div>
          </TabsContent>

          <TabsContent value="activity">
            <div className="rounded-xl border border-border bg-card p-4">
              <ActivityFeed username={username} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: 0 errors.

- [ ] **Step 4: Browser verification (required for UI changes per CLAUDE.md)**

Run: `npm run dev`, sign in, navigate to `/users/<your-username>` (or any username you can view). Confirm:
- Two tabs render: "Portfolio" (default, shows existing content unchanged) and "Activity".
- Clicking "Activity" lazy-loads and shows either your recent theses/replies/portfolio moves (newest first) or "No activity yet." if you have none.
- If you completed Task 3's manual smoke test, the buy/sell events you generated appear with correct wording and percentages.
- Tab styling, spacing, and dark/light mode both look consistent with the rest of the page (check both via the theme toggle).
- No console errors in devtools.

- [ ] **Step 5: Run the `/impeccable polish` pass**

Per CLAUDE.md's Pre-ship polish pass requirement for new UI surfaces:
```
/impeccable polish app/users/[username]/page.tsx
```
Address anything it flags before considering this feature done.

- [ ] **Step 6: Commit**

```bash
git add app/users/[username]/page.tsx
git commit -m "feat(activity): add Activity tab to user profile page"
```

- [ ] **Step 7: Push to preview**

```bash
git push origin preview
```

## Self-Review Notes

- **Spec coverage:** Data model (Task 1), write points for opened/increased/trimmed/closed (Task 3, backed by Task 2's helper), comments read live with no schema change (Task 4), API privacy gating via `profile_public`/`holdings_public` (Task 4), percentage-only disclosure (Task 6's `portfolioSentence`), no backfill (Task 1's migration comment, no backfill script anywhere in this plan), UI tab placement + polish pass (Task 7) — all covered.
- **Placeholder scan:** No TBDs; every step has complete, runnable code.
- **Type consistency:** `ActivityItem` (Task 4) is the single shape referenced unchanged by Task 5's `ActivityPage` and Task 6's `ActivityRow`/`portfolioSentence`. `PortfolioActivity['action']` (Task 1) matches the literal union used in Task 4's cast and Task 6's `switch`. `recordPortfolioActivity`'s signature (Task 2) matches every call site added in Task 3.
