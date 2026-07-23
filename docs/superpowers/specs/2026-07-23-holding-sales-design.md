# Holding Sales — Design Spec

**Date:** 2026-07-23
**Status:** Draft, pending review

## Problem

`user_holdings` stores one aggregate row per (user, symbol) — current quantity and a single blended average cost. There is no record of what happened to a position before its current state. When a user sells and then edits/deletes the holding to reflect that, two things go wrong:

1. **`PortfolioPerformanceChart` rewrites history.** It computes unrealized P/L as `(price[t] − avg_price) × quantity`, summed across currently-held positions only (`eligible = holdings.filter(quantity > 0)`), using *today's* quantity/avg_price projected across the *entire* historical window. Deleting or reducing a holding removes or shrinks its contribution at every past date, not just going forward.
2. **There's no record of realized gains at all.** Selling a position that made (or lost) money leaves no trace of that outcome anywhere in the app.

This spec covers recording sales as first-class events and using them to make the performance chart historically accurate.

## Goals

- Selling shares (partial or full) records a durable, independent event — not just an edit to the aggregate row.
- The performance chart is accurate for *all* time: a position's contribution before its sale date is untouched; after the sale, its realized gain becomes a permanent part of the portfolio's cumulative P/L instead of just vanishing.
- Users can see what they've sold and what it realized (a simple closed-positions list).
- Minimal new surface area: no lot-level buy tracking, no touching the existing add/edit code paths, one new additive table.

## Non-goals (this pass)

