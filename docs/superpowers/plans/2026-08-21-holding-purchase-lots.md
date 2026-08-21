# Holding Purchase Lots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record every discrete purchase (initial buy and every top-up) of a manually-entered holding as its own lot, and plot one accurate chart dot per lot instead of today's single dot at the misleading blended average price/date.

**Architecture:** One new additive Supabase table (`holding_purchases`) holds purchase events, structurally mirroring the existing `holding_sales` table. Lot-writing is added directly inside the two existing functions that already handle every purchase — `addHolding` (first lot) and `addOrUpdateHolding` (top-up lot, plus a lazy backfill of the pre-existing chunk the first time an old holding is touched) — so every existing caller (AI chat top-ups, onboarding flush, the new UI below) gets accurate lots automatically with no new call-site wiring. `transaction-markers.ts` plots one dot per lot when lots exist, falling back to today's single dot otherwise (brokerage-synced holdings, or manual holdings never topped up since ship).

**Tech Stack:** Next.js App Router, Server Actions (`app/actions/holdings.ts` — this codebase has no `app/api/holdings/route.ts`), TanStack Query, Supabase Postgres + RLS, Radix Tabs (`components/ui/tabs.tsx`) for the pill toggle.

**Spec:** `docs/superpowers/specs/2026-08-21-holding-purchase-lots-design.md` — read it before starting; this plan implements it exactly.

## Global Constraints

