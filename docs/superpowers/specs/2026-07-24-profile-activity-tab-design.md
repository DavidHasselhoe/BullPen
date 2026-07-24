# Profile Activity Tab — Design Spec

**Date:** 2026-07-24
**Status:** Draft, pending review

## Problem

A user's public profile (`app/users/[username]/page.tsx`) shows who they are and what they currently hold, but nothing about what they *do* — comments they've posted on stocks, or how their portfolio has moved over time. There's no activity trail anywhere on the profile.

Two different histories are involved, and they're in very different states today:

1. **Comments** already exist as durable, timestamped rows (`stock_theses`, `stock_thesis_replies`) — they just aren't surfaced on the profile.
2. **Portfolio moves** mostly don't exist as events at all. Selling shares already logs a durable row (`holding_sales`, added 2026-07-23), but *buying more of an existing position* is a silent `UPDATE` on `user_holdings.quantity` — no record survives. There is currently no way to say "this user increased their Google position" after the fact.

This spec adds an **Activity tab** to the profile page that merges both into one chronological feed, and adds the missing event log for portfolio increases/opens (mirroring what `holding_sales` already does for the sell side).

## Goals

- An "Activity" tab on every user's profile (own and others', privacy-gated) showing, newest first:
  - Stock theses the user has posted, and replies they've left on others' theses.
  - Portfolio moves on their manually-entered holdings: opened / increased / trimmed / closed, with a relative percentage for increased/trimmed.
- Reuses the two existing privacy flags (`settings.profile_public`, `settings.holdings_public`) rather than inventing new ones.
- No share counts or dollar values disclosed — percentage-of-position only, matching how the existing Portfolio section already only reveals symbol + company name, never quantity or price.

## Non-goals (this pass)

