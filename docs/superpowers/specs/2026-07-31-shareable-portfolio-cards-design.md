# Shareable Portfolio Performance Cards — Design Spec

**Date:** 2026-07-31
**Status:** Draft, pending review

## Problem

The architecture is in good shape but the product has no users finding it. With no budget for paid acquisition, the highest-leverage lever available is organic sharing: giving people something they *want* to post unprompted when they have a good day, the way Robinhood/eToro/Webull all lean on "look at my gains" screenshots. BullPen has none of the substrate for this today — no OG image generation anywhere in the app (only the root layout and marketing landing page have any metadata at all), no referral/attribution tracking, and no shareable artifact derived from portfolio data.

This spec covers a single first slice: a shareable card showing **today's** portfolio performance, and the minimum plumbing to know whether a given share actually produced a signup.

## Goals

- A user having a good (or bad) day can share it as a link in one or two clicks, from where they already look at Today P&L.
- The shared link unfurls as a rich image preview in iMessage/X/Slack/Discord/WhatsApp, and is itself clickable — landing a logged-out visitor on a page with one clear signup CTA.
- Dollar amounts are never shown by default — percent only, since a visible net-worth figure is the single biggest reason people don't share financial results at all.
- We can tell whether a share produced a signup, since there's no way to know if this bet is working otherwise.
- Minimal new surface area: one additive table, three new routes, no changes to the existing `handle_new_user` auth trigger.

## Non-goals (this pass)

- **Downloadable images for Instagram/manual posting.** Link-first only. A bare image has no clickable path back to BullPen unless the user manually types the URL in their caption — weak for a first, measurable slice. Worth adding later if link-based sharing proves out and Instagram-specific reach becomes worth the extra image-export UI.
- **Sharing anything other than today's performance.** Thesis cards, health-score cards, and calendar-day cards (from the performance calendar shipped this session) are natural follow-ups, not this pass.
- **A full referral/rewards system.** This is attribution only (did a share produce a signup) — no credits, no invite quotas, no leaderboards.
- **Proactive share prompts.** Persistent button only, per BullPen's "confident, not gamified" brand personality — no toast/nudge on especially good days. Can reconsider once we see whether the passive button gets used at all.
- **A toast/notification system.** None exists anywhere in this codebase today. "Link copied" feedback is a button-label swap (`Copied!` for ~2s), not a new toast primitive — introducing one for a single button would be scope creep against YAGNI.

## Data model

New table, fully additive.

```sql
CREATE TABLE public.portfolio_shares (
  id             TEXT PRIMARY KEY,  -- short random slug (nanoid, 8-10 chars) — NOT sequential, so shares can't be enumerated
  user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  date           DATE NOT NULL,     -- the day being shared, US/ET
  pct            NUMERIC NOT NULL,  -- snapshotted at share time — the link never recomputes
  pnl_usd        NUMERIC,           -- nullable: only populated if the sharer opts to reveal it
  currency       TEXT NOT NULL,     -- display currency at share time, only relevant if pnl_usd is set
  sparkline      JSONB NOT NULL,    -- ~20-40 normalized points for the card's sparkline
  anonymous      BOOLEAN NOT NULL DEFAULT FALSE,
  signup_count   INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_portfolio_shares_user ON public.portfolio_shares (user_id, created_at DESC);

ALTER TABLE public.portfolio_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users create their own shares"
  ON public.portfolio_shares FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users view their own shares"
  ON public.portfolio_shares FOR SELECT
  USING (auth.uid() = user_id);
-- Public reads (the /share/[id] page, for anyone) go through a service-role
-- API route, not direct client access — RLS above only governs the owner's
-- own view of their share history, it does not need a public SELECT policy.
```

`user_id` is nullable with `ON DELETE SET NULL` (same pattern as `holding_sales.original_holding_id`): if a sharer later deletes their account, old links keep working — they just stop showing a live profile link and fall back to the anonymous card treatment.

The share is a **frozen snapshot, not a live query.** Once created, `pct`/`pnl_usd`/`sparkline` never change. Someone opening the link next week sees exactly what was true the moment it was shared — the same guarantee a screenshot gives. This is also what makes the OG image cacheable forever.

## Routes

**`POST /api/shares`** — authenticated. Body: `{ includeAmount: boolean, anonymous: boolean }`. Reads the same Today P&L figures already computed for [PortfolioDashboard.tsx](components/holdings/PortfolioDashboard.tsx), builds the sparkline from the day's already-fetched intraday data (same reconstruct-from-candles technique as the performance calendar — no new data source), inserts one row, returns `{ id, url }`.

**`GET /share/[id]`** — public, no auth required (verified: `middleware.ts` only refreshes the session cookie and sets security headers, it has no page-level auth gate — a new route here is public by default). Server Component that:
1. Looks up the share by `id` (service-role client, 404 if missing).
2. Sets `generateMetadata` OG tags pointing at `/api/og/share/[id]`.
3. Sets the `bp_ref` cookie (see Attribution below).
4. Renders the focused landing layout: card preview, one CTA ("Start tracking your portfolio"), and mounts the existing `AuthModal` component exactly as [LandingClient.tsx](components/landing/LandingClient.tsx) already does — no new auth UI.