- **No test framework exists in this repo** (CLAUDE.md: "One-off scripts, run with tsx via ts-node, no test framework"). Every data-layer task below replaces "write a failing unit test" with a one-off `npx tsx` script run against the real dev Supabase project, or a direct SQL check via the Supabase MCP `execute_sql` tool. Delete throwaway scripts after use; don't leave them in the repo.
- Supabase project: `kgqpzuvhslqazurfrqya`. Use `mcp__claude_ai_Supabase__apply_migration` for the migration, `mcp__claude_ai_Supabase__execute_sql` for verification queries.
- QA test account for scripted/browser verification: email `qa-test-agent@bullpen.no`, user id `5de5fba7-f2fa-43d4-8bdd-3ee2b3d77f71`. Already has 3 holdings (10 MSFT, 5 NVDA, 2 RDDT), all `source = 'manual'`. Use this account, not a newly created one.
- Follow existing patterns exactly: data-layer functions in `lib/holdings/holdings-db.ts` → Server Actions in `app/actions/holdings.ts` → hooks in `hooks/use-holdings.ts` wrapping actions with TanStack Query.
- `npm run lint` must stay at 0 errors after every task (pre-existing warnings are fine — don't fix unrelated ones).
- Purchase-lot recording is manual-holdings-only in the new UI (same `source === 'manual'` gate `SellHoldingModal`/`sellHolding` already use). Data-layer writes (`addHolding`/`addOrUpdateHolding`) are unrestricted by source, same as today — this plan does not add a new source guard there.
- No lot editing/deleting UI, no CSV import changes, no FIFO/LIFO accounting, no bulk backfill migration — see the spec's Non-goals.

---

### Task 1: `holding_purchases` table migration

**Files:**
- Create: `supabase/migrations/111_holding_purchases.sql`

**Interfaces:**
- Produces: Postgres table `public.holding_purchases` with columns `id, user_id, holding_id, symbol, company_name, quantity, price, purchase_date, purchase_currency, purchase_fx_rate, trading_currency, asset_type, created_at`. Every later task reads/writes exactly these column names.

- [ ] **Step 1: Write the migration file**

```sql
-- 111_holding_purchases.sql
-- Records one purchase lot per discrete buy event (initial purchase or
-- top-up) against a manually-entered holding. user_holdings collapses every
-- buy into a single blended avg_price/date_purchased; this table keeps the
-- individual events so chart markers can plot one accurate dot per lot
-- instead of one misleading averaged dot.
-- See docs/superpowers/specs/2026-08-21-holding-purchase-lots-design.md.

CREATE TABLE IF NOT EXISTS public.holding_purchases (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  holding_id        UUID NOT NULL REFERENCES public.user_holdings(id) ON DELETE CASCADE,
  symbol            TEXT NOT NULL,
  company_name      TEXT NOT NULL,
  quantity          NUMERIC NOT NULL CHECK (quantity > 0),
  price             NUMERIC NOT NULL,
  purchase_date     DATE NOT NULL,
  purchase_currency TEXT,
  purchase_fx_rate  NUMERIC,
  trading_currency  TEXT,
  asset_type        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_holding_purchases_holding
  ON public.holding_purchases (holding_id, purchase_date);
CREATE INDEX IF NOT EXISTS idx_holding_purchases_user
  ON public.holding_purchases (user_id, symbol);

ALTER TABLE public.holding_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own holding purchases"
  ON public.holding_purchases FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.holding_purchases IS
  'One row per discrete purchase lot (initial buy or top-up) against a manually-entered holding. holding_id is ON DELETE CASCADE (unlike holding_sales'' SET NULL) — lots have no standalone display like the closed-positions list, they only feed chart markers on their still-existing parent holding.';
COMMENT ON COLUMN public.holding_purchases.price IS
  'This lot''s price per share, in trading_currency — never the blended user_holdings.avg_price, which keeps changing after future buys.';
```

- [ ] **Step 2: Apply the migration**

Use `mcp__claude_ai_Supabase__apply_migration` with `project_id: "kgqpzuvhslqazurfrqya"`, `name: "111_holding_purchases"`, and `query` set to the SQL above (everything from `CREATE TABLE` through the last `COMMENT ON COLUMN`).

- [ ] **Step 3: Verify the table and policy exist**

Use `mcp__claude_ai_Supabase__execute_sql`:
```sql
select table_name from information_schema.tables where table_name = 'holding_purchases';
select policyname, cmd from pg_policies where tablename = 'holding_purchases';
```
Expected: one row for the table, one row for the policy (`cmd = 'ALL'`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/111_holding_purchases.sql
git commit -m "feat: add holding_purchases table for recording purchase lots"
```

---

### Task 2: `HoldingPurchase` type

**Files:**
- Modify: `lib/types/database.ts` (insert immediately after `export type InsertHoldingSale = ...` — currently ending at line 158 — and before `export interface PortfolioActivity` at line 160)

**Interfaces:**
- Consumes: nothing new.
- Produces: `HoldingPurchase` interface, `InsertHoldingPurchase` type. Task 3 imports both from `@/lib/types/database`.

- [ ] **Step 1: Add the types**

Insert this block between the end of `InsertHoldingSale` and the start of `PortfolioActivity`:

```ts
export interface HoldingPurchase {
  id: string;
  user_id: string;
  holding_id: string;
  symbol: string;
  company_name: string;
  quantity: number;
  price: number;
  purchase_date: string;
  purchase_currency: string | null;
  purchase_fx_rate: number | null;
  trading_currency: string | null;
  asset_type: string | null;
  created_at: string;
}

export type InsertHoldingPurchase = Omit<HoldingPurchase, 'id' | 'created_at'> & {
  id?: string;
};
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit lib/types/database.ts 2>&1 | head -20`
Expected: no errors mentioning `HoldingPurchase` or `InsertHoldingPurchase` (this project suppresses TS build errors project-wide per `next.config.ts`, so this is a sanity check, not a gate).

- [ ] **Step 3: Commit**

```bash
git add lib/types/database.ts
git commit -m "feat: add HoldingPurchase type"
```

---

### Task 3: Data layer — lot-writing in `addHolding`/`addOrUpdateHolding`, plus `getHoldingPurchases`

**Files:**
- Modify: `lib/holdings/holdings-db.ts`

**Interfaces:**
- Consumes: `HoldingPurchase`, `InsertHoldingPurchase` from `@/lib/types/database` (Task 2).
- Produces:
  - `getHoldingPurchases(userId: string): Promise<GetHoldingPurchasesResult>` — `{ success: boolean; purchases?: HoldingPurchase[]; error?: string }`. Task 4 imports this plus the result interface.
  - `addHolding` and `addOrUpdateHolding` keep their existing signatures/return types — only their internals change. Every existing caller is unaffected.

- [ ] **Step 1: Update the import line**

Change line 5 from:
```ts
import type { UserHolding, InsertUserHolding, UpdateUserHolding, HoldingSale, InsertHoldingSale } from '@/lib/types/database';
```
to:
```ts
import type { UserHolding, InsertUserHolding, UpdateUserHolding, HoldingSale, InsertHoldingSale, HoldingPurchase, InsertHoldingPurchase } from '@/lib/types/database';
```

- [ ] **Step 2: Add the `recordHoldingPurchase` helper, immediately before `export async function addHolding(`**

```ts
/**
 * Records one purchase lot for a holding — inserted by both addHolding (the
 * initial buy) and addOrUpdateHolding (every subsequent top-up), so every
 * discrete buy event gets its own row for accurate multi-dot chart markers.
 * Best-effort: logs and swallows errors rather than failing the parent
 * mutation, same fire-and-forget pattern as recordPortfolioActivity.
 */
async function recordHoldingPurchase(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  holding: {
    id: string;
    symbol: string;
    company_name: string;
    purchase_currency?: string | null;
    purchase_fx_rate?: number | null;
    trading_currency?: string | null;
    asset_type?: string | null;
  },
  lot: { quantity: number; price: number; purchaseDate: string }
): Promise<void> {
  const insert: Omit<InsertHoldingPurchase, 'id'> = {
    user_id: userId,
    holding_id: holding.id,
    symbol: holding.symbol,
    company_name: holding.company_name,
    quantity: lot.quantity,
    price: lot.price,
    purchase_date: lot.purchaseDate,
    purchase_currency: holding.purchase_currency ?? null,
    purchase_fx_rate: holding.purchase_fx_rate ?? null,
    trading_currency: holding.trading_currency ?? null,
    asset_type: holding.asset_type ?? null,
  };
  const { error } = await supabase.from('holding_purchases').insert(insert);
  if (error) {
    logger.error('Error recording holding purchase lot:', error);
  }
}
```

- [ ] **Step 3: Record the first lot in `addHolding`**

Find this block (currently the end of `addHolding`, right after the insert succeeds):
```ts
    void recordPortfolioActivity(userId, newHolding.symbol, newHolding.company_name, 'opened');

    return {
      success: true,
      holding: newHolding as UserHolding,
    };
```
Replace with:
```ts
    void recordPortfolioActivity(userId, newHolding.symbol, newHolding.company_name, 'opened');

    if (newHolding.quantity != null && newHolding.quantity > 0 && newHolding.avg_price != null && newHolding.avg_price > 0) {
      void recordHoldingPurchase(supabase, userId, newHolding as UserHolding, {
        quantity: newHolding.quantity,
        price: newHolding.avg_price,
        purchaseDate: newHolding.date_purchased ?? new Date().toISOString().slice(0, 10),
      });
    }

    return {
      success: true,
      holding: newHolding as UserHolding,
    };
```

- [ ] **Step 4: Record the top-up lot (plus lazy backfill) in `addOrUpdateHolding`**

Find this block (the `existing` branch of `addOrUpdateHolding`):
```ts
    const { data: existing } = await supabase
      .from('user_holdings')
      .select('id, quantity, avg_price')
      .eq('user_id', userId)
      .eq('symbol', holding.symbol.toUpperCase())
      .maybeSingle();

    if (existing) {
      const existingQty = existing.quantity ?? 0;
      const addQty = holding.quantity ?? 0;
      const newQuantity = existingQty + addQty;

      let newAvgPrice: number | null = existing.avg_price ?? null;
      if (holding.avg_price != null && holding.avg_price > 0 && addQty > 0) {
        if (existingQty > 0 && existing.avg_price != null) {
          newAvgPrice =
            (existingQty * existing.avg_price + addQty * holding.avg_price) / newQuantity;
        } else {
          newAvgPrice = holding.avg_price;
        }
      }

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

Replace with:
```ts
    const { data: existing } = await supabase
      .from('user_holdings')
      .select('id, quantity, avg_price, date_purchased, purchase_currency, purchase_fx_rate, trading_currency, asset_type')
      .eq('user_id', userId)
      .eq('symbol', holding.symbol.toUpperCase())
      .maybeSingle();

    if (existing) {
      const existingQty = existing.quantity ?? 0;
      const addQty = holding.quantity ?? 0;
      const newQuantity = existingQty + addQty;

      let newAvgPrice: number | null = existing.avg_price ?? null;
      if (holding.avg_price != null && holding.avg_price > 0 && addQty > 0) {
        if (existingQty > 0 && existing.avg_price != null) {
          newAvgPrice =
            (existingQty * existing.avg_price + addQty * holding.avg_price) / newQuantity;
        } else {
          newAvgPrice = holding.avg_price;
        }
      }

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

      if (addQty > 0 && holding.avg_price != null && holding.avg_price > 0) {
        const { count: existingLotCount, error: lotCountErr } = await supabase
          .from('holding_purchases')
          .select('*', { count: 'exact', head: true })
          .eq('holding_id', existing.id);

        // Lazy backfill: an old holding with no recorded lots yet gets one
        // synthesized from its pre-update state, so the lot total doesn't
        // fall short of the holding's real share count. Skipped if we
        // can't confirm no lots exist yet, or if the pre-existing chunk
        // has no date to backfill at — see "Lazy backfill" in
        // docs/superpowers/specs/2026-08-21-holding-purchase-lots-design.md.
        if (!lotCountErr && !existingLotCount && existingQty > 0 && existing.avg_price != null && existing.date_purchased) {
          void recordHoldingPurchase(
            supabase,
            userId,
            {
              id: existing.id,
              symbol: updated.symbol,
              company_name: updated.company_name,
              purchase_currency: existing.purchase_currency,
              purchase_fx_rate: existing.purchase_fx_rate,
              trading_currency: existing.trading_currency,
              asset_type: existing.asset_type,
            },
            { quantity: existingQty, price: existing.avg_price, purchaseDate: existing.date_purchased }
          );
        }

        void recordHoldingPurchase(
          supabase,
          userId,
          {
            id: existing.id,
            symbol: updated.symbol,
            company_name: updated.company_name,
            purchase_currency: holding.purchase_currency,
            purchase_fx_rate: holding.purchase_fx_rate,
            trading_currency: holding.trading_currency,
            asset_type: holding.asset_type,
          },
          { quantity: addQty, price: holding.avg_price, purchaseDate: holding.date_purchased ?? new Date().toISOString().slice(0, 10) }
        );
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

- [ ] **Step 5: Add `getHoldingPurchases`, at the end of the file**

```ts
export interface GetHoldingPurchasesResult {
  success: boolean;
  purchases?: HoldingPurchase[];
  error?: string;
}

/**
 * Lists this user's recorded purchase lots, oldest first (chart markers want
 * chronological order; buildTransactionMarkers re-sorts anyway, but this
 * keeps the raw list itself readable if it's ever displayed directly).
 */
export async function getHoldingPurchases(userId: string): Promise<GetHoldingPurchasesResult> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('holding_purchases')
      .select('*')
      .eq('user_id', userId)
      .order('purchase_date', { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, purchases: (data ?? []) as HoldingPurchase[] };
  } catch (error) {
    logger.error('Error in getHoldingPurchases:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Internal server error' };
  }
}
```

- [ ] **Step 6: Write a throwaway verification script**

Create `scripts/_verify-holding-purchases.ts` (temporary — delete after running):

```ts
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { addHolding, addOrUpdateHolding, getHoldingPurchases, removeHolding } from '../lib/holdings/holdings-db';
import { createServerClient } from '../lib/supabase/client';

const TEST_USER_ID = '5de5fba7-f2fa-43d4-8bdd-3ee2b3d77f71'; // qa-test-agent@bullpen.no

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`FAIL ${label}: expected ${expected}, got ${actual}`);
  }
  console.log(`PASS ${label}: ${actual}`);
}

