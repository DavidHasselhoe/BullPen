# Free-to-Paid Conversion for a Consumer Investing App: Activation, Signup Friction, Paywalls, Pricing, Lifecycle, Competitors, Price Level, Measurement

Research date: 2026-10-08. Context: BullPen (web, freemium + card-required 7-day Pro trial offered at end of onboarding, $12/mo or $9/mo billed annually).

Source-quality legend used below: **[Primary]** = original publisher of the data; **[Vendor]** = data from a company selling the tool (real data but self-interested); **[Aggregator]** = blog repeating stats whose original source is unclear, treat as directional only. **Mobile** = data from mobile app stores, not web. **B2B** = SaaS, not consumer.

---

## 1. Activation: what is an "aha moment", how strongly does it predict conversion, time-to-value, quiz personalization

### Takeaway
Early activation is the strongest leading indicator available: products in the top quartile at Day 7 are mostly the same products in the top quartile at 3 months, and almost all trial starts happen in the first session. Personalised onboarding (quiz/goal selection) has repeated, modest but real wins (roughly +8% to +20% on trial starts, paid conversion or ARPU) in published mobile case studies.

### Cited Findings
- Amplitude 2025 Product Benchmark Report (2,600+ companies, data Sep 2023 to Sep 2024, published 2025-09-30): getting just 7% of a signup cohort to return on Day 7 puts a product in the top 25% for activation; "69% of top day seven performers were also top three-month performers"; across half of all products, over 98% of new users are inactive by the two-week mark. [Primary] — [Amplitude, 7% retention rule](https://www.amplitude.com/blog/7-percent-retention-rule)
- Same report, Financial Services: 90th-percentile three-month retention is 19.5%; enterprise financial products show top-decile Day 7 retention of 12.4% vs a 2.1% median. [Primary] — [Amplitude](https://www.amplitude.com/blog/7-percent-retention-rule)
- Adapty State of In-App Subscriptions: 89.4% of trial starts happen on Day 0 (87-90% across every region); if the first session is missed, the chance a user ever starts a trial drops to 11%. [Vendor, Mobile] — [Adapty](https://adapty.io/blog/how-to-personalize-onboarding-and-paywalls-in-your-mobile-app/)
- RevenueCat State of Subscription Apps 2025: "82% of trial starts occur the same day a user installs." [Vendor, Mobile] — [RevenueCat SOSA 2025](https://www.revenuecat.com/state-of-subscription-apps-2025/)
- Reforge framework: setup, aha and habit are three separate moments; the aha moment should be defined both qualitatively and as a quantitative "core action within a time window", and most onboarding stops at setup. A true aha metric should pass a causal test (raising the share reaching it raises retention). [Aggregator summarising Reforge] — [Koji, aha moment research](https://www.koji.so/docs/aha-moment-research)
- Time-to-value benchmark across 547 SaaS companies: median ~1 day 12 hours; "fully activated users retain at 3-7x the rate of non-activated users at 60 days". [Aggregator, B2B; original appears to be Userpilot's benchmark, not verified] — [Koji](https://www.koji.so/docs/aha-moment-research)
- Personalised onboarding (Adapty test, productivity app): +8.5% trial starts, +17% paying conversions, +22% ARPU, larger in the US. [Vendor, Mobile] — [Adapty](https://adapty.io/blog/how-to-personalize-onboarding-and-paywalls-in-your-mobile-app/)
- Headspace: +10% free-trial conversion when users could select multiple goals in onboarding. Rizz App: +10% onboarding conversion and +10% trial conversion with an intentional two-step flow. Five Minute Journal: +20% ARPU after onboarding redesign. [Vendor case studies, Mobile] — [Superwall Rizz case](https://superwall.com/case-studies/rizz-god); [RevenueCat Five Minute Journal](https://www.revenuecat.com/blog/growth/five-minute-journal-onboarding-redesign-arpu.md); Headspace figure via search summary of same set, original not fetched.
- Citrix ShareFile: +28% trial conversions from targeted in-app walkthroughs. [Vendor, B2B] — [Pendo](https://www.pendo.io/customers/citrix-increased-trial-conversions-through-targeted-onboarding/)
- Adapty: structural changes (placement, trial structure, plan composition) give roughly 2x the LTV improvement of visual-only paywall changes; teams that run paywall/trial experiments "earn up to 40x more revenue" (correlational, not causal). [Vendor, Mobile] — [Adapty](https://adapty.io/blog/how-to-personalize-onboarding-and-paywalls-in-your-mobile-app/)

### Inferences
- For BullPen, candidate aha events are concrete and measurable: (a) first "Why did this stock move today" explanation read on a stock the user owns or watches, (b) first Ask Bull answer about a held/watched ticker, (c) holdings added or brokerage synced. The right one is whichever most separates Day 30 retained vs churned users in PostHog; this should be validated with a correlation pass, then a causal experiment (push more users to it, check retention).
- Because 80-90% of trial starts in subscription apps happen in the first session (mobile data, but the mechanism is general), the end-of-onboarding trial offer is BullPen's highest-leverage paywall. Its performance depends on whether the user has seen Pro value (e.g. an actual Why Today explanation on their own stock) *before* that screen.
- The quiz is worth keeping if its answers visibly change what the user sees next (watchlist seeded, Bull's tone, which Pro feature the trial screen leads with). Quizzes that only collect data add friction without the personalisation lift.

### Gaps
- No published activation-to-paid-conversion correlation specific to consumer investing/research apps was found.
- Amplitude's financial-services numbers mix banking, brokerage and enterprise fintech; no research-tool-only cut.
- Facebook "7 friends in 10 days" / Slack "2,000 messages" style aha definitions are widely cited but are 2010s anecdotes; not used here.

---

## 2. Signup friction: email verification, social login, form fields, age gate, guest/try-before-signup

### Takeaway
Every gate before value costs signups; the best-evidenced wins are (1) letting people use the product before registering (Duolingo), (2) one-tap social login (Google), and (3) not blocking access on email confirmation. Requiring account creation is the second biggest controllable reason for checkout abandonment in e-commerce.

### Cited Findings
- Duolingo moved the signup screen back a few steps so users could complete a lesson first: ~20% increase in DAUs; later hard/soft wall optimisation added another 8.2% DAU about three years on. [Primary-adjacent: Duolingo growth lead interviews; older, ~2016-2019] — [Taplytics on Duolingo](https://taplytics.com/blog/duolingo-ab-test-onboarding); [First Round Review](https://review.firstround.com/the-tenets-of-a-b-testing-from-duolingos-master-growth-hacker/)
- Baymard 2025 (survey of 4,560 US shoppers): 26% abandoned a purchase because the site required creating an account; 22% because checkout was too long/complicated; average cart abandonment 70.19%. [Primary, e-commerce, web] — [Baymard](https://baymard.com/blog/current-state-of-checkout-ux)
- Google Identity case study, Reddit: Sign in with Google increased sign-ups by 50%, and One Tap added another 90% (combined platform conversion +185%). [Vendor, Google's own case study] — [Google Identity, Reddit case study](https://developers.google.com/identity/sign-in/case-studies/reddit?authuser=5)
- Other Google One Tap case studies: Vikatan +270% new accounts; Iron Company 8x sign-ups. [Vendor] — [Google Identity case studies](https://developers.google.com/identity/sign-in/case-studies?authuser=9)
- Email verification: requiring verification before access improves data quality but reduces activation; letting users in immediately with a verification prompt "often produces better overall outcomes". [Aggregator, no hard numbers] — [Atticus Li, signup A/B tests](https://atticusli.com/blog/posts/what-to-ab-test-in-signup-flows/)
- Freemium (no card) vs free trial: Kyle Poyar/ChartMogul/ProductLed 2026 report (200 B2B products): freemium generates ~90 signups per 1,000 visitors vs ~45 for free trials; median freemium-to-paid 8%. [Aggregator citing primary, B2B] — [Userpilot summary](https://userpilot.com/blog/freemium-saas/)
- Card-required trials attract fewer signups but more payers: ~35 signups per 1,000 visitors (card required) vs 45 (opt-in), with the card-required cohort producing "almost three times" as many paying customers. [Aggregator, B2B, age of underlying data unclear] — [Visionary Marketing 2026 trial benchmark](https://visionary-marketing.co.uk/blog/saas-free-trial-conversion-statistics-2026)

### Inferences
- BullPen currently stacks several gates before value: email confirmation required, age gate (DOB), multi-step quiz, then a card-required trial offer. Each is individually justified (the age gate is a legal decision and must stay), but email-confirmation-before-access is the one with the weakest justification and the clearest evidence against it. Allowing a confirmed-later session (with Pro/trial or sending features gated until confirmed) is the obvious test.
- A guest mode (search, open a stock page, read one Why Today explanation without an account) mirrors Duolingo's result; BullPen already has public stock pages and signed-out gates, so the signup prompt can be placed at the moment of intent (save to watchlist, ask Bull) rather than up-front.
- Google sign-in is present; Google One Tap on public stock pages is a cheap test with large vendor-reported effects.

### Gaps
- No credible, recent, numeric A/B result on "email confirmation before access" was found; all sources are vendor blogs without data. PostHog funnel data (signup started -> confirmation clicked) is the only reliable number for BullPen.
- No published data on age-gate (DOB field) drop-off.
- No reliable "% drop per additional form field" benchmark from 2023+ was found (the commonly cited figures are pre-2015 and unattributed).

---

## 3. Paywall design and placement: contextual vs generic, usage limits, soft vs hard, previews, touchpoints

### Takeaway
Hard paywalls convert ~5x better than freemium on mobile with similar year-1 retention, but the freemium trade-off is reach. Within freemium, the onboarding paywall is the single best-converting placement, contextual gates at feature limits are the second leg, and paywalls that *show* the premium feature (visual preview) beat text bullet lists.

### Cited Findings
- RevenueCat SOSA 2026 (115,000+ apps, $16B+ revenue, iOS/Android/web): Day-35 download-to-paid is 10.7% for hard paywalls vs 2.1% for freemium (5x); year-1 retention "nearly identical" between models; D14 revenue per install $2.32 hard vs $0.27 freemium. [Vendor, mostly Mobile] — [RevenueCat SOSA 2026](https://www.revenuecat.com/state-of-subscription-apps)
- RevenueCat SOSA 2025: hard paywall 12.11% vs freemium 2.18% D35 download-to-paid. [Vendor, Mobile] — [RevenueCat SOSA 2025](https://www.revenuecat.com/state-of-subscription-apps-2025/)
- Adapty: onboarding paywalls with a trial are the best-converting placement at 1.78% average. [Vendor, Mobile] — [Adapty](https://adapty.io/blog/how-to-personalize-onboarding-and-paywalls-in-your-mobile-app/)
- Superwall guidance: show paywalls both on app open and on feature gates; "context-specific paywalls personalized to user journey increased conversion rates significantly" (no number on page). [Vendor] — [Superwall product managers page](https://superwall.com/solutions/by-team/product-managers)
- Unchaind (Superwall case): replacing a text paywall with a visual "app-preview" paywall showing premium features increased conversion by over 50% and estimated ARPU by 64%. [Vendor case study, Mobile] — [Superwall, Unchaind](https://superwall.dev/case-studies/unchaind)
- Blurred-preview gating is rare: of 809 tracked apps, 1 app used a blurred premium preview, vs lock icons (12%, 94 apps) and unlock CTAs (20%, 159 apps); the source calls blur "an untested bet, not an industry default". [Research site, observational] — [Lazyweb](https://www.lazyweb.com/research/are-blurred-preview-paywalls-actually-common)
- News paywall study summary: blurred article previews and images had no statistically significant effect on subscribing, while "decks and intros" decreased subscribe odds by 86.3% and 72.2%. [Secondary, publishing context] — [Simon Owens](https://simonowens.substack.com/p/the-paywall-dilemma)
- Blinkist "trial timeline" paywall (today: full access; day 5: reminder; day 7: charged): +23% trial starts and -4% trial cancellations; addressed the #1 objection, fear of forgetting to cancel. [Primary-adjacent: Blinkist designer's write-up; ~2020-2021] — [UX Planet, Blinkist](https://uxplanet.org/how-solving-our-biggest-customer-complaint-at-blinkist-led-to-a-23-increase-in-conversion-b60ad514134b); [Growth.Design](https://growth.design/case-studies/trial-paywall-challenge)
- Reverse trials (everyone gets full premium for N days, then drops to free): Elena Verna reports 10-40% lift in freemium-to-premium conversion (~20% typical when paid features are actually used in the window). [Practitioner, B2B] — [Elena Verna](https://www.elenaverna.com/p/10-pricing-and-packaging-optimizations); [Userpilot](https://userpilot.com/blog/freemium-to-premium)
- Simply Wall St (direct competitor) runs exactly this: "When you register, your account starts with 7 days of full Premium access. No credit card required." [Primary] — [Simply Wall St plans](https://simplywall.st/plans)
- Mida: across its dataset, "price framing tests beat their control 11% of the time" (95% CI 7-18%). Most paywall copy tests lose. [Vendor] — [Mida](https://mida.so/tests/use-case-grok)

### Inferences
- BullPen's two placements (end-of-onboarding trial offer + limit-hit upgrade dialogs) match the best-evidenced pattern. The improvement opportunity is the content of each: a limit dialog for Why Today/Deep Dive should show the actual (partial) output for *that* stock, not a feature list. Showing the first paragraph of a real answer with a clean cut-off is a "preview" pattern; blurring is weakly evidenced. Note the house rule: generated text must never be truncated without an expand affordance, so a preview gate should end at a clear boundary ("Pro shows the full breakdown") rather than a mid-sentence ellipsis.
- A Blinkist-style trial timeline ("Today: full Pro. Day 5: we email you. Day 7: $X, cancel anytime in two clicks") is the most transferable tested result for a card-required trial.
- The biggest strategic question is card-required trial vs a no-card reverse trial (Simply Wall St's model). Evidence: card-required yields fewer trials but much higher trial-to-paid; reverse trials lift freemium conversion 10-40% in B2B. This should be an experiment, not a switch.

### Gaps
- No consumer-web (non-mobile) paywall placement benchmarks were found; RevenueCat/Adapty/Superwall data is mobile-dominant.
- No published optimal "number of upsell touchpoints" study; Superwall advises "both" placements but gives no frequency-cap data.

---

## 4. Pricing page: plan count, anchoring, annual vs monthly framing, trial display, social proof, guarantees, FAQ

### Takeaway
The hard evidence is thinner than the blog consensus. What is well supported: annual plans retain far better (44% vs 17% year-1 retention on mobile), annual uptake is falling, and price-framing copy tests usually lose. "2 months free beats save X%" is repeated everywhere but I found no primary experiment behind it.

### Cited Findings
- Year-1 retention by plan (RevenueCat 2025): annual 44.1% median (53.7% for low-priced), monthly 17.0%, weekly 3.4%; nearly 30% of annual subscriptions are cancelled (auto-renew off) in the first month. [Vendor, Mobile] — [RevenueCat SOSA 2025](https://www.revenuecat.com/state-of-subscription-apps-2025/)
- Annual adoption fell from 41.4% to 33.6% year over year; overall sales mix 42% monthly, 34% yearly. [Vendor, Mobile] — [RevenueCat SOSA 2026](https://www.revenuecat.com/state-of-subscription-apps)
- Superwall/Preu AI: adding an annual plan at 60% discount next to monthly raised proceeds per user 80% and trial conversion 22%. [Vendor case, Mobile] — [Superwall](https://superwall.com/solutions/increase-revenue-arpu-ltv)
- Stompers (Superwall): single-page paywall drove more annual trials; multi-page drove more monthly trials (annual trials +16%). [Vendor case, Mobile] — [Superwall Stompers](https://api.superwall.me/case-studies/stompers)
- Lazyweb analysis of 301 pricing-area experiments across 24 companies (Jul 2026): 17.9% preselected a default plan (usually annual); 57% mention annual but only 34% use a toggle; three framing patterns: savings label ("Save 20%"), monthly-equivalent price ("$4.99/month" billed yearly), preselection. Explicitly "observed diffs, not measured lift". [Research site, observational] — [Lazyweb billing toggle](https://www.lazyweb.com/research/monthly-vs-annual-billing-toggle-pricing)
- "2 months free" vs "Save 20%": claims of +21% vs +14% annual signups circulate, but the only concrete page I found (Mida's Grok test) is a **hypothetical** test design with no results. [Unverified; treat as folklore] — [Mida, Grok use case](https://mida.so/tests/use-case-grok); [Visionary Marketing](https://visionary-marketing.co.uk/blog/pricing-page-conversion-statistics-2026)
- Typical SaaS annual discount 15-25% (~20% average, 17% = "2 months free"). [Aggregator citing Price Intelligently, B2B] — [Monetizely](https://www.getmonetizely.com/articles/how-to-structure-the-perfect-annual-discount-a-guide-for-saas-leaders)
- Adapty: 9 in 10 subscriptions sell at full price; trial vs direct purchase LTV in Productivity $49.13 (trial) vs $56.95 (direct). [Vendor, Mobile] — [Adapty](https://adapty.io/blog/how-to-personalize-onboarding-and-paywalls-in-your-mobile-app/)
- Social proof legality: FTC final rule on fake reviews and testimonials (announced 2024-08-14, effective 2024-10-21) bans fake/AI-generated reviews, reviews from people without real experience, undisclosed insider testimonials, and buying fake social indicators; civil penalties up to ~$52,000 per violation. [Primary/regulator] — [FTC press release](https://www.ftc.gov/news-events/news/press-releases/2024/08/federal-trade-commission-announces-final-rule-banning-fake-reviews-testimonials)
- Guarantees in the category: Koyfin "100% satisfaction guarantee ... within 30 days ... full refund"; TipRanks "30-day money-back guarantee when you buy or upgrade a yearly plan"; Motley Fool 30-day "membership-fee-back" guarantee. [Primary for Koyfin/TipRanks; secondary for Fool] — [Koyfin pricing](https://www.koyfin.com/pricing/); [TipRanks plans](https://www.tipranks.com/plans); [Motley Fool pricing summary](https://www.liberatedstocktrader.com/motley-fool-pricing-discounts/)
- Simply Wall St pricing page trust copy: "Cancel directly from your account settings in two clicks, no email or phone call required", "The price you see is the price you pay", six-item FAQ (trial, card, cancel, data retention, switching, security), real store ratings (4.6 from 2.4K App Store / 8.7K Google Play), 7M users, press logos. [Primary] — [Simply Wall St plans](https://simplywall.st/plans)

### Inferences
- With a $12 vs $9 price, BullPen's annual saving is 25% ($36/yr, exactly 3 months free). "3 months free" and "$9/mo billed $108 yearly" are both accurate frames; test rather than assume.
- Defaulting the toggle to annual is common and supported by the retention gap, but under California's ARL and general FTC scrutiny the billed amount ($108 today) must be as prominent as the $9/mo equivalent.
- Social proof for a young product must be real: actual counts (e.g. number of explanations generated), real user quotes with permission, or nothing. Fabricated or AI-written testimonials are now a per-violation civil-penalty risk, and also violate BullPen's own "never ship synthetic numbers" principle.
- A refund/guarantee is category-standard among paid research tools (Koyfin, TipRanks, Fool all offer 30 days); BullPen's card-required trial partly substitutes, but an explicit "cancel in two clicks" line is cheap and matches Simply Wall St.

### Gaps
- No primary, numeric A/B test found for: number of plans (2 vs 3), decoy/anchor tiers, "months free" vs "%" framing, money-back guarantee lift, or FAQ presence on a consumer pricing page. Classic decoy evidence (Ariely's Economist example, 2008) is old and lab-based.
- No data on showing price "after trial" vs "today $0" framing beyond the Blinkist timeline result.

---

## 5. Lifecycle email and notifications for trial and free users

### Takeaway
The best-evidenced lifecycle lever is the trial-ending reminder, which is both a conversion/trust tool (Blinkist) and, for some trials, a legal requirement. Numeric email-sequence benchmarks found are from email-vendor blogs and should be treated as directional.

### Cited Findings
- Blinkist: offering a reminder before trial end (shown on the paywall) gave +23% trial starts and 4% fewer cancellations. [Primary-adjacent] — [UX Planet](https://uxplanet.org/how-solving-our-biggest-customer-complaint-at-blinkist-led-to-a-23-increase-in-conversion-b60ad514134b)
- Trial cancellation timing (RevenueCat 2026/2025): 55% of 3-day trial cancellations happen on Day 0; for 7-day trials 39.8% of cancellations are on Day 0; 14-day 35.7%; 30-day 31%. Short trials (<=4 days) grew from 42.1% to 46.5% of trials. [Vendor, Mobile] — [RevenueCat SOSA 2026](https://www.revenuecat.com/state-of-subscription-apps); [SaaStr summary](https://saastr.com/what-17000-subscription-apps-tell-us-about-free-trial-length-annual-plans-convert-86-better-with-30-day-trials-monthly-tops-out-at-two-weeks-and-ai-apps-hit-a-wall-at-16-days)
- Trial-to-paid by trial length (RevenueCat 2026): <=4 days 25.5%, 5-9 days 37.4%, 17-32 days 42.5%. [Vendor, Mobile] — [RevenueCat SOSA 2026](https://www.revenuecat.com/state-of-subscription-apps)
- California Automatic Renewal Law amendments effective 2025-07-01: for free/promotional periods **longer than 31 days**, a notice 3-21 days before conversion (renewal terms, price, frequency, cancel link); annual reminder for annual auto-renewals; online click-to-cancel "without engaging any further steps that obstruct or delay" (a save offer may be shown next to a prominent cancel button); keep consent records 3 years (or 1 year after termination, whichever longer); price-change notice 7-30 days ahead. [Primary legal analysis] — [Cooley](https://www.cooley.com/news/insight/2025/2025-06-04-california-automatic-renewal-law-amendments-take-effect-on-july-1-2025); [Fenwick](https://fenwick.com/insights/publications/california-tightens-requirements-for-automatically-renewing-subscriptions)
- Trial email benchmarks: trial nurture emails 20-35% open, 5-12% CTR; expiration sequences 40-60% open; "2-5% trial-to-paid without a sequence vs 8-15% with"; a 1-week goodwill extension recovers 5-10% of expired trials. [Aggregator/email vendor, no methodology] — [Sequenzy](https://sequenzy.com/blog/free-trial-expiring-email-sequence)

### Inferences
- A 7-day trial is not covered by California's >31-day reminder rule as summarised by Cooley, but sending a Day-5 reminder anyway is low-cost, matches the Blinkist result, and protects against chargebacks/complaints. The annual-plan reminder and click-to-cancel rules do apply to BullPen's annual Pro.
- Day-0 cancellation data implies the first trial session must deliver a Pro moment immediately (e.g. auto-generate a Why Today and a sample daily brief for the user's own holdings on trial start), and that a Day-1 email showing what Pro already did is better timed than a generic Day-3 nudge.
- The daily AI brief and price-move alerts are themselves lifecycle channels for free users; sending a weekly "here is what Pro would have told you" digest is a plausible test (speculation; no data found).

### Gaps
- No credible, recent, controlled data on win-back offer effectiveness for consumer subscriptions on web.
- No published effect sizes for push/in-app notification nudges in investing apps.

---

## 6. Consumer finance/investing specifics: competitor upgrade/pricing presentation, beginner trust, compliance-sensitive copy

### Takeaway
Competitors cluster into (a) cheap brokerage add-ons ($5/mo Robinhood Gold, 30-day free trial), (b) mid-priced research tools ($10-40/mo, Simply Wall St, Koyfin, Morningstar), and (c) annual-only newsletters with heavy intro discounts ($99-299/yr, Motley Fool, Seeking Alpha). Trust signals used: money-back guarantees, two-click cancel, real app-store ratings, institutional client logos, and pervasive risk disclaimers.

### Cited Findings
- **Simply Wall St** (fetched 2026-10-08): Free / Premium / Unlimited; 7-day full Premium on registration, no card; free tier = 1 portfolio, 10 holdings, 3 watchlists of 50, 5 company reports/month, 1 saved screener/alert, top-4 screener results. Prices not rendered in fetch. [Primary] — [Simply Wall St plans](https://simplywall.st/plans). Price per third parties: Premium ~$10.95/mo; Unlimited quoted inconsistently ($21.50/mo, or $30 monthly / $20/mo annual). [Secondary, conflicting] — [Wall Street Survivor](https://www.wallstreetsurvivor.com/?p=31812); [Loans Canada](https://loanscanada.ca/investing/simply-wall-st-review/)
- **Koyfin**: Free $0, Plus $39/mo, Premium $79/mo, Advisor Core $209, Advisor Pro $299; annual "up to 30%" savings with annual shown as default; 30-day full-refund guarantee; social proof = institutional logos (Schwab, BlackRock, Fidelity). Free tier: 2Y financials, 1Y estimates, 2 watchlists/screens, 2 dashboards. [Primary] — [Koyfin pricing](https://www.koyfin.com/pricing/)
- **TipRanks**: Premium ("our most popular plan"), Ultimate, Plus; 30-day money-back on yearly plans; prices not rendered. [Primary] — [TipRanks plans](https://www.tipranks.com/plans)
- **Seeking Alpha Premium**: $299/yr, 7-day free trial; seasonal promos of $30-60 off (first year $225-269). [Secondary] — [Financer review](https://financer.com/invest/seeking-alpha-premium-review/)
- **Morningstar Investor**: $34.95/mo or $249/yr, 7-day free trial. [Secondary] — [Freenance](https://freenance.io/products/morningstar-investor-review-2026-premium-mutual-fund-etf-research/)
- **Motley Fool Stock Advisor**: list $199/yr, new members $99 first year (fool.com ad pages: "offering new members its top stock-picking service for $99*"), 30-day fee-back guarantee. [Primary ad page + secondary] — [fool.com/intro](https://www.fool.com/intro); [Liberated Stock Trader](https://www.liberatedstocktrader.com/motley-fool-pricing-discounts/)
- **Robinhood Gold**: $5/month, "First 30 Days are free!", upgrade framed as "Supercharge your next move"; nearly every benefit tagged "Terms and limitations apply"; "All investing involves risk". Annual ($50/yr) per secondary source. [Primary + secondary] — [Robinhood Gold](https://robinhood.com/us/en/gold/); [Subger](https://subger.com/en/service/robinhood-gold)
- Beginner trust (FINRA Foundation + CFA Institute, 2023; 2,800+ respondents US/CA/UK/CN): Gen Z investors learned investing from social media (48%), internet search (47%), family (45%) more than from professionals (30%), yet rate financial professionals twice as trustworthy as social media; 41% of US/Canada Gen Z cite FOMO; 37% of US Gen Z cite influencers as a major factor in starting. [Primary] — [CFA Institute press release](https://www.cfainstitute.org/about/press-releases/2023/finra-cfa-institute-gen-z-research)
- Compliance: Lowe v. SEC (1985) held that bona fide publications of impersonal, disinterested investment commentary fall within the Investment Advisers Act publisher exclusion; Congress aimed to regulate *personalized* advice. [Primary] — [Cornell LII, 472 U.S. 181](https://www.law.cornell.edu/supremecourt/text/472/181)

### Inferences
- BullPen's personalised features (Ask Bull reading holdings, daily brief, portfolio-context answers) sit closer to "personalized" than a newsletter does; upgrade copy should sell understanding and time saved ("know why your stock moved"), never outcomes ("beat the market", "find winners"), and the publisher-exclusion logic argues for keeping AI output general/educational. This is legal-adjacent speculation; get counsel review for the paywall copy specifically.
- Beginners trust professional-feeling sources more than influencer hype; credibility signals that fit (named data sources, transparent methodology, real ratings, no performance claims) likely beat urgency/FOMO patterns that the Motley Fool-style newsletter market uses.
- No competitor surveyed uses AI explanations as the headline paid feature; Robinhood Gold now bundles AI-ish research too (not verified here).

### Gaps
- Public Premium: current pricing could not be retrieved (public.com/premium now surfaces "Public Reserve" at 3.75% APY; no Premium price found).
- Seeking Alpha, TipRanks, Simply Wall St live prices did not render via fetch (JS-heavy); numbers are from third-party reviews and may lag.
- No public conversion rates for any of these competitors.

---

## 7. Price level: is $12/mo ($9 annual) in line? Willingness to pay, regional pricing

### Takeaway
$12/mo sits at the low end of standalone investing research tools ($11-39/mo; $199-299/yr newsletters) and above the generic mobile-app median ($9.99/mo, $39.99/yr North America). Higher-priced apps convert *better* to trial on mobile, so BullPen is unlikely to be losing conversions on price level alone; the bigger risk is under-pricing relative to perceived value and AI costs.

### Cited Findings
- RevenueCat 2026: median monthly price North America $9.99 vs IN/SEA $3.75; yearly $39.99 vs $18.32; year-1 realised LTV $32 vs $14. [Vendor, Mobile, all categories] — [RevenueCat SOSA 2026](https://www.revenuecat.com/state-of-subscription-apps)
- RevenueCat 2025: higher-priced apps convert download-to-trial at 9.8% vs 4.3% for low-priced, and D35 download-to-paid 2.7% vs 1.5%; but "36% of users subscribed after a year" on cheap annual plans vs 6.7% for high-priced monthly. [Vendor, Mobile] — [RevenueCat SOSA 2025](https://www.revenuecat.com/state-of-subscription-apps-2025/)
- AI apps earn 41% more revenue per payer but churn 30% faster. [Vendor, Mobile] — [RevenueCat SOSA 2026](https://www.revenuecat.com/state-of-subscription-apps); [PPC Land](https://ppc.land/ai-apps-earn-41-more-per-user-but-churn-30-faster-revenuecat-finds/)
- Category comparators: Robinhood Gold $5/mo; Simply Wall St Premium ~$10.95/mo; Morningstar Investor $34.95/mo or $249/yr; Koyfin Plus $39/mo; Seeking Alpha Premium $299/yr; Motley Fool Stock Advisor $199/yr ($99 intro). — see section 6 sources.
- Regional/PPP pricing: claims of "20-70% increase in international sales" from ProfitWell analysis of 5,000 SaaS companies circulate, but only via secondary blogs. [Aggregator, unverified] — [Monetizely](https://www.getmonetizely.com/articles/how-can-purchasing-power-parity-transform-your-global-saas-pricing-strategy); North America D35 download-to-paid 2.6% vs IN/SEA 1.4%. [Vendor] — [RevenueCat SOSA 2026](https://www.revenuecat.com/state-of-subscription-apps)

### Inferences
- $108/yr annual Pro is well below Seeking Alpha/Morningstar/Fool ($199-299) and about half of Simply Wall St Unlimited's annual, so a price test upward (e.g. $15/$12 annual) is plausible once activation is fixed; RevenueCat's high-price-converts-better finding is correlational (pricier apps may simply be better), so test, don't infer.
- AI churn penalty suggests annual plans matter more for BullPen than for a typical tool: pushing annual at trial end directly addresses the 30%-faster AI churn.
- Since BullPen serves a Norwegian founder and 6 UI languages, regional pricing is relevant, but evidence quality is low; start by checking PostHog for non-US conversion before building PPP tiers.

### Gaps
- No survey-based willingness-to-pay data (Van Westendorp etc.) for beginner investors on AI research tools was found.
- No reliable primary source for PPP conversion lift.

---

## 8. Measurement: funnel events and step benchmarks (visitor -> signup -> activation -> trial -> paid)

### Takeaway
Track the funnel as distinct, timestamped events and compare each step to benchmarks from the right model: freemium (B2B ~3-8% eventual free-to-paid), opt-out card trials (~49-60% trial-to-paid, B2B), mobile trials (~25-45% trial-to-paid by length), and mobile freemium download-to-paid ~2%.

### Cited Findings
- Kyle Poyar, 1,000+ products (Lenny's Newsletter, 2023-08-01, mostly B2B): freemium self-serve good 3-5%, great 6-8%; free trial good 8-12%, great 15-25%; distribution: 20% of freemium products below 2.5%. [Primary, B2B] — [Lenny's Newsletter](https://www.lennysnewsletter.com/p/what-is-a-good-free-to-paid-conversion)
- 2026 update (200 B2B products, Poyar/ChartMogul/ProductLed): freemium median 8% (bimodal: ~25% below 2.5%, ~25% at 10-15%); 90 signups per 1,000 visitors for freemium vs 45 for trials. [Aggregator of primary, B2B] — [Userpilot](https://userpilot.com/blog/freemium-saas/)
- Opt-out (card required) trial-to-paid: 48.8% (older, widely cited) to 60.4% (2026 claim); opt-in 18.2% (older) to 25.2% (2026 claim). [Aggregator, B2B; provenance of 2026 figures unclear] — [Visionary Marketing](https://visionary-marketing.co.uk/blog/saas-free-trial-conversion-statistics-2026)
- Mobile (RevenueCat 2025): download-to-trial median 6.2% (P90 20.3%); trial-to-paid 25.5-45.7% by length; D35 download-to-paid 2.18% freemium. [Vendor, Mobile] — [RevenueCat SOSA 2025](https://www.revenuecat.com/state-of-subscription-apps-2025/)
- Activation benchmark: Day 7 return >= 7% of cohort = top quartile (Amplitude). [Primary] — [Amplitude](https://www.amplitude.com/blog/7-percent-retention-rule)
- Adapty: onboarding paywall with trial converts at 1.78% (paywall view to purchase/trial, mobile average). [Vendor] — [Adapty](https://adapty.io/blog/how-to-personalize-onboarding-and-paywalls-in-your-mobile-app/)

### Inferences
- Minimum PostHog event set for BullPen (speculative design, not sourced): `signup_started`, `signup_completed`, `email_confirmed`, `age_gate_passed`, `onboarding_step_viewed/completed` (per step), `trial_offer_viewed`, `trial_started`, `aha_event` (candidate list from section 1), `paywall_viewed` with `placement` and `feature` properties, `upgrade_clicked`, `checkout_started`, `subscription_started` (plan, interval), `trial_cancelled` (with day number), `trial_converted`, `subscription_cancelled`. Report D0/D1 trial cancellation share (compare to RevenueCat's 39.8% Day-0 for 7-day trials), paywall view-to-start per placement, and Day-7 return rate (compare to 7%).
- For BullPen's card-required trial, the benchmark to beat is trial-to-paid in the ~37% (mobile 5-9 day) to ~50-60% (B2B opt-out) range; below ~30% suggests the trial isn't delivering a Pro moment early. The overall free-signup-to-paid number should be judged against freemium medians (2-8%), not trial numbers.

### Gaps
- No consumer *web* subscription funnel benchmark (visitor -> signup) comparable to RevenueCat's mobile data was found; RevenueCat reports web revenue is only 3.2% of total (4.9% NA), so web-specific benchmarks remain thin.
- No investing-category-specific trial-to-paid benchmark was found.
