# Conversion Optimization Research

Research backing the 2026-09-01 changes to the sign-up funnel (`/get-started`, `/register`, `/login`, and the shared `AuthModal`), plus a diagnosis of the landing page's bounce problem and recommendations to fold into its planned redesign. Written so future changes to these surfaces can be evaluated against the same evidence instead of gut feel.

## 0. Read this first: the traffic caveat

Vercel Analytics for the last 30 days showed **16 sessions on `/`, and 1 each on `/get-started`, `/login`, and `/register`.** That is not a funnel with a leak partway through — it's almost all bounce at the very first page, with too few downstream sessions to say anything statistically meaningful about `/register` or `/get-started` yet. Every recommendation below that touches those two pages is a **best-practice default**, backed by external research at other companies' scale, not a claim that it was tested and proven to lift *BullPen's* numbers — there isn't enough traffic yet to prove that either way. Treat this doc as "what to build now, correctly, given the literature" and revisit with real internal data once volume is higher. The instrumentation added alongside these changes (§5) exists specifically to make that revisit possible.

## 1. The landing page is the actual problem right now

16 sessions in, 3 total sessions reached any further page. That's roughly an 80%+ bounce rate at the very first screen, before a single form field is ever seen. Research on SaaS landing pages puts a "bad but not unusual" bounce rate at 50-70%, so BullPen's current number is on the worse end of that range, not an anomaly — but it also means: **no amount of polishing `/register`'s form fields moves the needle while the leak is this far upstream.** Fix the top of the funnel first.

Common causes of landing-page bounce, in rough order of impact per the research pulled below:

- **Message match / hero clarity.** Visitors decide to stay or leave within about 5 seconds of landing. High-performing SaaS headlines average under 8 words and lead with a benefit, not a feature list. If the ad, search result, or link someone clicked doesn't match what the hero says in the first few seconds, they bounce regardless of how good the rest of the page is.
- **Page speed.** Every extra 100ms of load time costs roughly 1% of signups; a 1-second delay can cost 20% of conversions. Getting Core Web Vitals under ~2s can be worth a 20-50% conversion lift on its own — this is often the highest-leverage, lowest-creative-risk fix available.
- **Trust signals below the fold, or missing.** Placing trust signals (security/compliance badges, "as seen in," user counts, testimonials) above the fold is worth a 20-50% lift over having them lower or omitted. BullPen's `/login` and `/register` currently have zero trust signals of any kind (no testimonials, no security copy, no social proof) — this is worth fixing regardless of the landing redesign, since it's cheap and these are the last pages a visitor sees before handing over an email and password to a finance app.
- **Testimonial next to the primary CTA**, specifically, produced a 68% conversion lift in one B2B SaaS study — placement mattered more than whether a testimonial existed elsewhere on the page.
- **Fintech-specific trust deficit.** Users deciding whether to trust an app with money/portfolio data make that call fast, often before finishing registration. A short, concrete line ("We verify your identity to protect your account") reads better than long legal text or no explanation at all.

