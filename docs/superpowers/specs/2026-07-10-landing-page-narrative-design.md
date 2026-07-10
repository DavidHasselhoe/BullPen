# Landing page: "one clear job" narrative redesign

**Date:** 2026-07-10
**Scope:** `app/page.tsx` / `components/landing/**` only (marketing landing page, logged-out visitors)

## Problem

The current landing page presents six product features as an equal-weight grid (AI chat, real-time charts, Daily Brief, portfolio, screener, alerts). It's a comprehensive feature list, not a hook — nothing tells a first-time visitor the one reason to open BullPen tomorrow instead of an app they already use. The AI-explains-the-market capability (Why Today? on-demand explanations + Daily Brief proactive summaries) is the most differentiated, beginner-relevant part of the product and is currently buried as one card among six.

## Goal

Reshape the landing page so "BullPen explains the market to you — on demand and every morning" is the single, unmistakable pitch, with the rest of the toolkit (charts, portfolio, screener, alerts) demoted to supporting proof rather than competing headline material.

## Non-goals (explicitly out of scope for this piece of work)

- No post-signup onboarding wizard (doesn't exist today; not being added here)
- No changes to the logged-in dashboard (`app/dashboard/page.tsx`)
- No social/leaderboard gating (separate follow-up task)
- No new API routes or backend changes — this is a presentational/copy restructure of existing components, reusing existing data (the landing page's existing `useLiveQuotes` hook via `/api/market/landing-quotes`)

## Core narrative decision

Why Today (on-demand, ask about any stock) and Daily Brief (proactive, pushed every morning) are treated as **two expressions of one job** — "always know what's happening and why" — not as two separate features. Every section that currently name-checks one should, where natural, gesture at both.

## Section-by-section plan

Section order and IDs (`#features`, `#how`, `#pricing`, `#faq`) are unchanged — `Nav.tsx` anchors depend on them and are not touched.

### Hero (`components/landing/Hero.tsx`)

- **Headline:** "The market, *explained.*" (accent-serif on "explained.", matching the existing headline style convention)
- **Subhead:** "Ask why any stock moved and get a real answer — sources included. Every morning, a Daily Brief tells you before you ask. Built for investors who want to understand, not just watch."
- **Top pill badge:** changes from "New — Daily Brief, your AI market summary every morning" to "New — Why Today? Ask any stock why it moved, get an answer with sources" (avoids duplicating the Daily Brief card that now appears directly below in the hero visual).
- **Hero visual:** replace `HeroChart` + the three `FloatingTicker` cards with a two-card composition:
  - Left card ("Why Today?"): reuses the existing reasoning-card content pattern from `Peek.tsx`'s `AiChatView` (question bubble "Why did NVDA jump 4.2% today?", AI answer with 3 catalysts, source pills), condensed to hero scale.
  - Right card ("Daily Brief"): reuses the existing `BriefVisual` pattern from `Features.tsx` (live clock/date, headline, portfolio-impact line, live pulse dot).
  - Side-by-side on desktop; stacked vertically on mobile, following existing responsive conventions in `landing-styles.css`.
  - The three floating ticker mini-cards (NVDA/BTC/TSLA) are dropped — the two-card composition is already content-rich, and `TickerStrip` (the very next section) already exists to carry the "live market" motion, so nothing is lost.
  - Keep one live element for authenticity: reuse the existing `useLiveQuotes` hook (already fetches AAPL/NVDA/BTC-USD for the current hero) to drive the Daily Brief card's date and one live price line. The Why Today card's specific example content stays static/illustrative — consistent with how `Peek.tsx`'s `AiChatView` already does this.

### TickerStrip

Unchanged.

### Features (`components/landing/Features.tsx`)

- New top row promotes the duo to equal billing, replacing the current AI+Charts pairing:
  - Left (span 7): "BullPen AI" card, existing `ChatVisual`, kicker/title updated to name "Why Today?" explicitly.
  - Right (span 5): "Daily Brief" card, promoted from its current span-4 slot (previously grouped with Portfolio/Screener), reusing the existing `BriefVisual`.
- New section heading: eyebrow "The core of BullPen", title "Two ways to always **know why.**", sub "Ask any stock why it moved, or let a Daily Brief tell you before you ask. Everything else is here to help once you're in."
- Real-time charts / Portfolio / Screener / Alerts & filings move into a demoted row below: same existing components/visuals (`CandleVisual`, `PortfolioVisual`, `ScreenerVisual`, alerts list), no new visual work — just a lighter plain-text label ("And once you're in, the rest of the toolkit:") instead of a full `SectionHeading`, and a visually smaller card treatment so it doesn't compete with the promoted duo above.

### HowItWorks (`components/landing/HowItWorks.tsx`)

One-line copy change only. Step 2 ("Build your watchlist") description becomes: "Search 10,000+ stocks, ETFs, crypto, and commodities — then ask BullPen AI why any of them just moved." Steps 1 (signup) and 3 (already "Wake up to your Daily Brief") are unchanged.

### Peek (`components/landing/Peek.tsx`)

Reorder the `VIEWS` array so `'ai'` (the existing Why-Today-style `AiChatView` demo) is first/default instead of `'screener'`. Pure reorder of the existing array — no new visuals, no logic changes (the component already indexes by array position).

### Testimonials, Pricing, FAQ, Footer

Unchanged.

### FinalCTA (`components/landing/FinalCTA.tsx`)

Headline changes from "Ready to invest with conviction?" to "Ready to know **why?**" (accent-serif on "why?", echoing the hero). Subhead's closing phrase changes from "Start getting smarter today" to "Start understanding today." Rest of the section (CTA button, trust badges) unchanged.

## File-level touch points

| File | Change |
|---|---|
| `components/landing/Hero.tsx` | New headline/subhead/badge copy; replace hero visual with two-card composition |
| `components/landing/Features.tsx` | Restructured grid (promoted duo + demoted row), new section heading copy |
| `components/landing/HowItWorks.tsx` | Step 2 description copy only |
| `components/landing/Peek.tsx` | `VIEWS` array reorder |
| `components/landing/FinalCTA.tsx` | Headline/subhead copy only |
| `components/landing/landing-styles.css` | Likely needs new responsive rules for the two-card hero (stacking breakpoint) |

**Unchanged:** `components/landing/LandingClient.tsx` (section order/composition), `Nav.tsx`, `TickerStrip.tsx`, `Testimonials.tsx`, `Pricing.tsx`, `FAQ.tsx`, `Footer.tsx`. No backend/API changes, no new routes.

## Verification plan

1. Apply `.agents/skills/ui-ux-pro-max/SKILL.md` guidelines while building (contrast, animation timing 150–300ms, reduced-motion support, touch targets) — required by CLAUDE.md for any frontend work.
2. `npm run lint` and `npm run build` must pass.
3. Start the dev server and view the actual rendered page via Playwright at both desktop and mobile viewport widths: confirm hero two-card stacking on mobile, Peek's new default tab, Features' new visual hierarchy, and that the live-quote fetch still populates the hero's live price.
4. Run `/impeccable polish` on the changed landing page surface before considering the work shippable — required by CLAUDE.md for hero/landing-page visual work a user will react to.

## Out of scope / explicit follow-ups

- Gating `/social` and `/leaderboard` behind a flag until there's real user density — separate task.
- Post-signup onboarding wizard — separate task, not designed here.
- Dashboard (`app/dashboard/page.tsx`) widget reshaping — separate task, not designed here.