async function main() {
  // Scenario 1: brand-new holding gets lot #1 from addHolding.
  const added = await addHolding(TEST_USER_ID, {
    symbol: 'ZZLOT',
    company_name: 'Verify Purchase Lots Co',
    quantity: 10,
    avg_price: 137,
    date_purchased: '2026-06-01',
    asset_type: 'stock',
  } as never);
  if (!added.success || !added.holding) throw new Error(`setup failed: ${added.error}`);

  await new Promise((r) => setTimeout(r, 500)); // let the fire-and-forget lot insert land
  const afterCreate = await getHoldingPurchases(TEST_USER_ID);
  const lotsAfterCreate = afterCreate.purchases?.filter((p) => p.holding_id === added.holding!.id) ?? [];
  assertEqual(lotsAfterCreate.length, 1, 'one lot after addHolding');
  assertEqual(lotsAfterCreate[0]?.quantity, 10, 'first lot quantity');
  assertEqual(lotsAfterCreate[0]?.price, 137, 'first lot price');

  // Scenario 2: top-up via addOrUpdateHolding gets its own lot at its own price.
  const toppedUp = await addOrUpdateHolding(TEST_USER_ID, {
    symbol: 'ZZLOT',
    company_name: 'Verify Purchase Lots Co',
    quantity: 5,
    avg_price: 94,
    date_purchased: '2026-07-15',
    asset_type: 'stock',
  } as never);
  if (!toppedUp.success || !toppedUp.holding) throw new Error(`top-up failed: ${toppedUp.error}`);
  assertEqual(toppedUp.holding.quantity, 15, 'blended quantity after top-up');

  await new Promise((r) => setTimeout(r, 500));
  const afterTopUp = await getHoldingPurchases(TEST_USER_ID);
  const lotsAfterTopUp = afterTopUp.purchases?.filter((p) => p.holding_id === added.holding!.id) ?? [];
  assertEqual(lotsAfterTopUp.length, 2, 'two lots after top-up (no backfill needed, lot already existed)');
  const secondLot = lotsAfterTopUp.find((p) => p.price === 94);
  assertEqual(secondLot?.quantity, 5, 'second lot quantity');
  assertEqual(secondLot?.purchase_date, '2026-07-15', 'second lot date');

  await removeHolding(TEST_USER_ID, added.holding.id);

  // Scenario 3: lazy backfill. Simulate a pre-existing holding from before
  // this feature shipped by inserting directly (bypassing addHolding, so no
  // lot gets written), then top it up and confirm both the backfilled
  // original chunk and the new lot appear.
  const supabase = createServerClient();
  const { data: legacyHolding, error: legacyErr } = await supabase
    .from('user_holdings')
    .insert({
      user_id: TEST_USER_ID,
      symbol: 'ZZLEGACY',
      company_name: 'Verify Backfill Co',
      quantity: 20,
      avg_price: 50,
      date_purchased: '2025-01-10',
      asset_type: 'stock',
      purchase_currency: 'USD',
      trading_currency: 'USD',
    })
    .select()
    .single();
  if (legacyErr || !legacyHolding) throw new Error(`legacy setup failed: ${legacyErr?.message}`);

  const backfillTopUp = await addOrUpdateHolding(TEST_USER_ID, {
    symbol: 'ZZLEGACY',
    company_name: 'Verify Backfill Co',
    quantity: 8,
    avg_price: 60,
    date_purchased: '2026-08-01',
    asset_type: 'stock',
  } as never);
  if (!backfillTopUp.success || !backfillTopUp.holding) throw new Error(`backfill top-up failed: ${backfillTopUp.error}`);
  assertEqual(backfillTopUp.holding.quantity, 28, 'blended quantity after backfill top-up');

  await new Promise((r) => setTimeout(r, 500));
  const afterBackfill = await getHoldingPurchases(TEST_USER_ID);
  const legacyLots = afterBackfill.purchases?.filter((p) => p.holding_id === legacyHolding.id) ?? [];
  assertEqual(legacyLots.length, 2, 'two lots after backfill top-up (synthesized original + new)');
  const originalLot = legacyLots.find((p) => p.price === 50);
  assertEqual(originalLot?.quantity, 20, 'backfilled original lot quantity');
  assertEqual(originalLot?.purchase_date, '2025-01-10', 'backfilled original lot date');
  const newLot = legacyLots.find((p) => p.price === 60);
  assertEqual(newLot?.quantity, 8, 'new top-up lot quantity');

  // Second top-up on the now-backfilled holding must NOT re-backfill.
  const secondTopUp = await addOrUpdateHolding(TEST_USER_ID, {
    symbol: 'ZZLEGACY',
    company_name: 'Verify Backfill Co',
    quantity: 2,
    avg_price: 70,
    date_purchased: '2026-08-10',
  } as never);
  if (!secondTopUp.success) throw new Error(`second top-up failed: ${secondTopUp.error}`);
  await new Promise((r) => setTimeout(r, 500));
  const afterSecondTopUp = await getHoldingPurchases(TEST_USER_ID);
  const legacyLotsFinal = afterSecondTopUp.purchases?.filter((p) => p.holding_id === legacyHolding.id) ?? [];
  assertEqual(legacyLotsFinal.length, 3, 'three lots total, no duplicate backfill on second top-up');

  await removeHolding(TEST_USER_ID, legacyHolding.id);

  console.log('ALL ASSERTIONS PASSED');
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 7: Run it**

```bash
npx tsx scripts/_verify-holding-purchases.ts
```
Expected output: a `PASS ...` line for each of the 13 `assertEqual` checks, followed by `ALL ASSERTIONS PASSED`, exit code 0. Any `FAIL ...` line or thrown error means the task is not done — fix the implementation, not the script.

- [ ] **Step 8: Delete the throwaway script**

```bash
rm scripts/_verify-holding-purchases.ts
```

- [ ] **Step 9: Commit**

```bash
git add lib/holdings/holdings-db.ts
git commit -m "feat: record purchase lots in addHolding/addOrUpdateHolding, with lazy backfill"
```

---

### Task 4: Server action — `getHoldingPurchasesAction`

**Files:**
- Modify: `app/actions/holdings.ts`

**Interfaces:**
- Consumes: `getHoldingPurchases` from `@/lib/holdings/holdings-db` (Task 3); `HoldingPurchase` from `@/lib/types/database` (Task 2).
- Produces: `getHoldingPurchasesAction(): Promise<{ success: boolean; purchases?: HoldingPurchase[]; error?: string }>`. Task 5 imports this.

- [ ] **Step 1: Update the import lines**

Change:
```ts
import { getHoldings, addHolding, addOrUpdateHolding, updateHolding, removeHolding, updateHoldingBySymbol, removeHoldingBySymbol, sellHolding, getHoldingSales, deleteHoldingSale, updateHoldingSale } from '@/lib/holdings/holdings-db';
import type { UserHolding, HoldingSale } from '@/lib/types/database';
```
to:
```ts
import { getHoldings, addHolding, addOrUpdateHolding, updateHolding, removeHolding, updateHoldingBySymbol, removeHoldingBySymbol, sellHolding, getHoldingSales, deleteHoldingSale, updateHoldingSale, getHoldingPurchases } from '@/lib/holdings/holdings-db';
import type { UserHolding, HoldingSale, HoldingPurchase } from '@/lib/types/database';
```

- [ ] **Step 2: Add the action, immediately after `getHoldingSalesAction`**

```ts
/**
 * Server Action: Get all recorded purchase lots for a user.
 * userId from session only — never trust client-provided userId.
 */
export async function getHoldingPurchasesAction(): Promise<{
  success: boolean;
  purchases?: HoldingPurchase[];
  error?: string;
}> {
  const userId = await getCurrentUserId();
  if (!userId) return { success: false, error: 'Authentication required' };
  return await getHoldingPurchases(userId);
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit app/actions/holdings.ts 2>&1 | head -20`
Expected: no errors mentioning `getHoldingPurchasesAction`.

- [ ] **Step 4: Commit**

```bash
git add app/actions/holdings.ts
git commit -m "feat: add getHoldingPurchasesAction server action"
```

---

### Task 5: TanStack Query hook — `useHoldingPurchases`

**Files:**
- Modify: `hooks/use-holdings.ts`

**Interfaces:**
- Consumes: `getHoldingPurchasesAction` from `@/app/actions/holdings` (Task 4); `HoldingPurchase` from `@/lib/types/database` (Task 2).
- Produces: `useHoldingPurchases()` — same shape as `useHoldingSales()`, `queryKey: ['holding-purchases', user?.id]`. Task 7 (chart wiring) and Task 8 (AddPurchaseModal preview) consume this.

- [ ] **Step 1: Update the import lines**

Add `getHoldingPurchasesAction` to the existing action import list (alongside `addOrUpdateHoldingAction` etc. — same import statement `useHoldingSales` already pulls `getHoldingSalesAction` from), and add `HoldingPurchase` to whichever type import brings in `HoldingSale`.

- [ ] **Step 2: Add the hook, immediately after `useHoldingSales`**

```ts
/**
 * TanStack Query hook to fetch all recorded purchase lots for the current user.
 */
export function useHoldingPurchases() {
  const { user, isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ['holding-purchases', user?.id],
    queryFn: async (): Promise<HoldingPurchase[]> => {
      if (!isAuthenticated || !user) throw new Error('Authentication required');
      const result = await getHoldingPurchasesAction();
      if (result.success && result.purchases) return result.purchases;
      throw new Error(result.error || 'Failed to fetch purchases');
    },
    enabled: isAuthenticated && !!user,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit hooks/use-holdings.ts 2>&1 | head -20`
Expected: no errors mentioning `useHoldingPurchases`.

- [ ] **Step 4: Commit**

```bash
git add hooks/use-holdings.ts
git commit -m "feat: add useHoldingPurchases hook"
```

---

### Task 6: `transaction-markers.ts` — plot one dot per lot

**Files:**
- Modify: `lib/holdings/transaction-markers.ts`

**Interfaces:**
- Consumes: nothing new (pure function, no imports added).
- Produces: `PurchaseMarkerInput` interface; `buildTransactionMarkers` gains a third, optional `purchases` parameter. Task 7 imports `PurchaseMarkerInput` and passes real data as the third argument at both call sites.

- [ ] **Step 1: Add the type and update the function**

Replace the whole file with:

```ts
/**
 * Derives buy/sell chart markers from a user's holding + sale/purchase
 * history for one ticker. Shared by both chart surfaces (the main stock-page
 * chart and the fullscreen advanced chart) so the "what counts as a trade"
 * rule lives in exactly one place.
 *
 * Buy data prefers per-lot history from `holding_purchases` (one row per
 * discrete purchase event) when any exists. If none exist — a
 * brokerage-synced holding, or a manual holding never topped up since lot
 * recording shipped — falls back to the single legacy dot from
 * `date_purchased`/`avg_price` on `user_holdings`. Sells are always full
 * fidelity — one `holding_sales` row per sale, each with its own
 * date/price/quantity.
 */

export interface TransactionMarkerInput {
  date_purchased: string | null;
  avg_price: number | null;
  quantity: number | null;
}

export interface SaleMarkerInput {
  sale_date: string;
  sale_price: number;
  quantity_sold: number;
}

export interface PurchaseMarkerInput {
  purchase_date: string;
  price: number;
  quantity: number;
}

export interface TransactionMarker {
  /** Unix seconds, midday UTC — matches how earnings markers stamp a date-only value. */
  tsSeconds: number;
  price: number;
  kind: 'buy' | 'sell';
  quantity: number | null;
  /** ISO date (YYYY-MM-DD), for display. */
  dateStr: string;
}

function dateToTsSeconds(isoDate: string): number {
  return Math.floor(new Date(`${isoDate}T12:00:00Z`).getTime() / 1000);
}

export function buildTransactionMarkers(
  holding: TransactionMarkerInput | undefined,
  sales: SaleMarkerInput[],
  purchases: PurchaseMarkerInput[] = []
): TransactionMarker[] {
  const markers: TransactionMarker[] = [];
  if (purchases.length > 0) {
    for (const p of purchases) {
      markers.push({
        tsSeconds: dateToTsSeconds(p.purchase_date),
        price: p.price,
        kind: 'buy',
        quantity: p.quantity,
        dateStr: p.purchase_date,
      });
    }
  } else if (holding?.date_purchased && holding.avg_price != null) {
    markers.push({
      tsSeconds: dateToTsSeconds(holding.date_purchased),
      price: holding.avg_price,
      kind: 'buy',
      quantity: holding.quantity,
      dateStr: holding.date_purchased,
    });
  }
  for (const s of sales) {
    markers.push({
      tsSeconds: dateToTsSeconds(s.sale_date),
      price: s.sale_price,
      kind: 'sell',
      quantity: s.quantity_sold,
      dateStr: s.sale_date,
    });
  }
  return markers.sort((a, b) => a.tsSeconds - b.tsSeconds);
}
```

- [ ] **Step 2: Write a throwaway verification script**

Create `scripts/_verify-transaction-markers.ts` (temporary — delete after running):

```ts
import { buildTransactionMarkers } from '../lib/holdings/transaction-markers';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  console.log(`PASS ${label}`);
}

// No purchases recorded: falls back to the legacy single dot.
const legacy = buildTransactionMarkers(
  { date_purchased: '2026-01-01', avg_price: 115.86, quantity: 15 },
  []
);
assertEqual(legacy.length, 1, 'legacy fallback: one marker');
assertEqual(legacy[0].price, 115.86, 'legacy fallback: blended price');

// Purchases recorded: one dot per lot, legacy fields ignored.
const multiLot = buildTransactionMarkers(
  { date_purchased: '2026-01-01', avg_price: 115.86, quantity: 15 },
  [],
  [
    { purchase_date: '2026-01-01', price: 137, quantity: 10 },
    { purchase_date: '2026-03-15', price: 94, quantity: 5 },
  ]
);
assertEqual(multiLot.length, 2, 'multi-lot: two markers');
assertEqual(multiLot[0].price, 137, 'multi-lot: first dot at its own real price');
assertEqual(multiLot[1].price, 94, 'multi-lot: second dot at its own real price');
assertEqual(multiLot.every((m) => m.kind === 'buy'), true, 'multi-lot: both are buy markers');

// Sells still interleave correctly with lots.
const withSale = buildTransactionMarkers(
  undefined,
  [{ sale_date: '2026-02-01', sale_price: 150, quantity_sold: 3 }],
  [{ purchase_date: '2026-01-01', price: 137, quantity: 10 }]
);
assertEqual(withSale.length, 2, 'lots + sale: two markers');
assertEqual(withSale[0].kind, 'buy', 'lots + sale: chronological order, buy first');
assertEqual(withSale[1].kind, 'sell', 'lots + sale: sell second');

console.log('ALL ASSERTIONS PASSED');
```

- [ ] **Step 3: Run it**

```bash
npx tsx scripts/_verify-transaction-markers.ts
```
Expected: 8 `PASS` lines, then `ALL ASSERTIONS PASSED`, exit code 0.

- [ ] **Step 4: Delete the throwaway script**

```bash
rm scripts/_verify-transaction-markers.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/holdings/transaction-markers.ts
git commit -m "feat: plot one chart dot per purchase lot instead of a single blended dot"
```

---

### Task 7: Wire purchases into both chart surfaces

**Files:**
- Modify: `components/stock/StockPricePanel.tsx`
- Modify: `components/stock/advanced-chart/AdvancedChartModal.tsx`

**Interfaces:**
- Consumes: `useHoldingPurchases` from `@/hooks/use-holdings` (Task 5); `PurchaseMarkerInput` from `@/lib/holdings/transaction-markers` (Task 6).
- Produces: `AdvancedChartModal`'s `Props` gains `purchases?: PurchaseMarkerInput[]`.

- [ ] **Step 1: `StockPricePanel.tsx` — fetch and scope purchases to this ticker**

Change the import at line 28 from:
```ts
import { useHoldings, useHoldingSales } from '@/hooks/use-holdings';
```
to:
```ts
import { useHoldings, useHoldingSales, useHoldingPurchases } from '@/hooks/use-holdings';
```

Change lines 287-293 from:
```ts
  const { data: allHoldings } = useHoldings();
  const { data: allSales } = useHoldingSales();
  const myHolding = allHoldings?.find((h) => h.symbol.toUpperCase() === ticker.toUpperCase());
  const mySales = useMemo(
    () => allSales?.filter((s) => s.symbol.toUpperCase() === ticker.toUpperCase()) ?? [],
    [allSales, ticker]
  );
```
to:
```ts
  const { data: allHoldings } = useHoldings();
  const { data: allSales } = useHoldingSales();
  const { data: allPurchases } = useHoldingPurchases();
  const myHolding = allHoldings?.find((h) => h.symbol.toUpperCase() === ticker.toUpperCase());
  const mySales = useMemo(
    () => allSales?.filter((s) => s.symbol.toUpperCase() === ticker.toUpperCase()) ?? [],
    [allSales, ticker]
  );
  const myPurchases = useMemo(
    () => allPurchases?.filter((p) => p.symbol.toUpperCase() === ticker.toUpperCase()) ?? [],
    [allPurchases, ticker]
  );
```

- [ ] **Step 2: Pass purchases into the inline marker builder**

Change (around line 430):
```ts
    return buildTransactionMarkers(myHolding, mySales)
```
to:
```ts
    return buildTransactionMarkers(myHolding, mySales, myPurchases)
```
And update that `useMemo`'s dependency array (around line 441) from:
```ts
  }, [prefs.showTransactions, myHolding, mySales, chartDisplayData]);
```
to:
```ts
  }, [prefs.showTransactions, myHolding, mySales, myPurchases, chartDisplayData]);
```

- [ ] **Step 3: Pass purchases into `AdvancedChartModal`**

Change (around line 856-857):
```ts
          holding={myHolding ? { date_purchased: myHolding.date_purchased, avg_price: myHolding.avg_price, quantity: myHolding.quantity } : undefined}
          sales={mySales}
```
to:
```ts
          holding={myHolding ? { date_purchased: myHolding.date_purchased, avg_price: myHolding.avg_price, quantity: myHolding.quantity } : undefined}
          sales={mySales}
          purchases={myPurchases}
```

- [ ] **Step 4: `AdvancedChartModal.tsx` — accept and use the new prop**

Change the import at lines 15-19 from:
```ts
import {
  buildTransactionMarkers,
  type TransactionMarkerInput,
  type SaleMarkerInput,
} from '@/lib/holdings/transaction-markers';
```
to:
```ts
import {
  buildTransactionMarkers,
  type TransactionMarkerInput,
  type SaleMarkerInput,
  type PurchaseMarkerInput,
} from '@/lib/holdings/transaction-markers';
```

Change the `Props` interface (around line 85-88) from:
```ts
  /** This user's holding/sales for `ticker`, already scoped by the caller. */
  holding?: TransactionMarkerInput;
  sales: SaleMarkerInput[];
}
```
to:
```ts
  /** This user's holding/sales/purchases for `ticker`, already scoped by the caller. */
  holding?: TransactionMarkerInput;
  sales: SaleMarkerInput[];
  purchases?: PurchaseMarkerInput[];
}
```

Change the destructured props (around line 94) from:
```ts
  showVolume, onToggleVolume, showEvents, onToggleEvents, showTransactions, onToggleTransactions, holding, sales,
}: Props) {
```
to:
```ts
  showVolume, onToggleVolume, showEvents, onToggleEvents, showTransactions, onToggleTransactions, holding, sales, purchases = [],
}: Props) {
```

Change the `transactions` memo (around lines 189-192) from:
```ts
  const transactions = useMemo(() => {
    if (!showTransactions) return undefined;
    return buildTransactionMarkers(holding, sales).map((m) => ({ ts: m.tsSeconds, kind: m.kind }));
  }, [showTransactions, holding, sales]);
```
to:
```ts
  const transactions = useMemo(() => {
    if (!showTransactions) return undefined;
    return buildTransactionMarkers(holding, sales, purchases).map((m) => ({ ts: m.tsSeconds, kind: m.kind }));
  }, [showTransactions, holding, sales, purchases]);
```

- [ ] **Step 5: Verify it compiles and lints**

Run: `npm run lint`
Expected: 0 errors (pre-existing warnings elsewhere are fine).

- [ ] **Step 6: Commit**

```bash
git add components/stock/StockPricePanel.tsx components/stock/advanced-chart/AdvancedChartModal.tsx
git commit -m "feat: wire purchase lots into both chart surfaces"
```

---

### Task 8: `AddPurchaseModal` component

**Files:**
- Create: `components/holdings/AddPurchaseModal.tsx`

**Interfaces:**
- Consumes: `useAddOrUpdateHolding` from `@/hooks/use-holdings` (existing); `useAuth` from `@/hooks/use-auth` (existing); `UserHolding` from `@/lib/types/database`; `CurrencyCode` from `@/lib/currency/currency-conversion`.
- Produces: `AddPurchaseModal` component, props `{ open: boolean; onOpenChange: (open: boolean) => void; holding: UserHolding | null; currentPriceUSD?: number }` — same shape as `SellHoldingModal`. Task 9 renders it.

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { useEffect, useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { useAddOrUpdateHolding } from '@/hooks/use-holdings';
import { useAuth } from '@/hooks/use-auth';
import type { UserHolding } from '@/lib/types/database';
import type { CurrencyCode } from '@/lib/currency/currency-conversion';
import { logger } from '@/lib/utils/logger';

interface AddPurchaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holding: UserHolding | null;
  /** Live market price in USD, if available — prefills the purchase price field. */
  currentPriceUSD?: number;
}

export function AddPurchaseModal({ open, onOpenChange, holding, currentPriceUSD }: AddPurchaseModalProps) {
  const { user } = useAuth();
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [saved, setSaved] = useState(false);
  const addOrUpdateHolding = useAddOrUpdateHolding();

  const userCurrency = useMemo((): CurrencyCode => {
    const settings = (user?.settings as Record<string, unknown>) ?? {};
    const c = settings.default_currency as string | undefined;
    if (!c || c === 'exchange') return 'USD';
    return c as CurrencyCode;
  }, [user]);

  const { data: historicalRateData } = useQuery({
    queryKey: ['historical-fx', purchaseDate, userCurrency],
    queryFn: async () => {
      const res = await fetch(`/api/currency/rates/historical?date=${purchaseDate}`);
      if (!res.ok) return null;
      const data = await res.json();
      const rate = data.rates?.[userCurrency] as number | undefined;
      return rate ?? null;
    },
    enabled: !!purchaseDate && userCurrency !== 'USD' && open,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000,
  });

  useEffect(() => {
    // Same deliberate omission of currentPriceUSD from deps as SellHoldingModal:
    // this page has a live price feed, so currentPriceUSD ticks every few
    // seconds while the modal is open. Populate once per open+holding only.
    if (holding && open) {
      setQuantity('');
      setPrice(currentPriceUSD != null ? String(currentPriceUSD) : '');
      setPurchaseDate(new Date().toISOString().slice(0, 10));
      setSaved(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentPriceUSD intentionally excluded, see comment above
  }, [holding, open]);

  if (!holding) return null;

  const heldQty = holding.quantity ?? 0;
  const qtyNum = parseFloat(quantity) || 0;
  const priceNum = parseFloat(price) || 0;
  const newQuantity = heldQty + qtyNum;
  const newAvgPrice =
    qtyNum > 0 && priceNum > 0
      ? holding.avg_price != null && heldQty > 0
        ? (heldQty * holding.avg_price + qtyNum * priceNum) / newQuantity
        : priceNum
      : holding.avg_price;
  const canSubmit = qtyNum > 0 && priceNum > 0 && !!purchaseDate;

  const handleClose = () => {
    setQuantity('');
    setSaved(false);
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    try {
      await addOrUpdateHolding.mutateAsync({
        symbol: holding.symbol,
        company_name: holding.company_name,
        quantity: qtyNum,
        avg_price: priceNum,
        date_purchased: purchaseDate,
        asset_type: holding.asset_type,
        purchase_currency: userCurrency,
        purchase_fx_rate: historicalRateData ?? (userCurrency !== 'USD' ? null : 1),
        trading_currency: holding.trading_currency,
      });
      setSaved(true);
      setTimeout(handleClose, 1000);
    } catch (error) {
      logger.error('Error adding purchase', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add purchase — {holding.symbol}</DialogTitle>
          <DialogDescription>
            You hold {heldQty} shares of {holding.company_name} at an average cost of{' '}
            {holding.avg_price != null ? `$${holding.avg_price.toFixed(2)}` : '—'}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="purchase-quantity">Shares purchased</Label>
            <Input
              id="purchase-quantity"
              type="number"
              step="0.000001"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="purchase-price">Price per share (USD)</Label>
            <Input
              id="purchase-price"
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="purchase-date">Purchase date</Label>
            <DatePicker
              id="purchase-date"
              max={new Date().toISOString().slice(0, 10)}
              value={purchaseDate}
              onChange={setPurchaseDate}
            />
          </div>

          {qtyNum > 0 && priceNum > 0 && (
            <p className="text-sm text-muted-foreground">
              New position: {newQuantity} shares at ${newAvgPrice?.toFixed(2)} average
            </p>
          )}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit || addOrUpdateHolding.isPending || saved}
              className={saved ? 'bg-emerald-600 hover:bg-emerald-600 text-white' : ''}
            >
              {saved
                ? <><Check className="h-4 w-4 mr-1.5" />Added!</>
                : addOrUpdateHolding.isPending ? 'Adding...' : 'Add Purchase'}
            </Button>
          </div>

          {addOrUpdateHolding.isError && (
            <div className="text-sm text-red-600 dark:text-red-400">
              {addOrUpdateHolding.error instanceof Error ? addOrUpdateHolding.error.message : 'Failed to add purchase'}
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit components/holdings/AddPurchaseModal.tsx 2>&1 | head -30`
Expected: no errors mentioning `AddPurchaseModal`.

- [ ] **Step 3: Commit**

```bash
git add components/holdings/AddPurchaseModal.tsx
git commit -m "feat: add AddPurchaseModal component"
```

---

### Task 9: Wire "Add purchase" into `HoldingsTable`

**Files:**
- Modify: `components/holdings/HoldingsTable.tsx`

**Interfaces:**
- Consumes: `AddPurchaseModal` from `./AddPurchaseModal` (Task 8).
- Produces: nothing new consumed by later tasks — this is a leaf UI wiring task.

- [ ] **Step 1: Add the import and icon**

Change:
```ts
import { SellHoldingModal } from './SellHoldingModal';
```
to:
```ts
import { SellHoldingModal } from './SellHoldingModal';
import { AddPurchaseModal } from './AddPurchaseModal';
```

Change the lucide-react import line (currently `import { Trash2, Edit2, DollarSign, ArrowUpRight, ArrowDownRight, Plus, Search, X, Loader2, Upload, Download } from 'lucide-react';`) to add `PlusCircle`:
```ts
import { Trash2, Edit2, DollarSign, PlusCircle, ArrowUpRight, ArrowDownRight, Plus, Search, X, Loader2, Upload, Download } from 'lucide-react';
```

- [ ] **Step 2: Extend `HoldingRowProps` and `HoldingRow`**

Change the `HoldingRowProps` interface (add after `onSell`):
```ts
  onSell: (h: HoldingWithPrice) => void;
  onAddPurchase: (h: HoldingWithPrice) => void;
}
```

Change the `HoldingRow` destructured params (add after `onSell,`):
```ts
  onSell,
  onAddPurchase,
}: HoldingRowProps) {
```

- [ ] **Step 3: Add the desktop row button**

Change the desktop actions cell — insert a new button between the existing Sell button and the Remove button:
```tsx
          {holding.source === 'manual' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSell(holding)}
              disabled={anyPending}
              title="Sell shares"
            >
              <DollarSign className="h-4 w-4" />
            </Button>
          )}
```
to:
```tsx
          {holding.source === 'manual' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSell(holding)}
              disabled={anyPending}
              title="Sell shares"
            >
              <DollarSign className="h-4 w-4" />
            </Button>
          )}
          {holding.source === 'manual' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAddPurchase(holding)}
              disabled={anyPending}
              title="Add purchase"
            >
              <PlusCircle className="h-4 w-4" />
            </Button>
          )}
