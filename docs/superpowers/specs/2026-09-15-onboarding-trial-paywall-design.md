# Onboarding redesign + day-one 7-day trial offer

Date: 2026-09-15 · Status: approved in conversation, pending spec review

## Why

- The current onboarding asks four survey questions (experience, risk, timeframe, interest). Only experience level visibly changes the app; risk and timeframe only feed optional hints to Ask Bull and Portfolio Builder, and interest feeds a sentence on the reveal screen. The "Your BullPen, tailored" screen shows answer chips and a paragraph, nothing concrete.
- The most personalizing action (picking stocks) happens after signup, as a dismissable dashboard popup.
- Users are most interested in an app on day one, so the trial offer belongs at the end of onboarding, right after they have set up something of their own.

Context: 19 users, 3 signups in the last 30 days, 0 paying. There is not enough traffic to A/B test, so this is designed from principles; instrumentation is added so it can be measured once traffic grows.

## Decisions (made with David)

| Topic | Decision |
|---|---|
| Trial length | 7 days everywhere (onboarding, /upgrade, landing pricing, FAQ, all locales) |
| Paywall | Skippable. Big "Start my free week" button, quiet "Continue with Free" link |
| Questions | Replaced by setup steps; only experience level survives, as a live example |
| Stock picks | Saved to the watchlist (not holdings) |
| Preview | Real free data before signup; no AI calls, no fabricated output |
| Explanation styles | Two (Plain English = beginner, Market terms = intermediate); advanced stays in Settings |
| Default plan on offer | Yearly |

## Part 1: The flow (5 screens, `/get-started`)

The progress bar keeps its endowed-progress fill (`OnboardingProgress`), now over 5 screens. Onboarding copy stays English-only, as today.

### 1. "How should BullPen explain things?"
Two selectable cards showing the same metric the way the app actually renders it:
- **Plain English**: label "Price vs Earnings" with the glossary description for `P/E` (`lib/finance/glossary.ts`). Sets `experience_level = 'beginner'`.
- **Market terms**: label "P/E (TTM)". Sets `experience_level = 'intermediate'`.

Copy is read from the glossary, not duplicated, so it cannot drift from what the app shows.

### 2. "Pick stocks you own or follow"
- Search via `useInstantSearch()` (client-side catalogue; no auth, no per-keystroke server cost).
- Suggestions: the nine names the dashboard starter popup already uses (NVDA, MSFT, META, AAPL, AMZN, TSLA, NBIS, MU, JNJ) plus SPY and QQQ. The list moves out of `PendingOnboardingFlush.tsx` into one shared module that both surfaces import, so they cannot drift. Each shows today's move where the shared movers cache already has it.
- Selected picks render as removable chips. Skippable ("Skip for now").
- Staged in the browser until signup, then added to the watchlist (`POST /api/watchlist`). Watchlist rows default `alerts_enabled = true`, which is what the alert crons read.

### 3. "What should we tell you about?"
Three labeled switches, all on by default:
- Big price moves (5% or more) → `settings.notifications.price_alerts`
- Earnings coming up → `settings.notifications.upcoming_earnings`
- Dividend dates → `settings.notifications.dividend_reminder`

Helper line: these arrive by email for the stocks they picked (matches the existing `check-price-moves`, `check-earnings-upcoming`, `check-dividends-upcoming` crons). Unset keys already mean enabled, so only an explicit off is written.

### 4. "Your BullPen is ready" + signup
- Each pick: logo, live price, today's move with a sign and arrow (never color alone). Prices come from one `POST /api/quotes/batch` call (public, ~1 credit per symbol).
- Health Score shown only when already cached. The preview must never trigger a fresh computation: an uncached symbol costs ~300 TwelveData credits and this screen is reachable anonymously. Implementation reads the cache only (new cache-only read path; no TwelveData call).
- One line recapping the alerts they turned on.
- A panel naming what Pro adds for their first pick (Why Today, Deep Dive, Daily Brief). Names features only; no generated or invented output.
- If they skipped picks: a default set labeled "Examples".
- Signup: existing Google + email form (`GetStartedSignupForm`), relabeled "Create my BullPen". Google sign-in passes `next=/get-started/trial` (already supported by `signInWithGoogle(next)` and the auth callback).

### 5. Trial offer (see Part 2)

### Removed
Risk, timeframe and interest questions, `lib/onboarding/reveal-copy.ts`, and the reveal chips. Existing users' stored answers are untouched; all three remain editable in Settings, and Ask Bull and Portfolio Builder already handle them being unset.

## Part 2: Trial offer and billing