Sources: [SaaS Hero — Landing Page Friction Points](https://www.saashero.net/design/landing-page-friction-points/), [Webstacks — SaaS Website Conversions 2026](https://www.webstacks.com/blog/website-conversions-for-saas-businesses), [Foonkie Monkey — Fintech UX that converts](https://www.foonkiemonkey.co.uk/blog/fintech-ux-that-converts-what-us-users-expect-from-sign-up-to-deposit-and-how-to-provide-it/), [CleverTap — Fintech onboarding best practices](https://clevertap.com/blog/onboarding-fintech-app-users/).

### What to do about it now vs. at the planned redesign

BullPen is already getting the single highest-leverage structural thing right: **the primary landing CTAs already route to `/get-started`** (the quiz-first funnel), not straight to a bare `/register` form — see §2. That's the harder architectural call already made correctly.

Since a full landing redesign is already planned, the recommendation is **don't spend real design effort re-skinning the current landing page** — but do treat the diagnostic list above (message match, load speed, trust signals) as a checklist for that redesign, and specifically consider an **embedded interactive "try it now" element** on the new hero: a SEMrush/Hotjar study of 38M sessions found homepages with an embedded, manipulable product demo converted at 16.7% vs. 13.3% for static marketing pages. For BullPen, given the app is already usable without an account, that could be as direct as a live, real-data mini stock lookup widget right in the hero — "search a ticker, no account needed" — rather than only describing the product in prose. This is the single idea in this document most worth carrying into the redesign.

Source: SEMrush/Hotjar study cited in [Userpilot — The Post-AI Role of Free Trial Landing Pages](https://userpilot.com/blog/free-trial-landing-page/).

## 2. Delay registration — quiz first, account second

**Duolingo and Noom both postpone account creation as long as possible.** Duolingo has users complete a real lesson before ever being asked to sign up; Noom runs a full personalized quiz (goals, habits, motivation) and shows a tailored plan before asking for payment info. The mechanism is commitment-and-consistency (Cialdini) plus sunk-cost: once someone has invested a few minutes answering questions about themselves, abandoning right before seeing "their" result feels like a bigger loss than the 30 seconds it takes to create an account to see it.

**BullPen already does this** — `/get-started` runs a 4-question quiz (experience level, risk tolerance, time horizon, investing goal) and only asks for an account on the final "reveal" screen, which recaps the answers back to the user as personalization before the signup form appears. `/register` exists as a separate, bare-form entry point for people who already know they want an account (e.g., a returning-intent visitor, or a direct link). No changes needed to this architecture — it already matches the pattern that outperforms a bare signup form in the research below. The changes in this pass instead fix real gaps in *how well* the existing quiz-first flow executes.

Sources: [RevenueCat — Noom's web-to-app funnel](https://www.revenuecat.com/blog/growth/web-to-app-onboarding-funnel), [Appcues — Duolingo's onboarding](https://goodux.appcues.com/blog/duolingo-user-onboarding), [Learning Loop — Commitment & Consistency](https://learningloop.io/plays/psychology/commitment-&-consistency).

## 3. The endowed progress effect — why the progress bar now starts "ahead"

This directly validates and implements the suggestion from this conversation: **start the progress indicator showing meaningful progress already made, not 0%.**

The effect comes from a landmark 2006 study (Nunes & Drèze, *Journal of Consumer Research*) using a car-wash loyalty card. One group got a blank card requiring 8 stamps; another got a card requiring 10 stamps but pre-stamped with 2 — the same real number of purchases (8) remained for both groups. The pre-stamped group redeemed at **34%** vs. **19%** for the blank-card group, and finished faster. Reframing a task as "already begun, partially complete" measurably beats framing the identical remaining effort as "not yet started."

**Implementation** (`components/get-started/OnboardingProgress.tsx`): the quiz has 4 questions + 1 reveal/signup screen = 5 real screens. The progress bar now shows `(current screen index + 1) / 5`, so question 1 of 4 displays at **20%** full, not 0% — the same number suggested in this conversation, arrived at independently by counting "you're on screen 1 of 5" inclusively rather than "you've finished 0 of 4 questions." Question 4 shows 80%; the reveal/signup screen — which previously had **no progress indicator at all**, making the final "pay the cost" step feel like it came out of nowhere after a 4-step flow that implied it was done — now correctly shows 100%.

Deliberately **no numeric label** ("Step 1 of 5") is shown, only the visual bar. The original stamp-card study worked through a purely visual cue, not an explicit fraction — showing "1 of 5" text on the very first question invites the scrutiny of "wait, shouldn't this be 0 of 4?" that undermines the effect; a plain proportional fill doesn't invite that analysis.

Sources: [Nunes & Drèze, SSRN abstract](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=991962), [Oxford Academic — JCR publication](https://academic.oup.com/jcr/article-abstract/32/4/504/1787425), [UX Collective — Endowed progress effect](https://uxdesign.cc/endowed-progress-effect-give-your-users-a-head-start-97d52d8b0396).

## 4. Form friction: the confirm-password field

Multiple independent studies converge on the same finding: **the "Confirm Password" field is one of the single highest-friction fields in any signup form**, responsible for a disproportionate share of both form abandonment and mid-form corrections (refocuses, deletes). One case study found it responsible for over a quarter of all signup abandonment on its own, and measured a **56.3% increase in conversions** after removing it — with no measurable increase in password-reset rate afterward, because a show/hide toggle on the single password field does the same verification job with less friction.

**Implementation**: `AuthFormSignup.tsx` (shared by `/register`, the `/get-started` reveal screen, and `AuthModal`) had a confirm-password field with its own validation branch. Removed — the existing `PasswordInput` component already has a show/hide eye-icon toggle, so a user can verify what they typed without a second field. The reset-password flow (`app/auth/reset-password/page.tsx`) was deliberately left untouched: it's a recovery flow, not a top-of-funnel conversion surface, and a mistyped new password there is a genuinely higher-cost mistake (locked out, has to re-request the reset email) than a mistyped signup password (just fails to log in immediately, "forgot password" is a one-click recovery).

More broadly, credential/form friction (password rules, required confirmation, extra fields) accounts for an estimated 40-60% of signup abandonment industry-wide, with password creation the single largest contributor specifically on mobile.

Sources: [Zuko — Confirm Password case study](https://www.zuko.io/blog/should-you-use-confirm-password-on-your-forms-and-websites-case-study), [UX Movement — Why Confirm Password Must Die](https://uxmovement.com/forms/why-the-confirm-password-field-must-die/), [Zuko — Which fields cause the biggest UX problems](https://www.zuko.io/blog/which-form-fields-cause-the-biggest-ux-problems).

## 5. Instrumentation: this funnel had zero event-level tracking

Before this change, the entire sign-up funnel — landing CTA clicks, each quiz question, every form submission and outcome — had **no PostHog events at all**, only the automatic `$pageview` capture that fires on every route change. That means it was structurally impossible to answer "where do people actually drop off" beyond comparing raw page-view counts (which is exactly the blunt signal that surfaced the landing-page bounce problem in this conversation — a real gap, but not enough to diagnose *why*).

Added (all behind the existing cookie-consent gate, no new consent surface):

| Event | Where | Purpose |
|---|---|---|
| `landing_cta_clicked` | `LandingClient.tsx` | `{ location: 'nav'\|'hero'\|'pricing'\|'final_cta', action: 'sign_up'\|'sign_in'\|'subscribe' }` — which CTA actually gets clicked, broken out by page position |
| `get_started_step_viewed` | `GetStartedFlow.tsx` | Fires per screen (`step_key`, `step_number`) — this is what makes a real drop-off funnel possible across the 5 quiz screens |
| `get_started_step_answered` | `GetStartedFlow.tsx` | Which answer was chosen per question, if question-level drop-off ever needs a "is one specific question the problem" answer |
| `get_started_completed` | `GetStartedSignupForm.tsx` | Fires on the email-signup success path only — see the code comment on why the Google OAuth path can't fire a component-level success event (full-page redirect), and how to infer it instead from `$pageview` |
| `signup_form_submitted` / `_succeeded` / `_failed` / `_email_confirmation_required` | `AuthFormSignup.tsx`, plus OAuth-path equivalents in `register/page.tsx`, `GetStartedSignupForm.tsx`, `AuthModal.tsx` | `{ source: 'register'\|'get_started'\|'modal', method: 'email'\|'google' }` — funnel-level signup outcome, broken out by which page it happened on and which auth method |
| `login_form_submitted` / `_succeeded` / `_failed` | `AuthFormLogin.tsx`, plus OAuth equivalents in `login/page.tsx`, `AuthModal.tsx` | Same shape, for sign-in |

This is deliberately the minimum viable instrumentation, not a full analytics rebuild — it's what's needed to build a PostHog funnel from landing CTA → quiz step 1 → ... → quiz step 5 → signup submitted → signup succeeded, and to break each stage out by source and method. Once real traffic accumulates, that funnel is what should drive the next round of changes, not this document.

## 6. What was deliberately not done, and why

- **No mandatory/gated onboarding.** `AuthProvider` has no "signed up but didn't finish the quiz" state — a user who signs up via bare `/register` (skipping `/get-started` entirely) just has `null` `experience_level`/`risk_profile`. Forcing the quiz post-signup was considered and rejected here: it would add a mandatory step for users who already converted, which research (and this document's own emphasis on friction reduction) argues against without stronger evidence it's worth the trade-off. Worth a dedicated look once `get_started_step_viewed` funnel data exists to show how much value is actually being left on the table.
- **No exit-intent popup.** Exit-intent popups convert 2-4% of abandoning visitors on average (up to ~10% for the best performers, usually with a discount attached) — real but modest, and BullPen doesn't have an obvious discount lever for a free product tier. Lower priority than fixing the upstream landing-page bounce, which affects 100% of visitors rather than trying to catch the ones already leaving.
- **No social-login-first redesign.** Social login can lift signup conversion 20-40% by removing form friction entirely, and BullPen already puts Google OAuth first, above the email form, on every auth surface — this is already done. Adding more providers (Apple, etc.) is a reasonable future addition but out of scope here.
- **No landing page copy/layout changes.** Per the stated plan to redesign it separately — see §1 for what to carry into that redesign instead of duplicating effort now.

## Sources consulted

- Nunes, J. & Drèze, X. (2006). *The Endowed Progress Effect: How Artificial Advancement Increases Effort*. Journal of Consumer Research 32(4). [SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=991962) · [Oxford Academic](https://academic.oup.com/jcr/article-abstract/32/4/504/1787425)
- [Zuko — Should you use "Confirm Password"? A case study](https://www.zuko.io/blog/should-you-use-confirm-password-on-your-forms-and-websites-case-study)
- [UX Movement — Why the Confirm Password Field Must Die](https://uxmovement.com/forms/why-the-confirm-password-field-must-die/)
- [SaaS Hero — 12 Landing Page Friction Points Killing B2B SaaS Conversions](https://www.saashero.net/design/landing-page-friction-points/)
- [Webstacks — How to Skyrocket SaaS Website Conversions in 2026](https://www.webstacks.com/blog/website-conversions-for-saas-businesses)
- [Userpilot — The Post-AI Role of Free Trial Landing Pages](https://userpilot.com/blog/free-trial-landing-page/) (SEMrush/Hotjar embedded-demo study)
- [RevenueCat — Inside Noom's Web-to-App Onboarding Funnel](https://www.revenuecat.com/blog/growth/web-to-app-onboarding-funnel)
- [Appcues — Duolingo's user onboarding experience](https://goodux.appcues.com/blog/duolingo-user-onboarding)
- [Foonkie Monkey — Fintech UX that converts](https://www.foonkiemonkey.co.uk/blog/fintech-ux-that-converts-what-us-users-expect-from-sign-up-to-deposit-and-how-to-provide-it/)
- [CleverTap — Mastering Fintech App Onboarding](https://clevertap.com/blog/onboarding-fintech-app-users/)
- [Ventureharbour — 5 Studies: Form Length & Conversion Rates](https://ventureharbour.com/how-form-length-impacts-conversion-rates/)
- [Corbado — Social Login Conversion Rate: Benchmarks & Pitfalls](https://www.corbado.com/blog/social-login-conversion-rate)
- [Wisepops/Hellobar — Exit Intent Popup conversion data](https://www.hellobar.com/blog/exit-intent-popup-guide/)
- [Learning Loop — Commitment & Consistency](https://learningloop.io/plays/psychology/commitment-&-consistency)
