# Holding Purchase Lots — Design Spec

**Date:** 2026-08-21
**Status:** Draft, pending review

## Problem

`user_holdings` stores one blended average cost per (user, symbol): `avg_price`/`date_purchased`, set when the position first opens and silently re-averaged on every subsequent top-up (`addOrUpdateHolding`'s weighted-average branch, [holdings-db.ts:211](../../../lib/holdings/holdings-db.ts#L211)). The individual purchase events that produced that average are never recorded.

`transaction-markers.ts` plots a single "buy" dot at `(date_purchased, avg_price)`. For a position bought in one shot, that's correct. For a position bought in two or more lots at different prices, it's actively misleading: the dot lands on the *first* purchase's date but at the *blended* price, a combination that never actually happened on the chart. In the reported case — 137 USD on the first buy, 94 USD on a later top-up, ~115.86 USD average — the dot appears deep inside the price area on the first buy's date, nowhere near either real transaction.

## Goals

- Every discrete purchase (initial buy or top-up) that goes through the existing add/top-up code paths gets recorded as its own lot, automatically — no new call site has to remember to do this.
- The chart plots one accurate dot per lot instead of one misleading averaged dot, for any manually-entered holding with more than one recorded purchase.
- `AddHoldingModal` lets a user optionally enter several purchase rows up front (for a position they already built up before adding it to BullPen) instead of only a single average.
- A new "Add purchase" action lets a user log a top-up later, symmetric with the existing "Sell" action.
- Existing single-purchase holdings, and brokerage-synced holdings, are unaffected — they keep rendering the current single dot.

## Non-goals (this pass)

- **Editing or deleting individual lots.** `EditHoldingModal` keeps directly overwriting `quantity`/`avg_price`/`date_purchased` as a raw override, same as today; it does not read or reconcile `holding_purchases`. If a holding has multiple lots and the user later uses Edit to correct something, the lots can drift out of sync with the holding's totals until the next purchase is added (which appends a new lot on top of whatever's already there). A lot-level edit/delete UI (mirroring the existing sale-editing flow) is a natural follow-up, not built here.
- **CSV import.** `app/api/holdings/import/route.ts` calls plain `addHolding` and skips (not merges) rows for a symbol that already exists — it never reaches `addOrUpdateHolding`'s top-up branch, so it's structurally incapable of producing multiple lots today. Nothing to change.
- **FIFO/LIFO tax lot accounting.** Same simplification `holding_sales` already made: realized/unrealized P/L continues to use one blended `avg_price` per holding. This feature only makes the *display* (chart dots) reflect real purchase events; it doesn't change how cost basis is computed anywhere else in the app.
- **SnapTrade-linked holdings.** Purchase-lot recording is manual-holdings-only (`source = 'manual'`), same restriction the Sell action already uses. Synced holdings keep showing the legacy single dot from their `date_purchased`/`avg_price`.
- **Bulk backfill migration.** No attempt to reconstruct lot history for holdings that were topped up before this ships. See "Lazy backfill" below for how existing holdings get a correct lot history the moment they're next touched, without a migration.

## Data model

New table, fully additive — no changes to any existing row or column.

```sql
CREATE TABLE public.holding_purchases (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  holding_id        UUID NOT NULL REFERENCES public.user_holdings(id) ON DELETE CASCADE,
  symbol            TEXT NOT NULL,
  company_name      TEXT NOT NULL,
  quantity          NUMERIC NOT NULL CHECK (quantity > 0),
  price             NUMERIC NOT NULL,   -- this lot's price per share, in trading_currency
  purchase_date     DATE NOT NULL,
  purchase_currency TEXT,
  purchase_fx_rate  NUMERIC,
  trading_currency  TEXT,
  asset_type        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_holding_purchases_holding ON public.holding_purchases (holding_id, purchase_date);
CREATE INDEX idx_holding_purchases_user    ON public.holding_purchases (user_id, symbol);

ALTER TABLE public.holding_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own holding purchases"
  ON public.holding_purchases FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

Key decisions baked into this shape:
- `holding_id` is `ON DELETE CASCADE`, unlike `holding_sales.original_holding_id` (`SET NULL`). Sales survive their parent holding's deletion because they back an independent "closed positions" list; purchase lots have no such standalone display — they exist only to feed markers on a holding's own chart, so once the holding is gone there's nothing left that reads them.
- `company_name`/`trading_currency`/`asset_type`/currency fields are snapshotted the same way `holding_sales` snapshots them, for display consistency (a lot's price is always in the currency it was entered in, independent of any later change to the parent holding).
- No `UNIQUE` constraint on `(holding_id, purchase_date)` — a user can legitimately buy the same symbol twice on the same day at different prices (e.g. two separate orders).

## Write paths

No new "write lots" surface needs to be built — it's added to the two functions that already handle every purchase:

**`addHolding()`** ([holdings-db.ts:129](../../../lib/holdings/holdings-db.ts#L129)) — after inserting the new `user_holdings` row, if `quantity` and `avg_price` are both present, insert one `holding_purchases` row for it (the whole position is lot #1).

**`addOrUpdateHolding()`** ([holdings-db.ts:211](../../../lib/holdings/holdings-db.ts#L211)), existing-row branch — after updating `user_holdings` with the new blended `quantity`/`avg_price`, insert a `holding_purchases` row for just `addQty` at `holding.avg_price` (the price passed in for *this* top-up, not the blended result).

Because `addOrUpdateHolding` is the same function behind:
- Bull's chat "add N more shares" client action ([BullpenChat.tsx:170](../../../components/ai/BullpenChat.tsx#L170)),
- onboarding flush ([PendingOnboardingFlush.tsx](../../../components/onboarding/PendingOnboardingFlush.tsx)),
- the new "Add purchase" UI action and the new "Multiple purchases" mode in `AddHoldingModal` (both below),

...all of these get accurate lots automatically, with no per-call-site wiring.

### Lazy backfill

A holding created before this ships has `quantity`/`avg_price` but zero rows in `holding_purchases`. If it's topped up after this ships, recording only the new lot would leave the lot total short of `user_holdings.quantity` — the chart would show one dot for the top-up and silently drop the pre-existing chunk of shares.

Fix, inside `addOrUpdateHolding`'s existing-row branch: before inserting the new top-up's lot, check whether `holding_purchases` already has any rows for this `holding_id`. If none, first insert a synthetic backfill lot from the holding's *pre-update* `quantity`/`avg_price`/`date_purchased` (the row already being fetched — the `select('id, quantity, avg_price')` on [holdings-db.ts:227](../../../lib/holdings/holdings-db.ts#L227) needs `date_purchased` and the currency fields added to it), then insert the new lot for `addQty`. This is self-limiting: once a holding has any lots, later top-ups just append.

Edge case: if the existing holding's `date_purchased` is null (it's an optional field), skip the synthetic backfill lot for that chunk — there's no date to put it at — and only record the new top-up's lot. Documented gap, not an error: that specific holding's chart will show the new dot correctly but silently under-represent the older, undated portion, exactly as today's fallback (no dot at all) already does for undated holdings.

This mirrors a call already made for `portfolio_activity` ([092_portfolio_activity.sql](../../../supabase/migrations/092_portfolio_activity.sql)): no bulk migration, starts accumulating correctly from the moment each holding is next touched.

## New purchase-lot type & queries

`lib/types/database.ts`:

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

export type InsertHoldingPurchase = Omit<HoldingPurchase, 'id' | 'created_at'> & { id?: string };
```