**`GET /api/og/share/[id]`** — the actual image. `next/og`'s `ImageResponse`, Node runtime (not edge — this project's own Vercel guidance is that Fluid Compute/Node is preferred in nearly every case), rendering the editorial/sparkline layout at 1200×630. `Cache-Control: public, max-age=31536000, immutable` — safe because the row is immutable.

## Attribution

Profile creation happens via `handle_new_user()` (`supabase/migrations/009_auth_users.sql`), a `SECURITY DEFINER` trigger firing on `auth.users` insert. It has no visibility into any client-side state (cookies, query params), so **this spec does not touch that trigger.** Instead:

1. Visiting `/share/[id]` sets a first-party cookie `bp_ref=<shareId>` (30-day expiry, **not** `httpOnly` — only if not already set, first-touch attribution, so a user who bounces between multiple shared links before signing up credits whichever they saw first). It has to be readable by client JS: `signUp()` runs in the browser, and there's no monetary/access stake in this cookie (no rewards system, per Non-goals) that would justify hiding it from the page's own scripts.
2. Right after a **new** signup completes:
   - Email/password: `signUp()` ([lib/auth/auth.ts](lib/auth/auth.ts)) reads `bp_ref` from `document.cookie` once the profile row is confirmed to exist, and includes it in its own write.
   - Google OAuth: the `/auth/callback` route (already server-side) reads the same cookie via `next/headers`, using the same pattern already used to carry `next` through the OAuth round-trip (`redirectTo` on `signInWithGoogle`).
3. Either path writes `settings.acquired_via_share_id` on the new user's row — the same read-modify-write pattern already used everywhere in [use-user-settings.ts](hooks/use-user-settings.ts) — then increments that share's `signup_count`.
4. Only fires for a genuinely new account (checked once; idempotent since `settings.acquired_via_share_id` only gets set if unset).

This deliberately reuses "update settings after auth completes" rather than adding a new subsystem — it's a few lines in two existing auth paths, not a new attribution service.

## UI

**Share button**: a small icon button on the "Today P&L" stat card in [PortfolioDashboard.tsx](components/holdings/PortfolioDashboard.tsx). That card already returns `null` when `stats.valuedPositions === 0`, so the button naturally never appears on an empty portfolio. Disabled (with an explanatory tooltip) if today's figure doesn't exist yet (pre-market, or a position opened today with no prior close to diff against).

**Share sheet** (popover, not a full page): live preview of the card — big percent, sparkline, serif lead-in line, handle — plus two toggles:
- **Include dollar amount** (off by default)
- **Post anonymously** (off by default; swaps `@handle is up...` for `A BullPen investor is up...` on both the card and the landing page copy)

and one action: Web Share API on mobile (native OS share sheet), copy-to-clipboard on desktop (button label swaps to "Copied!" for ~2s, no toast component).

**Card layout** (confirmed via mockup): serif italic lead-in ("@handle is up"), large percent as the headline number, a thin sparkline of the day's move, BullPen wordmark top-left, handle + date bottom-left.

**Landing page layout** (confirmed via mockup): focused single-CTA version — card preview, "Start tracking your portfolio" button, "Free to start · no card required" subtext. No value-prop strip; the sharer's result is the pitch.

## Edge cases

- **No data yet for today** (pre-market, first day of a new position) — share button disabled with a tooltip, not a share with nothing in it.
- **Revisiting your own link while logged in** — renders identically to the logged-out view; no special-cased "this is you" branch.
- **Sharer deletes their account after sharing** — `user_id` → `NULL` via `ON DELETE SET NULL`; the page falls back to the anonymous rendering rather than 500ing or showing a broken profile link.
- **Share created, then user later changes display currency** — irrelevant; `pnl_usd`/`currency` (if set) are frozen at share time, consistent with the "screenshot, not live query" model.

## Build order

1. Migration: `portfolio_shares` table.
2. `POST /api/shares`.
3. `GET /api/og/share/[id]` (image generation) — buildable and testable in isolation before the page exists.
4. `GET /share/[id]` (page + `generateMetadata` + `AuthModal` mount + `bp_ref` cookie).
5. Share button + share sheet UI on the Holdings dashboard.
6. Attribution write in `signUp()` and `/auth/callback`.

## Verification

- Share a real Today P&L figure, confirm the link unfurls correctly when pasted into at least one real client (iMessage or Discord) — rich-preview rendering varies enough across platforms that this needs a live check, not just curling the OG route.
- Open the link in a private/incognito window (logged out) — confirm no auth redirect, and that the CTA opens `AuthModal` correctly.
- Sign up via a share link (fresh test account) — confirm `settings.acquired_via_share_id` is set and the share's `signup_count` incremented; sign up via a *second* share link in the same browser session without clearing cookies — confirm the first-touch cookie wasn't overwritten.
- Toggle "include dollar amount" and "anonymous" independently — confirm both the OG image and the landing page copy reflect them correctly, and that the default (both off) never leaks a dollar figure or handle.
- Delete the test account, reload the still-open share link — confirm it renders the anonymous fallback rather than erroring.