- **Brokerage-synced (SnapTrade) holdings.** `sellHolding` is already manual-holdings-only (`source = 'manual'`), and the sync job has no before/after diffing today. Detecting buy/sell activity for synced accounts is a separate piece of work (new diffing logic in `app/api/brokerage/sync/route.ts`), out of scope here.
- **Raw edits as activity.** `updateHolding`/`updateHoldingBySymbol` (the Edit modal) do not generate activity events — they're corrections (fixing a typo in quantity/price), not trading actions. Only the dedicated "add shares" and "Sell" flows count.
- **`removeHolding`/`removeHoldingBySymbol` as a "closed" event.** Hard-deleting a holding row is a data-management action (e.g. "I added this by mistake"), not a trade — it does not generate an activity event. Only selling down to zero via `sellHolding` counts as "closed."
- **Historical backfill.** No backfill for portfolio events — there is no reliable way to reconstruct past buys (never logged) or past trim percentages (existing `holding_sales` rows don't store quantity-before-sale). Activity starts accumulating from ship date forward, same precedent as `health_score_history` (shipped 2026-07-09, also no-backfill).
- **A separate Activity-specific privacy toggle.** Visibility rides on the two existing flags (see Privacy below), not a new setting.
- **Self-view privacy bypass.** The existing `/api/users/[username]` route returns 403 for a private profile regardless of who's asking, including the owner viewing their own profile via the public route. The new Activity endpoint matches that behavior exactly rather than introducing a new special case — fixing that pre-existing gap is unrelated to this feature.

## Data model

One new table, fully additive:

```sql
CREATE TABLE public.portfolio_activity (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol         TEXT NOT NULL,
  company_name   TEXT NOT NULL,
  action         TEXT NOT NULL CHECK (action IN ('opened', 'increased', 'trimmed', 'closed')),
  percent_change NUMERIC,  -- only set for 'increased' / 'trimmed'; null for 'opened'/'closed'
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_portfolio_activity_user ON public.portfolio_activity (user_id, created_at DESC);

ALTER TABLE public.portfolio_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read portfolio activity"
  ON public.portfolio_activity FOR SELECT
  TO authenticated
  USING (true);

-- No client INSERT/UPDATE/DELETE — written only by the existing server-side
-- holdings-db.ts functions (service-role client), same pattern as health_score_history.
```

`company_name` is snapshotted (not joined live) for the same reason `holding_sales` snapshots it — the row must stay meaningful if the holding is later hard-deleted or renamed.

Comments need no schema change — they're read directly from the existing `stock_theses` and `stock_thesis_replies` tables at query time.

## Portfolio events — write points

Both insert points already exist in `lib/holdings/holdings-db.ts`; this adds one `INSERT` alongside each, fire-and-forget (`void ...`, matching the existing fire-and-forget pattern used for cache writes elsewhere in this codebase — an activity-log write failing should never block or fail the underlying holdings mutation):

**`addOrUpdateHolding()`** — after computing `newQuantity`:
- If no existing row, or `existingQty <= 0` (the function's already-coalesced `existing.quantity ?? 0` — covers both a previously fully-sold position being re-bought, and a holding tracked without a share count) → insert `action: 'opened'`, `percent_change: null`.
- Otherwise → insert `action: 'increased'`, `percent_change: (addQty / existingQty) * 100`.

**`sellHolding()`** — after computing `newQuantity`:
- If `newQuantity` is ~0 (same `SELL_EPSILON` already used for the "sell all" comparison) → insert `action: 'closed'`, `percent_change: null`.
- Otherwise → insert `action: 'trimmed'`, `percent_change: (input.quantitySold / currentQty) * 100`.

`addHolding()` (the plain "add a brand-new symbol" path, used when no existing row is found at all) also gets an `'opened'` insert — it's the other route to a first-time position, alongside `addOrUpdateHolding`'s no-existing-row branch.

## API

New route: `GET /api/users/[username]/activity?cursor=<ISO timestamp>`

Follows the exact resolution pattern already in `app/api/users/[username]/route.ts`:
1. Resolve `username` → user row (username, falling back to UUID) + `settings`.
2. If `settings.profile_public === false` → `403`, same as today, no exceptions.
3. Determine sources to query:
   - `stock_theses` (`user_id = target`) and `stock_thesis_replies` (`user_id = target`, joined to parent `stock_theses` for symbol + original author) are always included — there's no existing per-user opt-out for comment visibility, matching how theses are already "readable by authenticated users" with no privacy flag today.
   - `portfolio_activity` is included only if `settings.holdings_public !== false` — reusing the exact flag that already gates the Portfolio section's holdings list.
4. Fetch up to 20 rows from each included source where `created_at < cursor` (default: now), tag each with a `type: 'thesis' | 'reply' | 'portfolio'`, merge, sort by `created_at` descending, slice to 20, return with `nextCursor` (the 20th item's `created_at`, or `null` if fewer than 20 rows came back total).

Response shape:
```ts
interface ActivityItem {
  type: 'thesis' | 'reply' | 'portfolio';
  created_at: string;
  symbol: string;
  company_name?: string;       // portfolio only
  action?: 'opened' | 'increased' | 'trimmed' | 'closed';  // portfolio only
  percent_change?: number | null;                          // portfolio only
  content?: string;             // thesis/reply only
  sentiment?: 'bull' | 'bear' | 'neutral';  // thesis only
  reply_to_username?: string | null;        // reply only
}
```

## UI changes

**`app/users/[username]/page.tsx`** currently renders one continuous scroll (header → bio → about → portfolio card). This wraps the Portfolio card and a new Activity card in a shadcn `Tabs` (`components/ui/tabs.tsx`, already in the codebase — no new dependency):
- **Portfolio** (default, unchanged content).
- **Activity** (new) — lazy-fetches via a new `useProfileActivity(username)` TanStack Query hook on first tab-open, not on initial page load. `staleTime` ~3 min, `refetchOnWindowFocus: false` — matches the "social data, not price data" tier in CLAUDE.md's cache-hygiene table.

New `ActivityFeed` component renders one line per item, icon + sentence + relative timestamp (`formatMemberSince`-style helper, but relative — e.g. "2d ago"):

| type | rendering |
|---|---|
| portfolio, `opened` | 🟢 "Opened a new position in **GOOGL**" |
| portfolio, `increased` | 🟢 "Increased position in **GOOGL** by 50%" |
| portfolio, `trimmed` | 🔴 "Trimmed **MSFT** position by 25%" |
| portfolio, `closed` | 🔴 "Closed their position in **MSFT**" |
| thesis | sentiment badge + "Posted a take on **GOOGL**: \"content preview…\"" (links to the stock page) |
| reply | "Replied to @user's take on **GOOGL**: \"content preview…\"" (links to the stock page) |

"Load more" button appends the next page using `nextCursor` (simple, matches the app's existing pagination style elsewhere rather than infinite-scroll).

Empty state matches `PublicHoldingsList`'s existing empty-state visual pattern ("No activity yet").

This is a new UI surface for anyone viewing any profile — per `CLAUDE.md`, check `.agents/skills/ui-ux-pro-max/SKILL.md` during implementation, and run `/impeccable polish` on the profile page before this ships.

## Migration plan

Single new migration, `supabase/migrations/092_portfolio_activity.sql`, containing exactly the `CREATE TABLE` + index + RLS policy above. No changes to `014_user_holdings.sql`, `091_holding_sales.sql`, `037_social.sql`, or `048_thesis_replies.sql`. Applied immediately via Supabase MCP per `CLAUDE.md`'s migration protocol.

## Open implementation details (not blocking, just noted)

- Exact relative-timestamp formatting helper — reuse one if it already exists elsewhere in the codebase, otherwise a small new utility.
- Content preview truncation length for thesis/reply text (existing `ThesisSection.tsx` may already have a convention to match).
- Whether "Load more" or infinite scroll reads better in context — implementation-time UI call, not a decision that needs to block this spec.