```

- [ ] **Step 4: Add the mobile row button**

Change:
```tsx
                    {holding.source === 'manual' && (
                      <button onClick={() => handleSellRow(holding)} disabled={removeHolding.isPending} title="Sell shares" className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground">
                        <DollarSign className="h-4 w-4" />
                      </button>
                    )}
```
to:
```tsx
                    {holding.source === 'manual' && (
                      <button onClick={() => handleSellRow(holding)} disabled={removeHolding.isPending} title="Sell shares" className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground">
                        <DollarSign className="h-4 w-4" />
                      </button>
                    )}
                    {holding.source === 'manual' && (
                      <button onClick={() => handleAddPurchaseRow(holding)} disabled={removeHolding.isPending} title="Add purchase" className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground">
                        <PlusCircle className="h-4 w-4" />
                      </button>
                    )}
```

- [ ] **Step 5: Add state and handler in the parent component**

Change:
```ts
  const [sellingHolding, setSellingHolding] = useState<UserHolding | null>(null);
  const [isSellModalOpen, setIsSellModalOpen] = useState(false);
```
to:
```ts
  const [sellingHolding, setSellingHolding] = useState<UserHolding | null>(null);
  const [isSellModalOpen, setIsSellModalOpen] = useState(false);
  const [addingPurchaseHolding, setAddingPurchaseHolding] = useState<UserHolding | null>(null);
  const [isAddPurchaseModalOpen, setIsAddPurchaseModalOpen] = useState(false);
