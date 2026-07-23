# Holding Sales Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record sales of manually-entered holdings as durable events (not just edits to the aggregate row), and make the portfolio performance chart reconstruct history from those events so selling a position no longer rewrites the past.

**Architecture:** One new additive Supabase table (`holding_sales`) holds sale events with a snapshotted cost basis. A new `sellHolding` data-layer function inserts a sale row and decrements `user_holdings.quantity` (never touching `avg_price` — average-cost accounting means remaining shares' cost basis is unaffected by a sale). `PortfolioPerformanceChart` is extended to fetch sales alongside holdings and compute each symbol's contribution as `(price[t] − avg_price) × sharesStillHeldAt(t) + realizedGainLockedInAsOf(t)`, which collapses to today's exact formula for any symbol with no sales.

**Tech Stack:** Next.js App Router, Server Actions (not REST routes — this codebase has no `app/api/holdings/route.ts`; all holdings mutations go through `'use server'` actions in `app/actions/holdings.ts`), TanStack Query, Supabase Postgres + RLS, Recharts.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-23-holding-sales-design.md` — read it before starting; this plan implements it exactly.
- **No test framework exists in this repo** (`package.json` has no Jest/Vitest; CLAUDE.md: "One-off scripts (run with tsx via ts-node, no test framework)"). Every task below replaces "write a failing unit test" with either (a) a one-off `npx tsx` script that calls the real function against the dev Supabase project and prints its result, or (b) a direct SQL check via the Supabase MCP `execute_sql` tool, or (c) a Playwright browser check — whichever fits the task. Delete throwaway `npx tsx` scripts after use; don't leave them in the repo.
- Supabase project: `kgqpzuvhslqazurfrqya` (already linked; use `mcp__claude_ai_Supabase__apply_migration` for the migration, `mcp__claude_ai_Supabase__execute_sql` for verification queries).
- Follow existing patterns exactly: Server Actions in `app/actions/holdings.ts` call data-layer functions in `lib/holdings/holdings-db.ts`; hooks in `hooks/use-holdings.ts` wrap the actions with TanStack Query, invalidating `['holdings', user?.id]` and `['holdings-quotes']` on success (see `useRemoveHolding`, `hooks/use-holdings.ts:183-204`, for the exact shape to match).
- `npm run lint` must stay at 0 errors after every task (warnings pre-existing in the repo are fine — don't fix unrelated ones).
- Sell is manual-holdings-only: reject (server-side, not just UI) any sell attempt against a holding where `source !== 'manual'`.
- Average-cost accounting throughout: `realized_pl = (sale_price − avg_price_at_sale_time) × quantity_sold`. No FIFO/LIFO, no per-lot tracking — this is explicitly out of scope (see spec's Non-goals).

---

### Task 1: `holding_sales` table migration

**Files:**
- Create: `supabase/migrations/091_holding_sales.sql`

**Interfaces:**
- Produces: Postgres table `public.holding_sales` with columns `id, user_id, original_holding_id, symbol, company_name, quantity_sold, avg_cost_basis, sale_price, realized_pl, sale_date, trading_currency, asset_type, created_at`. Every later task in this plan reads/writes exactly these column names.

- [ ] **Step 1: Write the migration file**

```sql
-- 091_holding_sales.sql
-- Records a sell event against a manually-entered holding, independent of
-- user_holdings' current (mutable) state. This is what lets
-- PortfolioPerformanceChart reconstruct "what did I actually hold, and when"
-- instead of projecting today's quantity backward across all of history.
-- See docs/superpowers/specs/2026-07-23-holding-sales-design.md.

CREATE TABLE IF NOT EXISTS public.holding_sales (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_holding_id  UUID REFERENCES public.user_holdings(id) ON DELETE SET NULL,
  symbol               TEXT NOT NULL,
  company_name         TEXT NOT NULL,
  quantity_sold        NUMERIC NOT NULL CHECK (quantity_sold > 0),
  avg_cost_basis       NUMERIC NOT NULL,
  sale_price           NUMERIC NOT NULL,
  realized_pl          NUMERIC NOT NULL,
  sale_date            DATE NOT NULL,
  trading_currency     TEXT,
  asset_type           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_holding_sales_user_symbol
  ON public.holding_sales (user_id, symbol);
CREATE INDEX IF NOT EXISTS idx_holding_sales_user_date
  ON public.holding_sales (user_id, sale_date DESC);

ALTER TABLE public.holding_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own holding sales"
  ON public.holding_sales FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.holding_sales IS
  'Sell events against manually-entered holdings. Snapshots company_name/avg_cost_basis/trading_currency/asset_type so a sale record stays meaningful even if the originating user_holdings row is later hard-deleted.';
COMMENT ON COLUMN public.holding_sales.avg_cost_basis IS
  'user_holdings.avg_price at the moment of THIS sale — never re-read live, since avg_price keeps changing after future buys/sells.';
```

- [ ] **Step 2: Apply the migration**

Use the `mcp__claude_ai_Supabase__apply_migration` tool with `project_id: "kgqpzuvhslqazurfrqya"`, `name: "091_holding_sales"`, and `query` set to the SQL above (everything from `CREATE TABLE` through the last `COMMENT ON COLUMN`).

- [ ] **Step 3: Verify the table and policy exist**

Use `mcp__claude_ai_Supabase__execute_sql` with:
```sql
select table_name from information_schema.tables where table_name = 'holding_sales';
select policyname, cmd from pg_policies where tablename = 'holding_sales';
```
Expected: one row for the table, one row for the policy (`cmd = 'ALL'`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/091_holding_sales.sql
git commit -m "feat: add holding_sales table for recording position sales"
```

---

### Task 2: `HoldingSale` type

**Files:**
- Modify: `lib/types/database.ts` (add after the `UserHolding` interface, which ends at line 138)

**Interfaces:**
- Consumes: nothing new.
- Produces: `HoldingSale` interface, `InsertHoldingSale` type. Task 3 imports both from `@/lib/types/database`.

- [ ] **Step 1: Add the types**

Insert this immediately after the closing `}` of `UserHolding` (currently line 138) and before `export interface WatchlistItem`:

```ts
export interface HoldingSale {
  id: string;
  user_id: string;
  original_holding_id: string | null;
  symbol: string;
  company_name: string;
  quantity_sold: number;
  avg_cost_basis: number;
  sale_price: number;
  realized_pl: number;
  sale_date: string;
  trading_currency: string | null;
  asset_type: string | null;
  created_at: string;
}

export type InsertHoldingSale = Omit<HoldingSale, 'id' | 'created_at'> & {
  id?: string;
};
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit lib/types/database.ts 2>&1 | head -20`
Expected: no errors mentioning `HoldingSale` or `InsertHoldingSale` (pre-existing unrelated errors elsewhere in the project, if any, are fine — this project suppresses TS build errors project-wide per `next.config.ts`, so this check is a sanity check, not a gate).

- [ ] **Step 3: Commit**

```bash
git add lib/types/database.ts
git commit -m "feat: add HoldingSale type"
```

---

### Task 3: Data layer — `sellHolding`, `getHoldingSales`, `deleteHoldingSale`

**Files:**
- Modify: `lib/holdings/holdings-db.ts` (add near the end, after `removeHolding` which currently ends at line 458)

**Interfaces:**
- Consumes: `HoldingSale`, `InsertHoldingSale` from `@/lib/types/database` (Task 2); `UserHolding` (already imported in this file).
- Produces:
  - `sellHolding(userId: string, holdingId: string, input: { quantitySold: number; salePrice: number; saleDate: string }): Promise<SellHoldingResult>`
  - `getHoldingSales(userId: string): Promise<GetHoldingSalesResult>`
  - `deleteHoldingSale(userId: string, saleId: string): Promise<RemoveHoldingResult>` (reuses the existing `RemoveHoldingResult` shape — `{ success: boolean; error?: string }`)
  - Task 4 imports all three plus the result interfaces below.

- [ ] **Step 1: Add the result interfaces and functions**

Add this at the end of `lib/holdings/holdings-db.ts` (after `removeHolding`'s closing `}`):

```ts
export interface SellHoldingResult {
  success: boolean;
  sale?: HoldingSale;
  holding?: UserHolding;
  error?: string;
}

export interface GetHoldingSalesResult {
  success: boolean;
  sales?: HoldingSale[];
  error?: string;
}

const SELL_EPSILON = 1e-9;

/**
 * Records a sale against a manually-entered holding: inserts a `holding_sales`
 * row snapshotting the current avg_price as this sale's cost basis, then
 * decrements the holding's quantity. avg_price on user_holdings is left
 * untouched — under average-cost accounting, selling shares never changes
 * the cost basis of the shares you keep. A full sell brings quantity to 0
 * but the row is not deleted, so it stays available for chart reconstruction
 * and the closed-positions list.
 */
export async function sellHolding(
  userId: string,
  holdingId: string,
  input: { quantitySold: number; salePrice: number; saleDate: string }
): Promise<SellHoldingResult> {
  try {
    if (!(input.quantitySold > 0)) {
      return { success: false, error: 'Quantity sold must be greater than zero' };
    }
    if (!(input.salePrice > 0)) {
      return { success: false, error: 'Sale price must be greater than zero' };
    }

    const supabase = createServerClient();

    const { data: holding, error: lookupErr } = await supabase
      .from('user_holdings')
      .select('id, symbol, company_name, quantity, avg_price, source, trading_currency, asset_type')
      .eq('id', holdingId)
      .eq('user_id', userId)
      .maybeSingle();

    if (lookupErr || !holding) {
      return { success: false, error: 'Holding not found or access denied' };
    }
    if (holding.source !== 'manual') {
      return { success: false, error: 'Selling is only available for manually-entered holdings' };
    }
    if (holding.avg_price == null) {
      return { success: false, error: 'This holding has no average cost — edit it to add one before selling' };
    }
    const currentQty = holding.quantity ?? 0;
    if (input.quantitySold > currentQty + SELL_EPSILON) {
      return { success: false, error: `Cannot sell more than the ${currentQty} shares you hold` };
    }

    const realizedPl = (input.salePrice - holding.avg_price) * input.quantitySold;

    const saleInsert: Omit<InsertHoldingSale, 'id'> = {
      user_id: userId,
      original_holding_id: holding.id,
      symbol: holding.symbol,
      company_name: holding.company_name,
      quantity_sold: input.quantitySold,
      avg_cost_basis: holding.avg_price,
      sale_price: input.salePrice,
      realized_pl: realizedPl,
      sale_date: input.saleDate,
      trading_currency: holding.trading_currency ?? null,
      asset_type: holding.asset_type ?? null,
    };

    const { data: sale, error: insertErr } = await supabase
      .from('holding_sales')
      .insert(saleInsert)
      .select()
      .single();

    if (insertErr || !sale) {
      return { success: false, error: insertErr?.message || 'Failed to record sale' };
    }

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
  } catch (error) {
    logger.error('Error in sellHolding:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Internal server error' };
  }
}

/**
 * Lists this user's recorded sales, newest first.
 */
export async function getHoldingSales(userId: string): Promise<GetHoldingSalesResult> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('holding_sales')
      .select('*')
      .eq('user_id', userId)
      .order('sale_date', { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, sales: (data ?? []) as HoldingSale[] };
  } catch (error) {
    logger.error('Error in getHoldingSales:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Internal server error' };
  }
}

/**
 * Deletes a manually-entered sale record and adds the sold quantity back
 * onto the originating holding — for undoing a data-entry mistake (wrong
 * price, wrong date). Blocked if the originating holding was itself later
 * hard-deleted (original_holding_id is null): there's nothing to add the
 * shares back onto, so the user needs to re-add the holding manually first.
 */
export async function deleteHoldingSale(
  userId: string,
  saleId: string
): Promise<RemoveHoldingResult> {
  try {
    const supabase = createServerClient();

    const { data: sale, error: lookupErr } = await supabase
      .from('holding_sales')
      .select('id, original_holding_id, quantity_sold')
      .eq('id', saleId)
      .eq('user_id', userId)
      .maybeSingle();

    if (lookupErr || !sale) {
      return { success: false, error: 'Sale not found or access denied' };
    }
    if (!sale.original_holding_id) {
      return { success: false, error: 'The original holding no longer exists — re-add it before undoing this sale' };
    }

    const { data: holding, error: holdingErr } = await supabase
      .from('user_holdings')
      .select('id, quantity')
      .eq('id', sale.original_holding_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (holdingErr || !holding) {
      return { success: false, error: 'The original holding no longer exists — re-add it before undoing this sale' };
    }

    const { error: updateErr } = await supabase
      .from('user_holdings')
      .update({ quantity: (holding.quantity ?? 0) + sale.quantity_sold, updated_at: new Date().toISOString() })
      .eq('id', holding.id)
      .eq('user_id', userId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    const { error: deleteErr } = await supabase
      .from('holding_sales')
      .delete()
      .eq('id', saleId)
      .eq('user_id', userId);

    if (deleteErr) {
      return { success: false, error: deleteErr.message };
    }
    return { success: true };
  } catch (error) {
    logger.error('Error in deleteHoldingSale:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Internal server error' };
  }
}
```

- [ ] **Step 2: Update the import at the top of the file**

Change line 5 from:
```ts
import type { UserHolding, InsertUserHolding, UpdateUserHolding } from '@/lib/types/database';
```
to:
```ts
import type { UserHolding, InsertUserHolding, UpdateUserHolding, HoldingSale, InsertHoldingSale } from '@/lib/types/database';
```

- [ ] **Step 3: Write a throwaway verification script**

Create `scripts/_verify-sell-holding.ts` (temporary — delete after running):

```ts
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { addHolding, sellHolding, getHoldingSales, deleteHoldingSale, removeHolding } from '../lib/holdings/holdings-db';

const TEST_USER_ID = process.env.VERIFY_TEST_USER_ID!; // pass a real auth.users id when running

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`FAIL ${label}: expected ${expected}, got ${actual}`);
  }
  console.log(`PASS ${label}: ${actual}`);
}

async function main() {
  if (!TEST_USER_ID) throw new Error('Set VERIFY_TEST_USER_ID env var to a real user id before running');

  const added = await addHolding(TEST_USER_ID, {
    symbol: 'ZZTEST',
    company_name: 'Verify Sell Test Co',
    quantity: 100,
    avg_price: 10,
    asset_type: 'stock',
  } as never);
  if (!added.success || !added.holding) throw new Error(`setup failed: ${added.error}`);

  // Oversell rejected
  const oversold = await sellHolding(TEST_USER_ID, added.holding.id, {
    quantitySold: 1000,
    salePrice: 15,
    saleDate: '2026-07-20',
  });
  assertEqual(oversold.success, false, 'oversell is rejected');

  // Partial sell
  const sold = await sellHolding(TEST_USER_ID, added.holding.id, {
    quantitySold: 40,
    salePrice: 15,
    saleDate: '2026-07-20',
  });
  if (!sold.success) throw new Error(`sell failed: ${sold.error}`);
  assertEqual(sold.sale?.realized_pl, 200, 'realized_pl on partial sell (40 * (15-10))');
  assertEqual(sold.holding?.quantity, 60, 'remaining quantity after partial sell');
  assertEqual(sold.holding?.avg_price, 10, 'avg_price unchanged by a sell');

  const salesAfterOne = await getHoldingSales(TEST_USER_ID);
  const found = salesAfterOne.sales?.find((s) => s.id === sold.sale!.id);
  assertEqual(!!found, true, 'sale appears in getHoldingSales');
  assertEqual(found?.avg_cost_basis, 10, 'sale snapshots avg_cost_basis');

  // Undo restores the shares and removes the sale record
  const undone = await deleteHoldingSale(TEST_USER_ID, sold.sale!.id);
  assertEqual(undone.success, true, 'undo succeeds');

  const salesAfterUndo = await getHoldingSales(TEST_USER_ID);
  const stillThere = salesAfterUndo.sales?.some((s) => s.id === sold.sale!.id);
  assertEqual(stillThere, false, 'undone sale no longer listed');

  // Selling against a non-manual holding is rejected — flip source directly
  // via a raw update since there's no "add as snaptrade" helper to call.
  const { createServerClient } = await import('../lib/supabase/client');
  await createServerClient().from('user_holdings').update({ source: 'snaptrade' }).eq('id', added.holding.id);
  const snaptradeSell = await sellHolding(TEST_USER_ID, added.holding.id, {
    quantitySold: 1,
    salePrice: 15,
    saleDate: '2026-07-20',
  });
  assertEqual(snaptradeSell.success, false, 'sell rejected for source=snaptrade');

  // Cleanup
  const removed = await removeHolding(TEST_USER_ID, added.holding.id);
  assertEqual(removed.success, true, 'cleanup: test holding removed');

  console.log('ALL ASSERTIONS PASSED');
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: Run it against the real user id used throughout this session**

Get the test user id first via `mcp__claude_ai_Supabase__execute_sql`:
```sql
select id from auth.users where email = 'david@test.no';
```

Then run (replace the id):
```bash
VERIFY_TEST_USER_ID=a9ec02c8-ecf5-4a82-9c67-25e387fa22fa npx tsx scripts/_verify-sell-holding.ts
```
Expected output: a `PASS ...` line for each of the 8 `assertEqual` checks (oversell rejected, realized_pl, remaining quantity, avg_price unchanged, sale appears in list, sale snapshots avg_cost_basis, undo succeeds, undone sale no longer listed, sell rejected for snaptrade source, cleanup removed) followed by `ALL ASSERTIONS PASSED`, exit code 0. Any `FAIL ...` line or thrown error means the task is not done — fix the implementation, not the script.

- [ ] **Step 5: Delete the throwaway script**

```bash
rm scripts/_verify-sell-holding.ts
```

- [ ] **Step 6: Commit**

```bash
git add lib/holdings/holdings-db.ts
git commit -m "feat: add sellHolding/getHoldingSales/deleteHoldingSale data layer"
```

---

### Task 4: Server actions

**Files:**
- Modify: `app/actions/holdings.ts`

**Interfaces:**
- Consumes: `sellHolding`, `getHoldingSales`, `deleteHoldingSale` from `@/lib/holdings/holdings-db` (Task 3); `HoldingSale` from `@/lib/types/database` (Task 2).
- Produces: `sellHoldingAction(holdingId: string, input: SellHoldingInput)`, `getHoldingSalesAction()`, `deleteHoldingSaleAction(saleId: string)`. Task 5 imports all three.

- [ ] **Step 1: Update the import line**

Change:
```ts
import { getHoldings, addHolding, addOrUpdateHolding, updateHolding, removeHolding, updateHoldingBySymbol, removeHoldingBySymbol } from '@/lib/holdings/holdings-db';
```
to:
```ts
import { getHoldings, addHolding, addOrUpdateHolding, updateHolding, removeHolding, updateHoldingBySymbol, removeHoldingBySymbol, sellHolding, getHoldingSales, deleteHoldingSale } from '@/lib/holdings/holdings-db';
```
and change:
```ts
import type { UserHolding } from '@/lib/types/database';
```
to:
```ts
import type { UserHolding, HoldingSale } from '@/lib/types/database';
```

- [ ] **Step 2: Add the new actions**

Add at the end of the file, after `removeHoldingAction`:

```ts
export interface SellHoldingInput {
  quantitySold: number;
  salePrice: number;
  saleDate: string;
}

/**
 * Server Action: Record a sale against a manually-entered holding.
 * userId from session only — never trust client-provided userId.
 */
export async function sellHoldingAction(
  holdingId: string,
  input: SellHoldingInput
): Promise<{
  success: boolean;
  sale?: HoldingSale;
  holding?: UserHolding;
  error?: string;
}> {
  const userId = await getCurrentUserId();
  if (!userId) return { success: false, error: 'Authentication required' };
  if (!holdingId) return { success: false, error: 'Holding ID is required' };

  return await sellHolding(userId, holdingId, input);
}

/**
 * Server Action: List this user's recorded sales, newest first.
 */
export async function getHoldingSalesAction(): Promise<{
  success: boolean;
  sales?: HoldingSale[];
  error?: string;
}> {
  const userId = await getCurrentUserId();
  if (!userId) return { success: false, error: 'Authentication required' };
  return await getHoldingSales(userId);
}

/**
 * Server Action: Undo a recorded sale (adds the shares back onto the holding).
 */
export async function deleteHoldingSaleAction(
  saleId: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  const userId = await getCurrentUserId();
  if (!userId) return { success: false, error: 'Authentication required' };
  if (!saleId) return { success: false, error: 'Sale ID is required' };
  return await deleteHoldingSale(userId, saleId);
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit app/actions/holdings.ts 2>&1 | head -30`
Expected: no errors referencing `sellHoldingAction`, `getHoldingSalesAction`, `deleteHoldingSaleAction`, or missing imports.

- [ ] **Step 4: Commit**

```bash
git add app/actions/holdings.ts
git commit -m "feat: add sell/get-sales/undo-sale server actions"
```

---

### Task 5: TanStack Query hooks

**Files:**
- Modify: `hooks/use-holdings.ts`

**Interfaces:**
- Consumes: `sellHoldingAction`, `getHoldingSalesAction`, `deleteHoldingSaleAction`, `SellHoldingInput` from `@/app/actions/holdings` (Task 4); `HoldingSale` from `@/lib/types/database`.
- Produces: `useSellHolding()` (mutation, variables `{ holdingId: string; input: SellHoldingInput }`), `useHoldingSales()` (query, returns `HoldingSale[]`), `useDeleteHoldingSale()` (mutation, variables `saleId: string`). Task 6 (chart) uses `useHoldingSales()`; Task 7 (Sell modal) uses `useSellHolding()`; Task 9 (closed-positions list) uses `useHoldingSales()` and `useDeleteHoldingSale()`.

- [ ] **Step 1: Update the import line**

Change:
```ts
import {
  getMyHoldings,
  addHoldingAction,
  addOrUpdateHoldingAction,
  updateHoldingAction,
  removeHoldingAction,
  updateHoldingBySymbolAction,
  removeHoldingBySymbolAction,
  type AddHoldingInput,
  type UpdateHoldingInput,
} from '@/app/actions/holdings';
import type { UserHolding } from '@/lib/types/database';
```
to:
```ts
import {
  getMyHoldings,
  addHoldingAction,
  addOrUpdateHoldingAction,
  updateHoldingAction,
  removeHoldingAction,
  updateHoldingBySymbolAction,
  removeHoldingBySymbolAction,
  sellHoldingAction,
  getHoldingSalesAction,
  deleteHoldingSaleAction,
  type AddHoldingInput,
  type UpdateHoldingInput,
  type SellHoldingInput,
} from '@/app/actions/holdings';
import type { UserHolding, HoldingSale } from '@/lib/types/database';
```

- [ ] **Step 2: Add the hooks**

Add at the end of `hooks/use-holdings.ts`:

```ts
/**
 * TanStack Query mutation to sell (fully or partially) a manually-entered holding.
 * Invalidates holdings, quotes, holding-sales, and the performance chart's own
 * query cache (partial match, since its key also includes the selected range).
 */
export function useSellHolding() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ holdingId, input }: { holdingId: string; input: SellHoldingInput }) => {
      if (!user?.id) throw new Error('Authentication required');

      const result = await sellHoldingAction(holdingId, input);
      if (result.success) return result;
      throw new Error(result.error || 'Failed to sell holding');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holdings', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['holdings-quotes'] });
      queryClient.invalidateQueries({ queryKey: ['holding-sales', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['portfolio-performance'], exact: false });
    },
  });
}