`getHoldingPurchases(userId)` in `holdings-db.ts`, `getHoldingPurchasesAction()` in `app/actions/holdings.ts`, `useHoldingPurchases()` in `hooks/use-holdings.ts` — all three follow the existing `getHoldingSales`/`getHoldingSalesAction`/`useHoldingSales` pattern exactly ([use-holdings.ts:242](../../../hooks/use-holdings.ts#L242)), same `['holding-purchases', user?.id]` query-key shape, same `staleTime`/`gcTime`.

## Chart marker changes

`lib/holdings/transaction-markers.ts`:

```ts
export interface PurchaseMarkerInput {
  purchase_date: string;
  price: number;
  quantity: number;
}

export function buildTransactionMarkers(
  holding: TransactionMarkerInput | undefined,
  sales: SaleMarkerInput[],
  purchases: PurchaseMarkerInput[] = []
): TransactionMarker[]
```

If `purchases` is non-empty, emit one `buy` marker per lot (`tsSeconds` from `purchase_date`, `price`, `quantity` from the lot). Otherwise, fall back to today's single dot from `holding.date_purchased`/`holding.avg_price` — this is what keeps brokerage-synced holdings and never-topped-up manual holdings rendering exactly as they do now. Sales are untouched.

Both call sites (`StockPricePanel.tsx:430`, `AdvancedChartModal.tsx:191`) add a `useHoldingPurchases()` read alongside their existing `useHoldingSales()`, filter to the current ticker the same way `mySales` is already filtered ([StockPricePanel.tsx:290-293](../../../components/stock/StockPricePanel.tsx#L290-L293)), and pass the result as the third argument.

## UI changes

**`AddHoldingModal.tsx`** — a two-option pill above the quantity/price fields: **Single purchase** (today's form, unchanged — quantity, avg price, date) and **Multiple purchases** (repeatable rows, each with quantity/price/date, plus an "Add another purchase" button). Multiple-mode submits by sequentially `await`ing `addOrUpdateHoldingAction` once per row, in the order entered — the first call creates the holding via `addOrUpdateHolding`'s existing fallback-to-`addHolding` branch, each subsequent call tops it up. This reuses the exact tested averaging (and now lot-writing) logic instead of a new bulk-insert function; the displayed running total (quantity + computed average) updates as rows are added, purely client-side, before submit.

**`AddPurchaseModal.tsx`** (new, parallel to `SellHoldingModal.tsx`) — quantity, price, date for a single top-up against an existing holding. Restricted to `source === 'manual'`, same guard `sellHolding` already enforces server-side. Shows the resulting new average as a live preview. Submits via the existing `useAddOrUpdateHolding()` hook — no new server action.

**`HoldingsTable.tsx`** row actions — add a fourth icon button ("Add purchase") next to Edit/Sell/Remove, same visibility rule as Sell (hidden/disabled for `source === 'snaptrade'`).

## Migration plan

Single new migration, `supabase/migrations/111_holding_purchases.sql`, containing exactly the `CREATE TABLE` + indexes + RLS policy above. No backfill (see Lazy backfill above). No changes to `014_user_holdings.sql` or any subsequent ALTER on it.

## Open implementation details (not blocking, just noted)

- Exact copy for the pill labels and the "Add another purchase" row-add button — implementation-time UI call.
- Whether `AddPurchaseModal`'s live average preview reuses a shared calculation helper with `AddHoldingModal`'s multiple-purchases running total, or just duplicates the one-line weighted-average formula — small enough either way to decide while writing the code.