```

Change:
```ts
  const handleSellRow = useCallback((h: HoldingWithPrice) => {
    setSellingHolding(h as unknown as UserHolding);
    setIsSellModalOpen(true);
  }, []);
```
to:
```ts
  const handleSellRow = useCallback((h: HoldingWithPrice) => {
    setSellingHolding(h as unknown as UserHolding);
    setIsSellModalOpen(true);
  }, []);
  const handleAddPurchaseRow = useCallback((h: HoldingWithPrice) => {
    setAddingPurchaseHolding(h as unknown as UserHolding);
    setIsAddPurchaseModalOpen(true);
  }, []);
```

- [ ] **Step 6: Pass the handler down to `HoldingRow`**

Change:
```tsx
                  onSell={handleSellRow}
                />
```
to:
```tsx
                  onSell={handleSellRow}
                  onAddPurchase={handleAddPurchaseRow}
                />
```

- [ ] **Step 7: Render the modal**

Change:
```tsx
      <SellHoldingModal
        open={isSellModalOpen}
        onOpenChange={setIsSellModalOpen}
        holding={sellingHolding}
        currentPriceUSD={sellingHolding ? holdingsWithPrices.find((h) => h.id === sellingHolding.id)?.currentPriceUSD : undefined}
      />
```
to:
```tsx
      <SellHoldingModal
        open={isSellModalOpen}
        onOpenChange={setIsSellModalOpen}
        holding={sellingHolding}
        currentPriceUSD={sellingHolding ? holdingsWithPrices.find((h) => h.id === sellingHolding.id)?.currentPriceUSD : undefined}
      />
      <AddPurchaseModal
        open={isAddPurchaseModalOpen}
        onOpenChange={setIsAddPurchaseModalOpen}
        holding={addingPurchaseHolding}
        currentPriceUSD={addingPurchaseHolding ? holdingsWithPrices.find((h) => h.id === addingPurchaseHolding.id)?.currentPriceUSD : undefined}
      />