/**
 * TanStack Query hook to fetch this user's recorded sales, newest first.
 */
export function useHoldingSales() {
  const { user, isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ['holding-sales', user?.id],
    queryFn: async (): Promise<HoldingSale[]> => {
      if (!isAuthenticated || !user) throw new Error('Authentication required');
      const result = await getHoldingSalesAction();
      if (result.success && result.sales) return result.sales;
      throw new Error(result.error || 'Failed to fetch sales');
    },
    enabled: isAuthenticated && !!user,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * TanStack Query mutation to undo a recorded sale.
 */
export function useDeleteHoldingSale() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (saleId: string): Promise<void> => {
      if (!user?.id) throw new Error('Authentication required');
      const result = await deleteHoldingSaleAction(saleId);
      if (!result.success) throw new Error(result.error || 'Failed to undo sale');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holdings', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['holdings-quotes'] });
      queryClient.invalidateQueries({ queryKey: ['holding-sales', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['portfolio-performance'], exact: false });
    },
  });
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit hooks/use-holdings.ts 2>&1 | head -30`
Expected: no errors referencing the three new hooks.

- [ ] **Step 4: Commit**

```bash
git add hooks/use-holdings.ts
git commit -m "feat: add useSellHolding/useHoldingSales/useDeleteHoldingSale hooks"
```

---

### Task 6: Chart algorithm — reconstruct history from sales

**Files:**
- Modify: `components/holdings/PortfolioPerformanceChart.tsx`

**Interfaces:**
- Consumes: `useHoldingSales()` from `@/hooks/use-holdings` (Task 5).
- Produces: no new exports — same `PortfolioPerformanceChart` component signature (`{ holdings, currency, isLoading }`), now internally sales-aware. Nothing downstream depends on new exports from this file.

- [ ] **Step 1: Import the hook and fetch sales**

Add to the imports at the top:
```ts
import { useHoldingSales } from '@/hooks/use-holdings';
import type { HoldingSale } from '@/lib/types/database';
```

Inside the `PortfolioPerformanceChart` component, right after the existing `const [showBenchmark, ...]` line, add:
```ts
const { data: allSales } = useHoldingSales();

const salesBySymbol = useMemo(() => {
  const map = new Map<string, HoldingSale[]>();
  for (const sale of allSales ?? []) {
    const list = map.get(sale.symbol) ?? [];
    list.push(sale);
    map.set(sale.symbol, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => new Date(a.sale_date).getTime() - new Date(b.sale_date).getTime());
  }
  return map;
}, [allSales]);
```

- [ ] **Step 2: Widen `eligible` to include fully-closed positions with sale history**

Replace:
```ts
const eligible = useMemo(
  () => holdings.filter((h) => h.avg_price != null && h.quantity != null && h.quantity > 0),
  [holdings]
);
```
with:
```ts
const eligible = useMemo(
  () => holdings.filter((h) =>
    h.avg_price != null &&
    ((h.quantity != null && h.quantity > 0) || (salesBySymbol.get(h.symbol)?.length ?? 0) > 0)
  ),
  [holdings, salesBySymbol]
);
```

This still requires the holding row to exist with a known `avg_price` (a fully-closed position keeps its row per Task 3's `sellHolding`, so this covers it) — it just no longer requires `quantity > 0`.

- [ ] **Step 3: Update `holdingsKey` to bust the candle-fetch cache when sales change**

Replace:
```ts
const holdingsKey = useMemo(
  () => eligible.map((h) => `${h.symbol}:${h.avg_price}:${h.quantity}:${h.date_purchased ?? h.created_at}`).join(','),
  [eligible]
);
```
with:
```ts
const holdingsKey = useMemo(
  () => eligible.map((h) => {
    const sales = salesBySymbol.get(h.symbol) ?? [];
    const salesTag = sales.map((s) => `${s.sale_date}:${s.quantity_sold}:${s.realized_pl}`).join('|');
    return `${h.symbol}:${h.avg_price}:${h.quantity}:${h.date_purchased ?? h.created_at}:${salesTag}`;
  }).join(','),
  [eligible, salesBySymbol]
);
```

- [ ] **Step 4: Rewrite the per-symbol contribution and period-basis logic**

Replace the entire `chartData` `useMemo` block:
```ts
const chartData = useMemo<ChartPoint[]>(() => {
  if (!candleResults?.length) return [];

  const plByTime = new Map<number, number>();
  let periodBasis = 0;

  for (const { holding, candles } of candleResults) {
    if (!candles || holding.avg_price == null || holding.quantity == null) continue;

    const holdingStart = holding.date_purchased
      ? new Date(holding.date_purchased).getTime()
      : new Date(holding.created_at).getTime();

    const { t, c } = candles;

    // Basis is avg_price whenever the holding was bought during the
    // selected window (the common case — and for MAX, effectively always,
    // since the window predates any realistic purchase date), otherwise
    // the period's opening price for a true windowed return.
    const periodStartMs = t.length > 0 ? t[0] * 1000 : 0;
    const boughtDuringPeriod = holdingStart > periodStartMs;
    const basePrice = boughtDuringPeriod ? holding.avg_price : c[0];
    periodBasis += basePrice * holding.quantity;

    for (let i = 0; i < t.length; i++) {
      if (t[i] * 1000 < holdingStart) continue;
      const pl = (c[i] - basePrice) * holding.quantity;
      plByTime.set(t[i], (plByTime.get(t[i]) ?? 0) + pl);
    }
  }

  const basis = periodBasis > 0 ? periodBasis : 1;

  return Array.from(plByTime.entries())
    .sort(([a], [b]) => a - b)
    .map(([ts, pl]) => ({
      time: ts,
      label: fmtLabel(ts, range),
      pl,
      plPct: (pl / basis) * 100,
    }));
}, [candleResults, range]);
```
with:
```ts
const chartData = useMemo<ChartPoint[]>(() => {
  if (!candleResults?.length) return [];

  const plByTime = new Map<number, number>();
  let periodBasis = 0;

  for (const { holding, candles } of candleResults) {
    if (!candles || holding.avg_price == null) continue;

    const holdingStart = holding.date_purchased
      ? new Date(holding.date_purchased).getTime()
      : new Date(holding.created_at).getTime();

    const sales = salesBySymbol.get(holding.symbol) ?? [];
    const currentQty = holding.quantity ?? 0;

    // Shares still held at time t: current quantity, plus back out every
    // sale that hadn't happened yet as of t.
    const sharesHeldAt = (tMs: number): number => {
      let shares = currentQty;
      for (const sale of sales) {
        if (new Date(sale.sale_date).getTime() > tMs) shares += sale.quantity_sold;
      }
      return shares;
    };
    // Realized gain locked in as of time t: every sale that had already
    // happened by t, permanently added to the total from its sale date on.
    const realizedAt = (tMs: number): number => {
      let realized = 0;
      for (const sale of sales) {
        if (new Date(sale.sale_date).getTime() <= tMs) realized += sale.realized_pl;
      }
      return realized;
    };

    const { t, c } = candles;

    const periodStartMs = t.length > 0 ? t[0] * 1000 : 0;
    const boughtDuringPeriod = holdingStart > periodStartMs;
    const basePrice = boughtDuringPeriod ? holding.avg_price : c[0];
    periodBasis += basePrice * sharesHeldAt(periodStartMs);

    for (let i = 0; i < t.length; i++) {
      const tsMs = t[i] * 1000;
      if (tsMs < holdingStart) continue;
      const shares = sharesHeldAt(tsMs);
      const pl = (c[i] - basePrice) * shares + realizedAt(tsMs);
      plByTime.set(t[i], (plByTime.get(t[i]) ?? 0) + pl);
    }
  }

  const basis = periodBasis > 0 ? periodBasis : 1;

  return Array.from(plByTime.entries())
    .sort(([a], [b]) => a - b)
    .map(([ts, pl]) => ({
      time: ts,
      label: fmtLabel(ts, range),
      pl,
      plPct: (pl / basis) * 100,
    }));
}, [candleResults, range, salesBySymbol]);
```

Note this drops the `holding.quantity == null` guard from the `continue` check (a symbol with sales but a null/zero current quantity is exactly the fully-closed case we now want to include) and replaces every direct use of `holding.quantity` with `sharesHeldAt(...)`, which correctly reduces to `holding.quantity` unconditionally when `sales` is empty — so any symbol with no sales renders byte-identical to before.

- [ ] **Step 5: Manually verify the "no sales" case is unaffected**

This is the regression check for every existing holding. Run the dev server, open `/holdings` for the test account (`david@test.no`), and confirm the Performance chart renders the same P/L totals as before this task for any symbol with zero recorded sales (there should be none yet, since Task 6 is the first to read `holding_sales` and nothing has written to it outside Task 3's throwaway script, which already cleaned up after itself).

- [ ] **Step 6: Commit**

```bash
git add components/holdings/PortfolioPerformanceChart.tsx
git commit -m "feat: reconstruct chart history from recorded sales instead of current holdings state"
```

---

### Task 7: `SellHoldingModal` component

**Files:**
- Create: `components/holdings/SellHoldingModal.tsx`

**Interfaces:**
- Consumes: `useSellHolding()` from `@/hooks/use-holdings` (Task 5); `UserHolding` from `@/lib/types/database`.
- Produces: `SellHoldingModal` component with props `{ open: boolean; onOpenChange: (open: boolean) => void; holding: UserHolding | null; currentPrice?: number }`. Task 8 renders this and passes `holding`/`currentPrice` from the row it's opened from.

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { useEffect, useState } from 'react';
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
import { useSellHolding } from '@/hooks/use-holdings';
import type { UserHolding } from '@/lib/types/database';
import { logger } from '@/lib/utils/logger';

interface SellHoldingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holding: UserHolding | null;
  /** Live market price, if available — prefills the sale price field. */
  currentPrice?: number;
}

const QUICK_PERCENTS = [25, 50, 75, 100] as const;

export function SellHoldingModal({ open, onOpenChange, holding, currentPrice }: SellHoldingModalProps) {
  const [quantity, setQuantity] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 10));
  const [saved, setSaved] = useState(false);
  const sellHolding = useSellHolding();

  useEffect(() => {
    if (holding && open) {
      setQuantity('');
      setSalePrice(currentPrice != null ? String(currentPrice) : (holding.avg_price?.toString() ?? ''));
      setSaleDate(new Date().toISOString().slice(0, 10));
      setSaved(false);
    }
  }, [holding, open, currentPrice]);

  if (!holding) return null;

  const heldQty = holding.quantity ?? 0;
  const qtyNum = parseFloat(quantity) || 0;
  const priceNum = parseFloat(salePrice) || 0;
  const realizedPl = holding.avg_price != null ? (priceNum - holding.avg_price) * qtyNum : 0;
  const canSubmit = qtyNum > 0 && qtyNum <= heldQty + 1e-9 && priceNum > 0 && !!saleDate;

  const handlePercent = (pct: number) => {
    const shares = (heldQty * pct) / 100;
    // Round to 6 decimals to avoid float noise like 33.33333333333333.
    setQuantity((Math.round(shares * 1e6) / 1e6).toString());
  };

  const handleClose = () => {
    setQuantity('');
    setSaved(false);
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    try {
      await sellHolding.mutateAsync({
        holdingId: holding.id,
        input: { quantitySold: qtyNum, salePrice: priceNum, saleDate },
      });
      setSaved(true);
      setTimeout(handleClose, 1000);
    } catch (error) {
      logger.error('Error selling holding', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Sell {holding.symbol}</DialogTitle>
          <DialogDescription>
            You hold {heldQty} shares of {holding.company_name} at an average cost of{' '}
            {holding.avg_price != null ? `$${holding.avg_price.toFixed(2)}` : '—'}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="sell-quantity">Shares to sell</Label>
            <Input
              id="sell-quantity"
              type="number"
              step="0.000001"
              min="0"
              max={heldQty}
              placeholder={`up to ${heldQty}`}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            <div className="flex gap-2">
              {QUICK_PERCENTS.map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => handlePercent(pct)}
                  className="rounded-full border border-border/60 px-3 py-1 text-xs font-medium text-muted-foreground hover:border-border hover:text-foreground transition-colors"
                >
                  {pct === 100 ? 'All' : `${pct}%`}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sell-price">Sale price per share</Label>
            <Input
              id="sell-price"
              type="number"
              step="0.01"
              min="0"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sell-date">Sale date</Label>
            <Input
              id="sell-date"
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
            />
          </div>

          {qtyNum > 0 && priceNum > 0 && holding.avg_price != null && (
            <p className={`text-sm font-medium ${realizedPl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {realizedPl >= 0 ? '+' : ''}
              ${realizedPl.toFixed(2)} realized {realizedPl >= 0 ? 'gain' : 'loss'}
            </p>
          )}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit || sellHolding.isPending || saved}
              className={saved ? 'bg-emerald-600 hover:bg-emerald-600 text-white' : ''}
            >
              {saved
                ? <><Check className="h-4 w-4 mr-1.5" />Sold!</>
                : sellHolding.isPending ? 'Selling...' : 'Confirm Sale'}
            </Button>
          </div>

          {sellHolding.isError && (
            <div className="text-sm text-red-600 dark:text-red-400">
              {sellHolding.error instanceof Error ? sellHolding.error.message : 'Failed to sell holding'}
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit components/holdings/SellHoldingModal.tsx 2>&1 | head -30`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/holdings/SellHoldingModal.tsx
git commit -m "feat: add SellHoldingModal component"
```

---

### Task 8: Wire the Sell action into `HoldingsTable`

**Files:**
- Modify: `components/holdings/HoldingsTable.tsx`

**Interfaces:**
- Consumes: `SellHoldingModal` from `./SellHoldingModal` (Task 7).
- Produces: no new exports — `HoldingsTable`'s public props are unchanged.

- [ ] **Step 1: Import the modal and a dollar-sign icon**

Change:
```ts
import { Trash2, Edit2, ArrowUpRight, ArrowDownRight, Plus, Search, X, Loader2, Upload, Download } from 'lucide-react';
```
to:
```ts
import { Trash2, Edit2, DollarSign, ArrowUpRight, ArrowDownRight, Plus, Search, X, Loader2, Upload, Download } from 'lucide-react';
```
and add, alongside the other component imports (near `import { EditHoldingModal } from './EditHoldingModal';`):
```ts
import { SellHoldingModal } from './SellHoldingModal';
```

- [ ] **Step 2: Add sell state and handler in the main component**

In `HoldingsTable`, after `const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);` (line 412), add:
```ts
const [sellingHolding, setSellingHolding] = useState<UserHolding | null>(null);
const [isSellModalOpen, setIsSellModalOpen] = useState(false);

const handleSellRow = useCallback((h: HoldingWithPrice) => {
  setSellingHolding(h as unknown as UserHolding);
  setIsSellModalOpen(true);
}, []);
```

- [ ] **Step 3: Add the button to the desktop `HoldingRow`**

In `HoldingRowProps` (around line 205), add:
```ts
onSell: (h: HoldingWithPrice) => void;
```
In the `HoldingRow` function's destructured props (around line 221), add `onSell,` alongside `onEdit,`.

Then in the row's action cell (lines 357-377), insert a Sell button between Edit and Remove, and gate the whole thing on `holding.source === 'manual'`:
```tsx
<td className="py-4 px-4">
  <div className="flex items-center justify-end gap-2">
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onEdit(holding)}
      disabled={anyPending || isEditModalOpen}
      title="Edit holding"
    >
      <Edit2 className="h-4 w-4" />
    </Button>
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
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onRemove({ id: holding.id, symbol: holding.symbol, companyName: holding.company_name })}
      disabled={anyPending}
      title={isDeletingThis ? 'Removing…' : 'Remove holding'}
    >
      {isDeletingThis ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </Button>
  </div>
</td>
```

- [ ] **Step 4: Pass `onSell` at the call site**

In the `filteredHoldings.map` block (around line 901-918), add `onSell={handleSellRow}` alongside `onEdit={handleEditRow}`.

- [ ] **Step 5: Add the button to the mobile card layout**

In the mobile card block (lines 810-827), insert between the Edit and Remove buttons:
```tsx
{holding.source === 'manual' && (
  <button onClick={() => handleSellRow(holding)} disabled={removeHolding.isPending} title="Sell shares" className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground">
    <DollarSign className="h-4 w-4" />
  </button>
)}
```

- [ ] **Step 6: Render the modal**

After the existing `<EditHoldingModal ... />` block (around line 938-942), add:
```tsx
<SellHoldingModal
  open={isSellModalOpen}
  onOpenChange={setIsSellModalOpen}
  holding={sellingHolding}
  currentPrice={sellingHolding ? holdingsWithPrices.find((h) => h.id === sellingHolding.id)?.currentPrice : undefined}
/>
```
Note: `holdings` (from `useHoldings()`, line 400) does not carry `currentPrice` — `holdingsWithPrices` (line 574, `= internalHoldingsWithPrices`) is the `HoldingWithPrice[]` with live prices merged in, already used for `sortedHoldings`/`filteredHoldings` below it in the same function, and it's in scope at the point where this modal renders.

- [ ] **Step 7: Manual verification**

Run the dev server, open `/holdings` signed in as the test account. Confirm:
- A manual holding shows three icons (Edit, Sell, Remove).
- A `source: 'snaptrade'` holding (if any test data has one) shows only Edit and Remove — no Sell button. If no snaptrade test row exists, verify this by temporarily checking the rendered DOM for a holding with `source !== 'manual'` via browser devtools, or by inserting one via `mcp__claude_ai_Supabase__execute_sql` against a disposable test symbol and removing it afterward.
- Clicking Sell opens `SellHoldingModal` prefilled with the holding's symbol/company/avg cost.

- [ ] **Step 8: Commit**

```bash
git add components/holdings/HoldingsTable.tsx
git commit -m "feat: add Sell row action to holdings table (manual holdings only)"
```

---

### Task 9: Closed positions list

**Files:**
- Create: `components/holdings/ClosedPositionsList.tsx`
- Modify: `app/holdings/page.tsx`

**Interfaces:**
- Consumes: `useHoldingSales()`, `useDeleteHoldingSale()` from `@/hooks/use-holdings` (Task 5).
- Produces: `ClosedPositionsList` component, no props (self-contained — fetches its own data, renders nothing when there are no sales). Mounted once in `app/holdings/page.tsx`.

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Undo2 } from 'lucide-react';
import { useHoldingSales, useDeleteHoldingSale } from '@/hooks/use-holdings';
import { logger } from '@/lib/utils/logger';

export function ClosedPositionsList() {
  const { data: sales, isLoading } = useHoldingSales();
  const deleteSale = useDeleteHoldingSale();
  const [undoingId, setUndoingId] = useState<string | null>(null);

  if (isLoading || !sales || sales.length === 0) return null;

  const handleUndo = async (saleId: string) => {
    setUndoingId(saleId);
    try {
      await deleteSale.mutateAsync(saleId);
    } catch (error) {
      logger.error('Error undoing sale', error);
    } finally {
      setUndoingId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Sold Positions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {sales.map((sale) => {
          const isPos = sale.realized_pl >= 0;
          return (
            <div
              key={sale.id}
              className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{sale.symbol}</span>
                  <span className="truncate text-xs text-muted-foreground">{sale.company_name}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Sold {sale.quantity_sold} shares at ${sale.sale_price.toFixed(2)} on{' '}
                  {new Date(sale.sale_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className={`text-sm font-semibold tabular-nums ${isPos ? 'text-emerald-500' : 'text-red-500'}`}>
                  {isPos ? '+' : ''}${sale.realized_pl.toFixed(2)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleUndo(sale.id)}
                  disabled={undoingId === sale.id}
                  title="Undo this sale"
                >
                  {undoingId === sale.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Mount it in the holdings page**

In `app/holdings/page.tsx`, add the import near the other holdings component imports:
```ts
import { ClosedPositionsList } from '@/components/holdings/ClosedPositionsList';
```
Then render it right after `<HoldingsTable ... />` (currently ending at line 369) and before the `{/* AI risk analysis */}` comment:
```tsx
      {/* Closed positions — renders nothing if there are no recorded sales yet */}
      <ClosedPositionsList />

```

- [ ] **Step 3: Manual verification**

With the dev server running, sign in as the test account, sell part of a test holding via the modal from Task 8, then confirm a "Sold Positions" card appears below the holdings table showing that sale with the correct realized P/L, and that clicking the undo icon removes it from the list and restores the shares (confirm via the holdings table quantity going back up).

- [ ] **Step 4: Commit**

```bash
git add components/holdings/ClosedPositionsList.tsx app/holdings/page.tsx
git commit -m "feat: add closed positions list to holdings page"
```

---

### Task 10: End-to-end verification pass

**Files:** none (verification only)

**Interfaces:** none — this task exercises everything built in Tasks 1–9 together.

- [ ] **Step 1: Full lint pass**

Run: `npm run lint`
Expected: 0 errors (warning count may be the same or +0 relative to the pre-existing baseline — do not introduce new warnings in the files this plan touched).

- [ ] **Step 2: Browser walkthrough**

With the dev server running and signed in as the test account (`david@test.no`):
1. Add a manual test holding (e.g. 100 shares at $10).
2. Note the Performance chart's current total P/L.
3. Sell 40 shares at $15 via the new Sell action.
4. Confirm: the chart's P/L for dates *before* today is unchanged from step 2's shape (same curve shape, just re-based — the key check is that it didn't flatten to zero or disappear).
5. Confirm: "Sold Positions" shows the sale with `+$200.00` realized gain (40 × ($15 − $10)).
6. Confirm: the holdings table still shows the position with quantity reduced to 60, `avg_price` unchanged at $10.
7. Sell the remaining 60 shares (100%).
8. Confirm: the position now shows 0 quantity in the table (or drops out of the "current holdings" view, per however the table already filters — check, but don't change, existing display filtering) while still appearing in "Sold Positions" with both sale records.
9. Confirm total realized P/L across both sales is correct: 40×$5 + 60×$5 = $500.
10. Clean up: delete the test holding via the existing Remove action, and verify (via `mcp__claude_ai_Supabase__execute_sql`) that its `holding_sales` rows survive the delete with `original_holding_id` now `NULL` (per the `ON DELETE SET NULL` foreign key).

```sql
select id, symbol, original_holding_id, realized_pl from holding_sales where symbol = '<test symbol>';
```
Expected: rows still present, `original_holding_id` is `null`.

- [ ] **Step 3: Verify SnapTrade holdings are unaffected**

If a `source = 'snaptrade'` test row doesn't already exist, insert one temporarily via `mcp__claude_ai_Supabase__execute_sql`, confirm no Sell button renders for it in either the desktop or mobile layout, then delete it.

- [ ] **Step 4: Final commit (if any cleanup edits were needed)**

Only if Steps 1–3 surfaced something to fix — otherwise this task has nothing to commit.

---

## Addendum: findings from the final whole-branch review

The final review (after Task 10) approved the feature as "ready to merge, with fixes" — the core data model, server-side enforcement, and the default MAX-view chart reconstruction were verified correct, but it found one real correctness gap and two smaller follow-ups, all contained to `components/holdings/PortfolioPerformanceChart.tsx` and the delete flow. These two tasks close them out.

### Task 11: Fix windowed-range realized-gain distortion + stale label + orphaned-symbol chart visibility

**Files:**
- Modify: `components/holdings/PortfolioPerformanceChart.tsx`

**Interfaces:**
- Consumes: `useHoldingSales()` (existing, from Task 6), `HoldingSale`/`HoldingWithPrice` types (existing).
- Produces: no new exports — same component signature, internally more correct.

**The three problems, and why they're related (all live in the same `chartData` useMemo):**

1. **Windowed-range distortion.** `realizedAt(t)` currently adds each sale's *lifetime* `realized_pl` (anchored to the original purchase price via `avg_cost_basis`) regardless of which range is selected. For the default MAX range this is correct (the whole lifetime IS the window). For a shorter range (1Y, 6M, ...) where the position predates the window (`!boughtDuringPeriod`), the unrealized portion is correctly re-based to the window's own opening price (`c[0]`) — but the realized portion isn't re-based at all, so it's measured against a different, wrong baseline than the rest of the chart. For a position fully sold *before* the window even starts, this is worse: it injects a flat lifetime-realized constant into every point of a window where the position contributed 0 shares to `periodBasis`, wildly inflating the percentage return.

2. **Stale label.** `range === 'MAX' ? 'unrealized P/L' : 'period return'` (near the summary stat) is no longer accurate for MAX once realized gains are baked in — it's now realized + unrealized.

3. **Orphaned-symbol chart visibility.** `eligible` is derived by filtering `holdings` (the live `user_holdings` rows). If a user hard-deletes a fully-sold position (the existing "Remove" action, available on any holding regardless of quantity), that symbol no longer has a row in `holdings` at all — so it can never enter `eligible`, and its locked-in realized gains silently vanish from the chart forever, even though the sale records themselves survive (`original_holding_id` → `null`) and still show in the "Sold Positions" list. This undermines the "permanent" guarantee the whole feature exists to provide, for exactly the interaction (delete after selling) the spec's own `ON DELETE SET NULL` design anticipated as a supported user action.

**Fix for 1 — rebase realized gains to the window, and exclude pre-window sales from windowed views:**

Replace the `for (const { holding, candles } of candleResults) { ... }` loop body (currently lines ~167–209) with:

```ts
    for (const { holding, candles } of candleResults) {
      if (!candles || holding.avg_price == null) continue;

      const holdingStart = holding.date_purchased
        ? new Date(holding.date_purchased).getTime()
        : new Date(holding.created_at).getTime();

      const sales = salesBySymbol.get(holding.symbol) ?? [];
      const currentQty = holding.quantity ?? 0;
      const { t, c } = candles;

      // Basis is avg_price whenever the holding was bought during the
      // selected window (the common case — and for MAX, effectively always,
      // since the window predates any realistic purchase date), otherwise
      // the period's opening price for a true windowed return.
      const periodStartMs = t.length > 0 ? t[0] * 1000 : 0;
      const boughtDuringPeriod = holdingStart > periodStartMs;
      const basePrice = boughtDuringPeriod ? holding.avg_price : c[0];

      // Shares still held at time t: current quantity, plus back out every
      // sale that hadn't happened yet as of t.
      const sharesHeldAt = (tMs: number): number => {
        let shares = currentQty;
        for (const sale of sales) {
          if (new Date(sale.sale_date).getTime() > tMs) shares += sale.quantity_sold;
        }
        return shares;
      };

      // Realized gain locked in as of time t. When the position's entire
      // life fits inside the selected window (boughtDuringPeriod), each
      // sale's own lifetime realized_pl is already consistent with
      // basePrice (= avg_price) — used as-is, matching MAX's existing
      // behavior exactly. When the position predates the window, a sale's
      // LIFETIME realized_pl is anchored to the original purchase price,
      // not this window's opening price — using it as-is would overstate
      // (or, for a sale that happened entirely before the window opened,
      // badly distort) a windowed return. So each such sale is re-expressed
      // relative to the window's own basePrice instead, and — matching how
      // sharesHeldAt already treats them — a sale that happened before the
      // window opened contributes nothing to this window's own story at all.
      const realizedAt = (tMs: number): number => {
        let realized = 0;
        for (const sale of sales) {
          const saleMs = new Date(sale.sale_date).getTime();
          if (saleMs > tMs) continue;
          if (boughtDuringPeriod) {
            realized += sale.realized_pl;
          } else if (saleMs >= periodStartMs) {
            realized += (sale.sale_price - basePrice) * sale.quantity_sold;
          }
        }
        return realized;
      };

      periodBasis += basePrice * sharesHeldAt(periodStartMs);

      for (let i = 0; i < t.length; i++) {
        const tsMs = t[i] * 1000;
        if (tsMs < holdingStart) continue;
        const shares = sharesHeldAt(tsMs);
        const pl = (c[i] - basePrice) * shares + realizedAt(tsMs);
        plByTime.set(t[i], (plByTime.get(t[i]) ?? 0) + pl);
      }
    }
```

Note this is the SAME computation as before for any symbol with zero sales, and the SAME computation as before for the MAX range (`boughtDuringPeriod` always true there) — only the windowed+has-sales combination changes.

**Fix for 2 — relabel:**

Find (near the summary stat, in the JSX):
```tsx
{range === 'MAX' ? 'unrealized P/L' : 'period return'}
```
Replace with:
```tsx
{range === 'MAX' ? 'total P/L' : 'period return'}
```

**Fix for 3 — synthesize a chart entry for symbols whose holding row is gone but whose sales survive:**

Add this new `useMemo` immediately after the existing `salesBySymbol` one (which ends around line 100), before `eligible`:

```ts
  // Symbols with sale history but no surviving user_holdings row (the row
  // was hard-deleted after being fully sold, via the existing Remove
  // action). Without a synthetic entry here, eligible below would never
  // include them — since it filters `holdings`, which has no row for a
  // deleted symbol at all — silently dropping their locked-in realized
  // gains from the chart even though the sales still show in the
  // Sold Positions list. quantity is always 0 here: whatever the holding's
  // remaining share count was at the moment of deletion is not recoverable
  // (it only ever lived in the now-gone user_holdings row), so only the
  // realized portion can be reconstructed for these — which is exactly the
  // portion this feature promises stays permanent.
  const orphanedEntries = useMemo(() => {
    const known = new Set(holdings.map((h) => h.symbol));
    const entries: HoldingWithPrice[] = [];
    for (const [symbol, sales] of salesBySymbol) {
      if (known.has(symbol) || sales.length === 0) continue;
      const last = sales[sales.length - 1]; // salesBySymbol entries are pre-sorted ascending by sale_date
      entries.push({
        id: `orphaned:${symbol}`,
        user_id: last.user_id,
        symbol,
        company_name: last.company_name,
        quantity: 0,
        avg_price: last.avg_cost_basis,
        date_purchased: sales[0].sale_date,
        source: 'manual',
        brokerage_account_id: null,
        alerts_enabled: false,
        asset_type: (last.asset_type as HoldingWithPrice['asset_type']) ?? 'stock',
        purchase_currency: null,
        purchase_fx_rate: null,
        trading_currency: last.trading_currency,
        created_at: sales[0].sale_date,
        updated_at: last.sale_date,
      });
    }
    return entries;
  }, [holdings, salesBySymbol]);
```

Then change `eligible` from:
```ts
  const eligible = useMemo(
    () => holdings.filter((h) =>
      h.avg_price != null &&
      ((h.quantity != null && h.quantity > 0) || (salesBySymbol.get(h.symbol)?.length ?? 0) > 0)
    ),
    [holdings, salesBySymbol]
  );
```
to:
```ts
  const eligible = useMemo(
    () => [...holdings, ...orphanedEntries].filter((h) =>
      h.avg_price != null &&
      ((h.quantity != null && h.quantity > 0) || (salesBySymbol.get(h.symbol)?.length ?? 0) > 0)
    ),
    [holdings, orphanedEntries, salesBySymbol]
  );
```

`HoldingWithPrice` needs to be imported as a type in this file if it isn't already (check the existing import from `./types` at the top of the file — it should already be there, since `Props` uses it).

- [ ] **Step 1: Apply all three fixes above to `PortfolioPerformanceChart.tsx`**

- [ ] **Step 2: Verify it compiles/lints clean**

Run: `npm run lint 2>&1 | grep -A 5 "PortfolioPerformanceChart"` — expect no output (no errors or warnings for this file).

- [ ] **Step 3: Manual verification — windowed rebasing**

With the dev server running and signed in as the test account: add a manual test holding on a real, liquid symbol not already held (e.g. a consumer staples stock), with `date_purchased` at least 1 year in the past (insert via Supabase MCP for precise control, same pattern Task 10 used). Sell part of it today. Switch the chart to the "1Y" range and confirm:
- The line's shape before the sale date is unchanged from what it showed before this fix.
- The realized bump at the sale date is now proportional to `(sale_price − 1Y-ago price) × quantity_sold`, not `(sale_price − original_avg_price) × quantity_sold` — check this against the numbers directly (compute both by hand, confirm the chart matches the window-relative one, not the lifetime one).
- Switch back to MAX and confirm the MAX total is unaffected by this change (still the lifetime figure).
Clean up the test holding and its sale record afterward (delete both via Supabase MCP or the UI, whichever is cleaner given what's left over).

- [ ] **Step 4: Manual verification — orphaned symbol**

Add another manual test holding, sell all of it, confirm it shows in "Sold Positions" and contributes to the chart (per Task 10's existing pattern). Then hard-delete the holding via the existing Remove action. Confirm:
- The sale still shows in "Sold Positions" (unchanged from before this fix).
- The chart's MAX total P/L is unchanged after the delete (the realized gain is still counted) — this is the actual regression this fix targets; without it, the total would drop by exactly that sale's realized_pl the moment the row is deleted.
Clean up the sale record afterward via Supabase MCP (`delete from holding_sales where symbol = '<test symbol>'`), since there's no UI path to delete a sale whose holding is already gone (per `deleteHoldingSale`'s own null-`original_holding_id` guard from Task 3).

- [ ] **Step 5: Commit**

```bash
git add components/holdings/PortfolioPerformanceChart.tsx
git commit -m "fix: rebase realized gains to the selected window and keep orphaned sales charted after a holding is deleted"
```

---

### Task 12: Nudge "Remove" toward "Sell" when the holding still has shares

**Files:**
- Modify: `components/holdings/DeleteHoldingDialog.tsx`
- Modify: `components/holdings/HoldingsTable.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `DeleteHoldingDialog` gains an optional `hasShares?: boolean` prop. No other file depends on this component beyond `HoldingsTable.tsx`.

**Why:** the spec called for softening the delete dialog's copy to nudge users who actually sold shares toward the new Sell action instead of Remove (which is exactly the old behavior this whole feature exists to move people away from). This was noted in the design but not implemented in the original 10 tasks.

- [ ] **Step 1: Add the prop to `DeleteHoldingDialog.tsx`**

Change:
```tsx
interface DeleteHoldingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  symbol: string;
  companyName: string;
  isLoading?: boolean;
}
```
to:
```tsx
interface DeleteHoldingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  symbol: string;
  companyName: string;
  isLoading?: boolean;
  /** True when the holding still has shares — nudges toward Sell instead of Remove. */
  hasShares?: boolean;
}
```

Change the function signature:
```tsx
export function DeleteHoldingDialog({
  open,
  onOpenChange,
  onConfirm,
  symbol,
  companyName,
  isLoading = false,
}: DeleteHoldingDialogProps) {
```
to:
```tsx
export function DeleteHoldingDialog({
  open,
  onOpenChange,
  onConfirm,
  symbol,
  companyName,
  isLoading = false,
  hasShares = false,
}: DeleteHoldingDialogProps) {
```

Change the description JSX:
```tsx
          <DialogDescription>
            Are you sure you want to remove <strong>{symbol}</strong> ({companyName}) from your holdings? This action cannot be undone.
          </DialogDescription>
```
to:
```tsx
          <DialogDescription>
            Are you sure you want to remove <strong>{symbol}</strong> ({companyName}) from your holdings? This action cannot be undone.
            {hasShares && ' If you actually sold these shares, use Sell instead to keep your performance chart accurate.'}
          </DialogDescription>
```

- [ ] **Step 2: Thread `hasShares` through `HoldingsTable.tsx`**

Change the `deletingHolding` state type (currently `useState<{ id: string; symbol: string; companyName: string } | null>(null)`) to include quantity:
```ts
const [deletingHolding, setDeletingHolding] = useState<{ id: string; symbol: string; companyName: string; quantity: number } | null>(null);
```

Change the `onRemove` prop type on `HoldingRowProps` (currently `onRemove: (h: { id: string; symbol: string; companyName: string }) => void;`) to:
```ts
onRemove: (h: { id: string; symbol: string; companyName: string; quantity: number }) => void;
```

Change `handleRemoveRow`'s parameter type (currently `(h: { id: string; symbol: string; companyName: string })`) to match:
```ts
const handleRemoveRow = useCallback((h: { id: string; symbol: string; companyName: string; quantity: number }) => {
```

At the desktop row's call site (`onClick={() => onRemove({ id: holding.id, symbol: holding.symbol, companyName: holding.company_name })}`), add `quantity: holding.quantity ?? 0`:
```tsx
onClick={() => onRemove({ id: holding.id, symbol: holding.symbol, companyName: holding.company_name, quantity: holding.quantity ?? 0 })}
```

At the mobile card's call site (`onClick={() => handleRemoveRow({ id: holding.id, symbol: holding.symbol, companyName: holding.company_name })}`), same addition:
```tsx
onClick={() => handleRemoveRow({ id: holding.id, symbol: holding.symbol, companyName: holding.company_name, quantity: holding.quantity ?? 0 })}
```

At the `<DeleteHoldingDialog ... />` render site, add the prop:
```tsx
{deletingHolding && (
  <DeleteHoldingDialog
    open={isDeleteDialogOpen}
    onOpenChange={setIsDeleteDialogOpen}
    onConfirm={handleConfirmDelete}
    symbol={deletingHolding.symbol}
    companyName={deletingHolding.companyName}
    isLoading={removeHolding.isPending}
    hasShares={deletingHolding.quantity > 0}
  />
)}
```

- [ ] **Step 3: Verify it compiles/lints clean**

Run: `npm run lint 2>&1 | grep -A 5 "DeleteHoldingDialog\|HoldingsTable"` — expect no output.

- [ ] **Step 4: Manual verification**

With the dev server running: click Remove on a holding with `quantity > 0` — confirm the dialog shows the added nudge sentence. Click Remove on the `quantity = 0` ghost row left over from Task 10/11's testing (if one still exists) or any 0-share row — confirm the dialog does NOT show the nudge sentence (since there's nothing left to sell).

- [ ] **Step 5: Commit**

```bash
git add components/holdings/DeleteHoldingDialog.tsx components/holdings/HoldingsTable.tsx
git commit -m "fix: nudge Remove toward Sell when the holding still has shares"
```