- **FIFO/LIFO lot accounting.** Buys already blend into one `avg_price` today (`addOrUpdateHolding`'s weighted average). Realized gain on sale uses that same average-cost model: `(sale_price − avg_price_at_sale_time) × quantity_sold`. True per-lot tax accounting would require retrofitting buy-side lot tracking too — a materially bigger feature, out of scope here.
- **SnapTrade-linked holdings.** The new Sell action is manual-holdings-only (`source = 'manual'`). SnapTrade sync has its own separate bug — it silently skips (never deletes or flags) positions that drop to zero units in the linked brokerage account (`app/api/brokerage/sync/route.ts:76`) — worth fixing, but a distinct piece of work from this one, since it involves diffing sync results rather than a user-initiated action.
- **Retroactively fixing history for holdings already deleted.** `removeHolding`/`removeHoldingBySymbol` are hard deletes with no soft-delete or audit trail. The two positions already removed manually cannot be reconstructed — this spec prevents recurrence, it doesn't recover the past.
- **Multi-rebuy cost-basis precision.** If a user fully sells a symbol and later rebuys it at a different price, `avg_price` on the reopened `user_holdings` row starts fresh (matches current buy behavior). The chart's "currently held" contribution always uses the *latest* `avg_price` across the position's full ownership window — same simplification the current chart already makes for ordinary buys. Documented limitation, not fixed here.

## Data model

New table, fully additive — no changes to any existing row or column.

```sql
CREATE TABLE public.holding_sales (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_holding_id  UUID REFERENCES public.user_holdings(id) ON DELETE SET NULL,
  symbol               TEXT NOT NULL,
  company_name         TEXT NOT NULL,   -- snapshotted: must survive the holding being later hard-deleted
  quantity_sold        NUMERIC NOT NULL CHECK (quantity_sold > 0),
  avg_cost_basis       NUMERIC NOT NULL, -- user_holdings.avg_price at the moment of this sale
  sale_price           NUMERIC NOT NULL,
  realized_pl          NUMERIC NOT NULL, -- (sale_price - avg_cost_basis) * quantity_sold, precomputed
  sale_date            DATE NOT NULL,
  trading_currency     TEXT,
  asset_type           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_holding_sales_user_symbol ON public.holding_sales (user_id, symbol);
CREATE INDEX idx_holding_sales_user_date   ON public.holding_sales (user_id, sale_date DESC);

ALTER TABLE public.holding_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own holding sales"
  ON public.holding_sales FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

Key decisions baked into this shape:
- `original_holding_id` is a soft reference (`ON DELETE SET NULL`) — a sale record must outlive the holding row it came from (the user can still hard-delete a fully-closed position afterward without losing sale history).
- `company_name`, `trading_currency`, `asset_type` are snapshotted rather than joined live, for the same reason.
- `avg_cost_basis` is snapshotted per-sale rather than read live from `user_holdings.avg_price`, because that field keeps changing (future buys/sells, or a full-close-then-reopen) and would otherwise silently corrupt historical realized-gain figures.

## Selling — data layer

New function in `lib/holdings/holdings-db.ts`, alongside the existing `addOrUpdateHolding`/`removeHolding`:

```ts
export async function sellHolding(
  userId: string,
  holdingId: string,
  input: { quantitySold: number; salePrice: number; saleDate: string }
): Promise<{ success: boolean; sale?: HoldingSale; holding?: UserHolding; error?: string }>
```

Logic:
1. Look up the holding, verify ownership (`user_id = userId`), verify `source === 'manual'` (reject with a clear error otherwise — the UI won't offer this action for `snaptrade` rows, but the server enforces it too).
2. Validate `0 < quantitySold <= holding.quantity` (with a small epsilon, e.g. `1e-9`, to tolerate float rounding when "sell all" is requested against a fractional-share quantity).
3. Compute `realized_pl = (salePrice - holding.avg_price) * quantitySold`.
4. Insert the `holding_sales` row, snapshotting `avg_cost_basis = holding.avg_price`, `company_name`, `trading_currency`, `asset_type` from the current holding.
5. Update `user_holdings.quantity -= quantitySold` (leave `avg_price` untouched — average-cost accounting means the remaining shares' cost basis doesn't change when some are sold). If the result is ~0, leave the row in place at `quantity = 0` — it becomes a "closed" position by virtue of that filter, not a new status column.
6. Return both records so the UI can show a "You realized ±$X" confirmation immediately.

Sequential Supabase calls (insert then update), not wrapped in a Postgres transaction/RPC — consistent with how `addOrUpdateHolding` and every other holdings mutation in this codebase already work (no existing precedent for transactional holdings writes, and the failure window here is no larger than what already exists elsewhere).

**Undo path**: a manually-entered sale can be wrong (fat-fingered price, wrong date). Add `deleteHoldingSale(userId, saleId)` that deletes the `holding_sales` row and adds `quantity_sold` back onto the (still-existing, since we never hard-delete on full sell) `user_holdings` row. If the original holding was itself later hard-deleted (`original_holding_id` is null), the delete is blocked with a clear error — reversing into a nonexistent position isn't representable; the user would need to re-add the holding manually first.

## Server actions & hook

Following the existing pattern in `app/actions/holdings.ts` / `hooks/use-holdings.ts` exactly (Server Actions, not REST routes — this app has no `app/api/holdings/route.ts`; holdings mutations go through `'use server'` actions):

- `sellHoldingAction(holdingId, input)` → wraps `sellHolding`, session-derived `userId` like every other action here.
- `deleteHoldingSaleAction(saleId)` → wraps `deleteHoldingSale`.
- `getHoldingSalesAction()` → wraps a new `getHoldingSales(userId)` read (list, newest first).
- `useSellHolding()`, `useDeleteHoldingSale()`, `useHoldingSales()` hooks in `hooks/use-holdings.ts`, invalidating `['holdings', user.id]`, `['holdings-quotes']` (existing keys) plus a new `['holding-sales', user.id]` and the chart's own query key (see below) on success.

## Chart algorithm changes

`components/holdings/PortfolioPerformanceChart.tsx` changes in three places:

**1. Eligibility.** `eligible` currently means "has `quantity > 0`". It needs to become "has *any* history" — currently-held (`quantity > 0`) OR has at least one row in `holding_sales`. Practically: fetch `holdingSales` alongside `holdings` (new query, keyed off `['holding-sales', user.id]`), group sales by symbol, and build the eligible set as the union.

**2. Per-symbol contribution.** For each eligible symbol, replace the flat `(price[t] − basePrice) × holding.quantity` with a step function derived from that symbol's sales:

```
sharesHeldAt(t)   = currentQuantity + Σ(sale.quantity_sold for sale in sales where sale.sale_date > t)
realizedAt(t)     = Σ(sale.realized_pl for sale in sales where sale.sale_date <= t)
contribution(t)   = (price[t] − avg_price) × sharesHeldAt(t) + realizedAt(t)
```

For a symbol with zero sales this is identical to today's formula (`sharesHeldAt(t) ≡ currentQuantity`, `realizedAt(t) ≡ 0`) — existing unaffected positions render byte-identical. For a fully-closed symbol (`currentQuantity = 0`), once past the last sale date, `sharesHeldAt(t) = 0` and `realizedAt(t)` = the total realized gain, held flat forever — the "locked in permanently" behavior. For a partially-sold symbol, the pre-sale line is untouched, the post-sale unrealized slice shrinks to the remaining shares, and the realized chunk from the sold portion locks in.

Candle-fetching needs to start from the *earliest* of `date_purchased` or the position's first sale (in practice always `date_purchased`, since a sale can't predate a purchase) — no change needed there, just confirming the existing `holdingStart` logic still applies.

**3. Period basis (for percentage return).** Currently `periodBasis += basePrice * holding.quantity` uses today's quantity. Needs to use `sharesHeldAt(periodStartMs)` instead (reusing the same step function), so percentage return stays meaningful for a position that's been partially or fully sold within the selected window.

## UI changes

- **`SellHoldingModal.tsx`** (new, parallel to `EditHoldingModal.tsx`): symbol/company header, current quantity + avg cost shown for reference, shares-to-sell input with 25/50/75/100% quick-select buttons that populate it, sale price (defaults to live current price, editable — logging a past sale at its real historical price is the common case here), sale date (defaults to today, editable), live computed realized P/L preview (colored green/red) as the user types. Submits via `useSellHolding()`.
- **`HoldingsTable.tsx`** row actions: add a third icon button ("Sell") next to Edit/Remove. Hidden or disabled (with a tooltip) for `source === 'snaptrade'` rows. Keep "Remove" as-is for both sources — it's still the right action for "I added this by mistake," distinct from "I owned and sold this." Consider softening `DeleteHoldingDialog`'s copy to nudge toward Sell when applicable (e.g. only shown when `quantity > 0`): *"If you actually sold these shares, use Sell instead to keep your performance chart accurate."*
- **Closed positions list** (new, simple): symbol, company, shares sold, sale price, sale date, realized P/L (colored), sourced from `useHoldingSales()`. Lives on the holdings page, likely a collapsible section or a tab alongside the main table — exact placement is an implementation-time call, not a decision that needs to block this spec.

## Migration plan

Single new migration, `supabase/migrations/091_holding_sales.sql`, containing exactly the `CREATE TABLE` + indexes + RLS policy above. No backfill (nothing to backfill from — see Non-goals). No changes to `014_user_holdings.sql` or any of its subsequent ALTERs.

## Open implementation details (not blocking, just noted)

- Exact epsilon for "treat as fully sold" float comparison — `1e-9` proposed, matches the general precision `NUMERIC` already gives us.
- Whether the closed-positions list is its own page section or a modal/drawer — implementation-time UI call.