```

- [ ] **Step 8: Verify it lints**

Run: `npm run lint`
Expected: 0 errors.

- [ ] **Step 9: Commit**

```bash
git add components/holdings/HoldingsTable.tsx
git commit -m "feat: wire Add Purchase action into HoldingsTable"
```

---

### Task 10: `AddHoldingModal` — Single/Multiple purchase pill

**Files:**
- Modify: `components/holdings/AddHoldingModal.tsx`

**Interfaces:**
- Consumes: `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` from `@/components/ui/tabs` (existing shadcn component); `useAddOrUpdateHolding` from `@/hooks/use-holdings` (existing).
- Produces: nothing new consumed by later tasks — this is the final UI piece.

- [ ] **Step 1: Add imports**

Change:
```ts
import { useAddHolding } from '@/hooks/use-holdings';
```
to:
```ts
import { useAddHolding, useAddOrUpdateHolding } from '@/hooks/use-holdings';
```

Add, alongside the other `@/components/ui/*` imports:
```ts
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
```

- [ ] **Step 2: Add mode + multi-row state**

Change:
```ts
  const [quantity, setQuantity] = useState('');
  const [avgPrice, setAvgPrice] = useState('');
  const [datePurchased, setDatePurchased] = useState('');
  const [quantityError, setQuantityError] = useState('');
  const [avgPriceError, setAvgPriceError] = useState('');
```
to:
```ts
  const [mode, setMode] = useState<'single' | 'multiple'>('single');
  const [quantity, setQuantity] = useState('');
  const [avgPrice, setAvgPrice] = useState('');
  const [datePurchased, setDatePurchased] = useState('');
  const [quantityError, setQuantityError] = useState('');
  const [avgPriceError, setAvgPriceError] = useState('');
  interface PurchaseRow {
    quantity: string;
    price: string;
    date: string;
  }
  const [purchaseRows, setPurchaseRows] = useState<PurchaseRow[]>([{ quantity: '', price: '', date: '' }]);
  const [multiError, setMultiError] = useState('');
  const addOrUpdateHolding = useAddOrUpdateHolding();

  const addPurchaseRow = () => setPurchaseRows((rows) => [...rows, { quantity: '', price: '', date: '' }]);
  const removePurchaseRow = (index: number) => setPurchaseRows((rows) => rows.filter((_, i) => i !== index));
  const updatePurchaseRow = (index: number, field: keyof PurchaseRow, value: string) =>
    setPurchaseRows((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));

  const multiTotals = useMemo(() => {
    let totalQty = 0;
    let totalCost = 0;
    for (const row of purchaseRows) {
      const q = parseFloat(row.quantity) || 0;
      const p = parseFloat(row.price) || 0;
      totalQty += q;
      totalCost += q * p;
    }
    return { totalQty, avgPrice: totalQty > 0 ? totalCost / totalQty : 0 };
  }, [purchaseRows]);
```

- [ ] **Step 3: Wrap the existing three fields in a `Tabs`, add the "Multiple purchases" panel**

Change the block from `{/* Quantity (Optional) */}` through the end of the `{/* Date Purchased (Optional) */}` block (currently lines 279-344) — wrap it in `Tabs`/`TabsContent value="single"`, and add a sibling `TabsContent value="multiple"`:

```tsx
          <Tabs value={mode} onValueChange={(v) => setMode(v as 'single' | 'multiple')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="single">Single purchase</TabsTrigger>
              <TabsTrigger value="multiple">Multiple purchases</TabsTrigger>
            </TabsList>

            <TabsContent value="single" className="space-y-6 pt-4">
              {/* Quantity (Optional) */}
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity (Optional)</Label>
                <Input
                  id="quantity"
                  type="number"
                  step="0.01"
                  placeholder="e.g., 10"
                  value={quantity}
                  onChange={(e) => {
                    setQuantity(e.target.value);
                    if (quantityError) setQuantityError(validateQuantity(e.target.value));
                  }}
                  onBlur={(e) => setQuantityError(validateQuantity(e.target.value))}
                  aria-invalid={!!quantityError}
                  className={quantityError ? 'border-destructive focus-visible:ring-destructive' : ''}
                />
                {quantityError && (
                  <p className="text-xs text-destructive">{quantityError}</p>
                )}
              </div>

              {/* Average Price (Optional) */}
              <div className="space-y-2">
                <Label htmlFor="avg-price">Average Price (Optional)</Label>
                <Input
                  id="avg-price"
                  type="number"
                  step="0.01"
                  placeholder="e.g., 150.00"
                  value={avgPrice}
                  onChange={(e) => {
                    setAvgPrice(e.target.value);
                    if (avgPriceError) setAvgPriceError(validateAvgPrice(e.target.value));
                  }}
                  onBlur={(e) => setAvgPriceError(validateAvgPrice(e.target.value))}
                  aria-invalid={!!avgPriceError}
                  className={avgPriceError ? 'border-destructive focus-visible:ring-destructive' : ''}
                />
                {avgPriceError && (
                  <p className="text-xs text-destructive">{avgPriceError}</p>
                )}
              </div>

              {/* Date Purchased (Optional) */}
              <div className="space-y-2">
                <Label htmlFor="date-purchased">Date Purchased (Optional)</Label>
                <DatePicker
                  id="date-purchased"
                  max={new Date().toISOString().slice(0, 10)}
                  value={datePurchased}
                  onChange={setDatePurchased}
                  placeholder="Select a date"
                />
                {datePurchased && userCurrency !== 'USD' ? (
                  <p className="text-xs text-muted-foreground">
                    {historicalRateData
                      ? `Rate on ${datePurchased}: 1 USD = ${historicalRateData.toFixed(4)} ${userCurrency} — used for FX-adjusted P/L`
                      : `Looking up USD/${userCurrency} rate for ${datePurchased}…`}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Used to chart your P/L from the day you opened this position.
                  </p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="multiple" className="space-y-4 pt-4">
              {purchaseRows.map((row, i) => (
                <div key={i} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Purchase {i + 1}</Label>
                    {purchaseRows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removePurchaseRow(i)}
                        className="text-xs text-muted-foreground hover:text-destructive"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Shares"
                      value={row.quantity}
                      onChange={(e) => updatePurchaseRow(i, 'quantity', e.target.value)}
                    />
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Price"
                      value={row.price}
                      onChange={(e) => updatePurchaseRow(i, 'price', e.target.value)}
                    />
                    <DatePicker
                      max={new Date().toISOString().slice(0, 10)}
                      value={row.date}
                      onChange={(v) => updatePurchaseRow(i, 'date', v)}
                      placeholder="Date"
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={addPurchaseRow}
                className="w-full rounded-lg border border-dashed border-border/60 py-2 text-sm text-muted-foreground hover:border-primary/50 hover:text-primary"
              >
                + Add another purchase
              </button>
              {multiTotals.totalQty > 0 && (
                <p className="text-sm text-muted-foreground">
                  Total: {multiTotals.totalQty} shares at ${multiTotals.avgPrice.toFixed(2)} average
                </p>
              )}
              {multiError && <p className="text-xs text-destructive">{multiError}</p>}
            </TabsContent>
          </Tabs>
```

- [ ] **Step 4: Branch `handleSubmit` on `mode`**

Change:
```ts
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedStock) return;

    // Run validation before submitting
    const qErr = validateQuantity(quantity);
    const pErr = validateAvgPrice(avgPrice);
    setQuantityError(qErr);
    setAvgPriceError(pErr);
    if (qErr || pErr) return;

    try {
      const assetType = inferAssetType(selectedStock.ticker, selectedStock.instrument_type);
      const input: AddHoldingInput = {
        symbol: selectedStock.ticker,
        company_name: selectedStock.name,
        quantity: quantity ? parseFloat(quantity) : null,
        avg_price: avgPrice ? parseFloat(avgPrice) : null,
        date_purchased: datePurchased || null,
        asset_type: assetType === 'unknown' ? 'stock' : assetType,
        purchase_currency: userCurrency,
        purchase_fx_rate: historicalRateData ?? (userCurrency !== 'USD' ? null : 1),
        // The asset's listing currency — what avg_price is denominated in (USD/NOK/EUR…).
        trading_currency: selectedStock.currency ?? null,
      };

      await addHolding.mutateAsync(input);

      // Reset form
      setSelectedStock(null);
      setSearchQuery('');
      setQuantity('');
      setAvgPrice('');
      setDatePurchased('');
      onOpenChange(false);
    } catch (error) {
      console.error('Error adding holding:', error);
      // Error is handled by the mutation
    }
  };
```
to:
```ts
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedStock) return;

    const assetType = inferAssetType(selectedStock.ticker, selectedStock.instrument_type);

    if (mode === 'multiple') {
      setMultiError('');
      for (const row of purchaseRows) {
        const q = parseFloat(row.quantity) || 0;
        const p = parseFloat(row.price) || 0;
        if (q <= 0 || p <= 0 || !row.date) {
          setMultiError('Every purchase row needs a quantity, price, and date.');
          return;
        }
      }

      try {
        for (const row of purchaseRows) {
          const input: AddHoldingInput = {
            symbol: selectedStock.ticker,
            company_name: selectedStock.name,
            quantity: parseFloat(row.quantity),
            avg_price: parseFloat(row.price),
            date_purchased: row.date,
            asset_type: assetType === 'unknown' ? 'stock' : assetType,
            purchase_currency: userCurrency,
            purchase_fx_rate: userCurrency !== 'USD' ? null : 1,
            trading_currency: selectedStock.currency ?? null,
          };
          // Sequential, not Promise.all — the first call creates the holding,
          // every later call must see it already exist to merge into it.
          await addOrUpdateHolding.mutateAsync(input);
        }

        setSelectedStock(null);
        setSearchQuery('');
        setPurchaseRows([{ quantity: '', price: '', date: '' }]);
        onOpenChange(false);
      } catch (error) {
        console.error('Error adding holding (multiple purchases):', error);
      }
      return;
    }

    // Run validation before submitting
    const qErr = validateQuantity(quantity);
    const pErr = validateAvgPrice(avgPrice);
    setQuantityError(qErr);
    setAvgPriceError(pErr);
    if (qErr || pErr) return;

    try {
      const input: AddHoldingInput = {
        symbol: selectedStock.ticker,
        company_name: selectedStock.name,
        quantity: quantity ? parseFloat(quantity) : null,
        avg_price: avgPrice ? parseFloat(avgPrice) : null,
        date_purchased: datePurchased || null,
        asset_type: assetType === 'unknown' ? 'stock' : assetType,
        purchase_currency: userCurrency,
        purchase_fx_rate: historicalRateData ?? (userCurrency !== 'USD' ? null : 1),
        // The asset's listing currency — what avg_price is denominated in (USD/NOK/EUR…).
        trading_currency: selectedStock.currency ?? null,
      };

      await addHolding.mutateAsync(input);

      // Reset form
      setSelectedStock(null);
      setSearchQuery('');
      setQuantity('');
      setAvgPrice('');
      setDatePurchased('');
      onOpenChange(false);
    } catch (error) {
      console.error('Error adding holding:', error);
      // Error is handled by the mutation
    }
  };
```

- [ ] **Step 5: Reset multi-mode state on close**

Change `handleClose` from:
```ts
  const handleClose = () => {
    setSelectedStock(null);
    setSearchQuery('');
    setQuantity('');
    setAvgPrice('');
    setDatePurchased('');
    setQuantityError('');
    setAvgPriceError('');
    onOpenChange(false);
  };
```
to:
```ts
  const handleClose = () => {
    setSelectedStock(null);
    setSearchQuery('');
    setQuantity('');
    setAvgPrice('');
    setDatePurchased('');
    setQuantityError('');
    setAvgPriceError('');
    setMode('single');
    setPurchaseRows([{ quantity: '', price: '', date: '' }]);
    setMultiError('');
    onOpenChange(false);
  };
```

- [ ] **Step 6: Update the submit button's disabled/label logic**

Change:
```tsx
            <Button
              type="submit"
              disabled={!selectedStock || addHolding.isPending}
            >
              {addHolding.isPending ? 'Adding...' : 'Add Holding'}
            </Button>
```
to:
```tsx
            <Button
              type="submit"
              disabled={!selectedStock || addHolding.isPending || addOrUpdateHolding.isPending}
            >
              {(mode === 'multiple' ? addOrUpdateHolding.isPending : addHolding.isPending) ? 'Adding...' : 'Add Holding'}
            </Button>
```

- [ ] **Step 7: Verify it lints and compiles**

Run: `npm run lint`
Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add components/holdings/AddHoldingModal.tsx
git commit -m "feat: add Single/Multiple purchase pill to AddHoldingModal"
```

---

### Task 11: End-to-end verification pass

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Full lint pass**

Run: `npm run lint`
Expected: 0 errors.

- [ ] **Step 2: Start the dev server**

Run: `npm run dev` (background/separate terminal), confirm it serves at `http://localhost:3000`.

- [ ] **Step 3: Browser check — AddHoldingModal multi-purchase flow**

Using Playwright, log into `qa-test-agent@bullpen.no` / `MLMLP1XizKVI1GoUFbYTBEj8`, navigate to `/holdings`, click "Add holding", search for a ticker not already held (e.g. "AAPL"), select it, switch to the "Multiple purchases" pill, add a second row via "+ Add another purchase", fill both rows with distinct quantity/price/date, submit. Expected: modal closes, the new holding appears in the table with quantity = sum of both rows and avg price = the weighted average.

- [ ] **Step 4: Browser check — chart shows two dots**

Navigate to that ticker's stock page (`/stock/AAPL`), open chart preferences, ensure "Transactions" is enabled. Take a screenshot and visually confirm two distinct buy markers appear at the two different prices/dates entered in Step 3 (not one dot at the blended average).

- [ ] **Step 5: Browser check — "Add purchase" top-up flow**

Back on `/holdings`, click the new "Add purchase" (plus-circle) icon on that same holding, enter a third quantity/price/date, submit. Expected: the row's quantity/avg price update to include the third lot; a toast or inline confirmation appears (matching the existing Sell modal's "Sold!" pattern — this one should read "Added!").

- [ ] **Step 6: Browser check — chart now shows three dots**

Return to the stock page, refresh, confirm the chart now shows three buy markers.

- [ ] **Step 7: Clean up the test holding**

On `/holdings`, remove the AAPL test holding added in Step 3 (trash icon) so the QA account is left in its original seeded state (10 MSFT, 5 NVDA, 2 RDDT).

- [ ] **Step 8: Confirm no regression on the QA account's existing seeded holdings**

Navigate to `/stock/MSFT` (one of the QA account's original single-purchase holdings, never topped up). Confirm the chart still shows exactly one buy dot at the seeded avg price ($410.50) — the legacy fallback path in `buildTransactionMarkers` must still work unchanged for holdings with no recorded lots.

- [ ] **Step 9: Final commit (if Steps 1-8 required any fixes)**

If any of the above surfaced a bug, fix it, re-run the relevant step, then:
```bash
git add -A
git commit -m "fix: address issues found in holding-purchase-lots end-to-end verification"
```
If no fixes were needed, skip this step — nothing to commit.

---

## Self-Review

**Spec coverage:** Data model (Task 1-2), write paths + lazy backfill (Task 3), server action + hook (Task 4-5), chart marker changes + wiring (Task 6-7), `AddPurchaseModal` (Task 8), `HoldingsTable` wiring (Task 9), `AddHoldingModal` pill (Task 10). All spec sections have a corresponding task. Non-goals (lot editing, CSV import, FIFO/LIFO, SnapTrade, bulk migration) are correctly left untouched by every task above.

**Placeholder scan:** No TBD/TODO; every step has full code, not descriptions.

**Type consistency:** `HoldingPurchase`/`InsertHoldingPurchase` (Task 2) match the table columns (Task 1) and are used identically in Task 3's `recordHoldingPurchase`/`getHoldingPurchases`, Task 4's action, and Task 5's hook. `PurchaseMarkerInput` (Task 6) is the type Task 7 imports and populates from `HoldingPurchase` rows (structurally compatible: `purchase_date`/`price`/`quantity` all present on `HoldingPurchase`). `AddPurchaseModal`'s props (Task 8) match how Task 9 renders it. `addOrUpdateHolding`'s existing `AddHoldingInput` shape (unchanged) is what both Task 8 and Task 10's multi-mode submit against.