### Offer screen (`/get-started/trial`)
- Requires a session; signed-out visitors are sent to `/get-started`. Already-Pro users are sent to `/dashboard`.
- Headline: "Here's a one week free trial on us!"
- 3 to 4 benefits phrased around their first pick (e.g. "Why Today? explains NVDA's move").
- Plan toggle, yearly preselected ($9/month billed $108/year) or monthly ($12/month), reusing `PRICING`.
- Primary button "Start my free week" → `startCheckout(cycle)` → Stripe Checkout (card required, `trial_period_days` from `PRICING.trialDays`).
- Terms directly under the button: "Free for 7 days, then $108/year. We'll email you 3 days before your trial ends. Cancel anytime." plus a link to the refund terms (30 days from first charge).
- Quiet link "Continue with Free" → `/dashboard`.
- If Stripe is not configured (waitlist fallback), only "Continue" is shown.

### Checkout return
`POST /api/billing/checkout` accepts an optional `returnTo: 'onboarding'` (whitelisted value, not a URL):
- success → `/dashboard?trial=started` (welcome state)
- cancel → `/get-started/trial`
Default behavior for /upgrade is unchanged.

### 7 days everywhere
- `PRICING.trialDays`: 14 → 7 (`lib/billing/entitlements.ts`).
- Update every hardcoded "14-day" mention: /upgrade, landing `Pricing.tsx` and `faq-data.ts`, `UpgradeSuccessModal`, and `billing.json` in all 7 locales (refresh `_meta.json` hashes the same way as the 2026-09-15 copy change).
- Subscriptions already trialing keep their existing `trial_end`.

### Reminder before the trial ends
- The live webhook endpoint (`we_1TosLYENL12SSga4xqgJqVRR`) currently receives `checkout.session.completed`, `customer.subscription.created|updated|deleted` and `invoice.upcoming` only. Add `customer.subscription.trial_will_end` (live Stripe change; ask David before applying).
- New webhook case: email "Your free week ends on {date}. You'll be charged {amount} unless you cancel." with a Customer Portal link, plus an in-app notification. Stripe fires this 3 days before `trial_end`.
- `invoice.upcoming`: skip the existing renewal email while the subscription is `trialing`, so one reminder is sent, not two.

### Repeat-trial transparency
`enforceTrialFingerprint()` ends a second trial on a known card immediately and charges it, while Checkout had shown a free trial. When it revokes a trial, send an email: this card already had a free trial, so billing started today, and the 30-day refund applies.

## Part 3: Edge cases, analytics, testing, rollout

### Edge cases
- Signups outside onboarding (`/register`, header Google sign-in) are unchanged. The dashboard starter-ticker popup (`PendingOnboardingFlush`) also hides when the user already has watchlist items, not only holdings.
- In-progress sessionStorage state from the old 4-question quiz is detected by shape and discarded; the user starts at screen 1.
- Staged experience level, picks and alert choices are flushed after signup before the trial screen loads (extends `flushPendingOnboardingData`). A failed write is retried by the existing dashboard fallback.
- Email already registered: the existing masked "check your inbox or sign in" message stays. A user who signs in to an existing account never sees the trial offer.
- Email confirmation is currently off (all 19 accounts confirmed at creation), so email signups have a session immediately. The existing "check your inbox" branch remains as the fallback if confirmation is ever enabled.
- UI copy follows CLAUDE.md: no em or en dashes. Every switch has a visible label; gain/loss is never color alone.

### Analytics (PostHog, via `trackEvent`)
- `get_started_step_viewed` with step keys `explain_style`, `pick_stocks`, `alerts`, `preview`, `trial_offer`
- `stocks_picked` (count), `alerts_chosen` (which switches on)
- `trial_offer_viewed`, `trial_offer_started` (cycle), `trial_offer_skipped`, `trial_checkout_completed`

### Testing
- Stripe test mode: real checkout with a 7-day trial; a test clock advanced to 3 days before `trial_end` to confirm the reminder email fires and the renewal email is skipped; repeat-card case confirms the new email.
- Browser walkthrough on the preview deploy at desktop and 400px: fresh email signup and Google signup through all 5 screens, "Continue with Free", and "Start my free week" to checkout and back. Test accounts deleted afterwards.
- `npm run lint` plus a successful Vercel preview build.
- `/impeccable polish` on the onboarding surface before it ships.

### Rollout (all on `preview`; production at end session)
1. Billing: 7-day trial + copy, trial-ending reminder + webhook event (with approval), repeat-trial email.
2. New onboarding screens 1 to 4.
3. Trial offer screen and checkout return.
4. Polish pass.

## Out of scope
- Wiring onboarding answers into dashboard layout (explicitly not chosen).
- Translating onboarding copy (it is English-only today).
- Changing prices or the refund policy.
