# Free Trial Design for a B2C Freemium Subscription App (BullPen)

Research date: 2026-10-08. Scope: card-required (opt-out) vs no-card (opt-in) trials, trial length, reverse trials, freemium conversion, competitor trial models, regulatory/card-network constraints, hybrid tactics. Context: BullPen = freemium web app, Pro $12/mo or $108/yr, 7-day card-required Stripe trial, 3-day pre-charge reminder, 30-day refund window.

Source-quality legend used below: [PRIMARY] = publisher's own data page; [SECONDARY] = reputable summary of a primary report; [AGGREGATOR] = stats-roundup site that re-cites others (lower confidence, numbers often drift between citations).

---

## 1. Opt-in (no card) vs opt-out (card required): trial start rate, trial-to-paid, full funnel

### Takeaway
Every recent dataset agrees card-required trials convert trial-to-paid roughly 2.5-5x better (about 30-60% vs 8-25%), but they cut trial starts by roughly 3x, so the visitor-to-paid effect is much smaller and the sources disagree on its sign. All of the opt-in/opt-out benchmark data is B2B SaaS. No B2C/consumer dataset I found splits card vs no-card.

### Cited Findings
- **First Page Sage (published Sept 2025, Q1 2022-Q3 2025, 86 SaaS companies, 71% B2B, drawn from its own client analytics):** opt-out (card upfront) trial-to-paid **48.8%** vs opt-in (no card) **18.2%**, a 2.7x gap. [SECONDARY] (no-card figure 18.2% / card 48.8%) [Shno.co roundup](https://www.shno.co/marketing-statistics/free-trial-conversion-statistics); [Visionary Marketing 2026 benchmark](https://visionary-marketing.co.uk/blog/saas-free-trial-conversion-statistics-2026)
- First Page Sage visitor-to-trial (re-cited by Electroiq, so [AGGREGATOR]): opt-in organic **8.5%**, opt-in paid traffic 7.1%; opt-out organic **2.5%**, opt-out paid 2.2%; freemium signup **13.3%**; freemium free-to-paid **2.6-2.8%** — [Shno.co](https://www.shno.co/marketing-statistics/free-trial-conversion-statistics)
- **ChartMogul x Kyle Poyar (Growth Unhinged) 2026 Free-to-Paid Conversion Report (Jan 2026, 200 B2B software products, typical $1-10M ARR, $50-249 ARPU):** median free-to-paid across all models **8%**; "Free trials that require a credit card see **30%** free-to-paid conversion – more than 5x ones that don't require one." Only **20%** of free-trial products require a card. Model mix: free trial 57%, freemium 26%, reverse trial 7%, interactive demo 7%, paid trial 4%. Free-trial outcome distribution: 20% of products convert below 2.5%, 30% at 2.5-7.5%, 23% above 25%. — [Growth Unhinged](https://www.growthunhinged.com/p/free-to-paid-conversion-report) [PRIMARY]; also [ChartMogul Conversion Report](https://chartmogul.com/reports/saas-conversion-report/)
- ChartMogul/Poyar "good/great" bands as summarized by secondary sites: no-card trial good **4-6%**, great **10-15%**; card-required good **25-35%**, great **50-60%**. Per 1,000 visitors: standard (no-card) trial **45 signups -> 3.6 paying**; card-required **35 signups -> 10.5 paying** (about 2.9x more payers). [SECONDARY, I could not see the per-visitor model in the primary page text] — [search summary of ChartMogul/Growth Unhinged report](https://chartmogul.com/reports/saas-conversion-report/); [Shno.co](https://www.shno.co/marketing-statistics/free-trial-conversion-statistics)
- **Contradiction on full-funnel effect:** multiplying First Page Sage's own visitor-to-trial and trial-to-paid figures gives opt-in about 8.5% x 18.2% = **1.55% visitor-to-paid** vs opt-out 2.5% x 48.8% = **1.22%**, i.e. no-card slightly ahead per visitor; ChartMogul's per-1,000-visitor model (3.6 vs 10.5 per 1,000 = 0.36% vs 1.05%) has card-required well ahead. The two datasets disagree on visitor-to-trial drop-off (FPS: card cuts starts about 3.4x; ChartMogul: only about 1.3x). Calculation is mine from the cited inputs. — [Shno.co](https://www.shno.co/marketing-statistics/free-trial-conversion-statistics); [ChartMogul](https://chartmogul.com/reports/saas-conversion-report/)
- **Sixteen Ventures (Lincoln Murphy)** "best-in-class" bars, widely repeated: opt-in > **25%**, opt-out > **60%**; freemium "low single digits", big successes "high single digits". Explicitly practitioner experience, **no sample, no year** (originates in the early-2010s and is still cited). — [Sixteen Ventures](https://sixteenventures.com/saas-free-trial-benchmarks/) [PRIMARY, but anecdotal]
- **Recurly (subscription billing platform data; B2B and B2C):** about 6 in 10 trials convert; B2B median **66%**, B2C **~57%** (56.8%). B2C monthly-plan trials convert 59.8% vs annual 54.4%. Average B2C trial length 16.5 days vs B2B 15. Recurly data is mostly card-on-file trials (it is a billing processor), so it is effectively an opt-out benchmark. Report year not visible on the page I could load. — [Recurly subscriber acquisition benchmarks](https://recurly.com/research/subscriber-acquisition-benchmarks) (via search summary; page body didn't render) [SECONDARY]
- Recurly-attributed trend: trial conversion declined from **47% in 2021 to 34%** in the most recent year measured (as reported in a Sept 2026 article; the underlying Recurly report wasn't linked). — [Customer Experience Dive, 2026](https://www.customerexperiencedive.com/news/forgotten-trials-paid-subscriptions-loyalty-suffers/830942/) [SECONDARY]
- Totango's 2013-2016 opt-in vs opt-out numbers (the original "~10% of visitors start a no-card trial, ~2% start a card trial; ~15-18% vs ~50-60% convert") are still the root of many repeated stats. I could not find a primary Totango page this session. Treat any uncited "opt-out converts 50-60%" figure as possibly descended from that **2013-2016 B2B** data. — (gap noted; see Gaps)

### Inferences
- The trial-to-paid gap is real and large in every source. The **visitor-to-paid** effect, which is what matters, is ambiguous: somewhere between "card-required wins about 3x" (ChartMogul) and "roughly a wash, no-card slightly ahead" (First Page Sage arithmetic). It is also B2B-dominated, at 4-20x BullPen's price point.
- For a consumer at $12/mo, the friction of entering a card is likely a larger share of total "cost" than for a $200/mo B2B buyer. That argues the trial-start penalty from requiring a card is likely bigger for BullPen than in the B2B data (speculative, no B2C split found).
- Card-required trials convert "intent", not "value". Part of the 48.8% / 30% is people who forgot to cancel (see §6), which shows up later as refunds, chargebacks and early churn, not in trial-to-paid.

### Gaps
- No B2C/consumer dataset splitting card-required vs no-card trials, and none for finance apps.
- Could not access First Page Sage's primary page or Totango's original reports, so the visitor-to-trial figures rest on aggregator re-citations.
- ProfitWell/Paddle published trial-length and card data around 2018-2020 (pre-2023). I did not retrieve it this session.

---

## 2. Consumer subscription app data (RevenueCat, Adapty)

### Takeaway
In consumer apps, which are almost all card or store-account on file (app store trials are effectively opt-out), the median trial-to-paid is about 25-46% depending on length and plan. Download-to-trial is only about 6%, and 82-89% of trials start on install day. Hard paywalls beat freemium on download-to-paid about 5.5x (12.1% vs 2.2%), at a refund-rate cost. None of this is web/Stripe data or finance-category data.

### Cited Findings
- **RevenueCat State of Subscription Apps 2025** (75,000+ apps, $10B+ tracked revenue, iOS+Android): download-to-trial median **6.2%** (P90 20.3%); high-priced apps 9.8% vs low-priced 4.3%. **82%** of trial starts happen on install day. Download-to-paid by Day 35: **hard paywall 12.11% vs freemium 2.18%** median. Refund rate **hard paywall 5.8% vs freemium 3.4%**. Trial-to-paid best at 17-32-day trials (median **45.7%**). Category trial-to-paid: Travel 48.7%, Media & Entertainment 43.8%, Health & Fitness 39.9%. Annual-plan year-1 retention 44.1% (down from 47.1%), monthly 17.0%. Trial cancellations: for 3-7-day trials they cluster on Days 0-1, and there is a spike near trial end. — [RevenueCat SOSA 2025](https://www.revenuecat.com/state-of-subscription-apps-2025/) [PRIMARY]
- Revenue per install (RevenueCat 2025, via secondary): hard paywall **$2.32 at Day 14 vs freemium $0.27**; Day 60 **$3.09 vs $0.38**. — [search summary of SaaStr/RevenueCat coverage](https://www.saastr.com/the-top-10-learnings-from-revenuecats-state-of-subscription-apps/) [SECONDARY]
- **RevenueCat free-trial-length analysis** (newest data, Aug 2025-Jul 2026; App Store + Google Play only; no finance breakdown; no web comparison), trial-to-paid by trial length:
  - Monthly plans: ≤4 days **39.6%**, 5-9 days **45.9%**, 10-16 days **46.6%**, 17-32 days **43.7%**
  - Monthly first renewal among payers: ≤4d 62.8%, 5-9d **72.0%**, 10-16d 72.0%, 17-32d **77.5%**
  - Annual plans: trial-to-paid rises from **24% (≤4d) to 44.6% (17-32d)**; first renewal 18.3% to 47.5%
  - No-trial purchases renew worse on weekly/monthly: weekly no-trial first renewal 35.9% vs 57.9% with a ≤4-day trial
  - AI apps (monthly): 38.2-38.5% at 5-16 days, falling to **31.8% at 17-32 days** (diminishing returns past ~16 days where usage has real marginal cost)
  — [RevenueCat blog: free trial length](https://www.revenuecat.com/blog/growth/free-trial-length) [PRIMARY]
- Trial-length summary from the 2025/2026 report: 17+ day trials **42.5%** median vs **25.5%** for ≤4 days; yet short trials rose from 42% to **46.5%** of all trials year over year. — [SaaStr summary](https://saastr.com/what-17000-subscription-apps-tell-us-about-free-trial-length-annual-plans-convert-86-better-with-30-day-trials-monthly-tops-out-at-two-weeks-and-ai-apps-hit-a-wall-at-16-days) [SECONDARY]
- **Adapty State of In-App Subscriptions 2025** (11,000+ apps, $1.9B revenue): "Users who start with a trial have an LTV that's up to **64% higher**"; trials "don't improve early conversion, but they do increase long-term value and retention". Install-to-trial "stays below **12%** in most cases". Refunds: annual 4.2%, weekly 2.6%; US/LATAM above 3%, Europe about 2.3%. Its "Install to Paid without a trial reaches 18-38%" line has an unclear denominator (probably paywall-view-based); **do not cite it as install-to-paid**. — [Adapty 2025 in 10 minutes](https://adapty.io/blog/state-of-in-app-subscriptions-2025-in-10-minutes/) [PRIMARY summary]

### Inferences
- BullPen's "free plan + trial offered at end of onboarding" maps to RevenueCat's **freemium-with-trial** pattern, not a hard paywall. The 82% day-0 finding supports putting the trial offer at onboarding end (BullPen already does).
- App-store trials are opt-out with near-zero card friction (stored Apple/Google payment), so app-store trial-to-paid rates (40-46%) are the best consumer analog for a **card-required** trial. They overstate what a Stripe web checkout gets, because re-typing a card on the web is a real extra step (speculative, no data found comparing them).
- The hard-paywall refund premium (5.8% vs 3.4%) is consistent with "intent captured before value" producing more regret purchases.

### Gaps
- No finance/investing category figure for trial-to-paid or download-to-paid in the retrieved RevenueCat pages (the full PDF may have one).
- No Superwall data retrieved.
- No public web-paywall (Stripe) vs app-store trial comparison.

---

## 3. Trial length: 3 vs 7 vs 14 vs 30 days

### Takeaway
Consumer app data (RevenueCat, 2025-2026) says ≤4-day trials clearly underperform. 5-9 days is near the plateau for monthly plans (45.9% vs 46.6% at 10-16 days), but longer trials keep improving **annual-plan** conversion (24% to 44.6%) and renewal. B2B data is mixed and older. 7 days is defensible for monthly. A 14-day trial would likely lift annual-plan conversion.

### Cited Findings
- RevenueCat monthly: 39.6 / 45.9 / 46.6 / 43.7% for ≤4 / 5-9 / 10-16 / 17-32 days. Annual: 24% to 44.6% across the same buckets. First renewal (monthly) 62.8% to 77.5%. — [RevenueCat](https://www.revenuecat.com/blog/growth/free-trial-length) [PRIMARY]
- RevenueCat headline: annual plans convert **86% better** with 30-day trials; monthly "tops out at two weeks"; AI apps "hit a wall at 16 days". — [SaaStr headline/summary](https://saastr.com/what-17000-subscription-apps-tell-us-about-free-trial-length-annual-plans-convert-86-better-with-30-day-trials-monthly-tops-out-at-two-weeks-and-ai-apps-hit-a-wall-at-16-days) [SECONDARY]
- B2B adoption (ChartMogul/Poyar Jan 2026): **62%** of trial products use 14 days, 14% use 7, 14% use 30. — [Growth Unhinged](https://www.growthunhinged.com/p/free-to-paid-conversion-report) [PRIMARY]
- Recurly-attributed: 7-day trials **40.4%** vs 61+-day trials **30.6%** (via Amra & Elma, Dec 2025; [AGGREGATOR]). 1Capture claim "7-14 day outperforms 30-day by 71%" ([AGGREGATOR], vendor blog, methodology unknown). — [Shno.co](https://www.shno.co/marketing-statistics/free-trial-conversion-statistics)
- Recurly: average B2C trial 16.5 days. Most businesses give at least two weeks and rarely more than a month. — [Recurly](https://recurly.com/research/subscriber-acquisition-benchmarks) [SECONDARY]
- RevenueCat: 3-7-day trial cancellations cluster on Days 0-1 (users start, then immediately cancel to avoid being charged), with a spike before trial end. — [RevenueCat SOSA 2025](https://www.revenuecat.com/state-of-subscription-apps-2025/)

### Inferences
- For BullPen, the trial length should match a natural **"aha" cycle**. For an investing app the relevant events (an earnings report on a held stock, a weekly pick, a few daily briefs, a price alert firing) take more than a few days to occur. 7 days covers one Weekly Pick and five daily briefs. 14 days covers two Weekly Picks and about 10 trading days. This is speculative reasoning, not data.
- Since BullPen pushes annual ($108/yr), the RevenueCat annual-plan curve (conversion rising steadily with length) is the most relevant consumer evidence for testing 14 days.
- The AI-app plateau at about 16 days is relevant: BullPen Pro unlocks costly AI (chat, Deep Dives), so trials longer than about 14-16 days add marginal model cost with no conversion gain.

### Gaps
- No length data for no-card trials in B2C. No finance-specific length data.

---

## 4. Reverse trials (everyone gets Pro for N days, then drops to free)

### Takeaway
A reverse trial (no card, auto-downgrade to free) is a named, growing pattern: 7% of B2B products in 2026. The supporting evidence is mostly practitioner claims (about +10-40% on freemium conversion, or 5% to about 15%), not published controlled data. The closest direct competitor, **Simply Wall St, runs exactly this**: 7 days of Premium, no card, then the free plan.

### Cited Findings
- Definition (Elena Verna): reverse trial "starts every new signup on a trial—usually without needing an opt-in or a credit card—and gives customers access to all or a select set of paid features. After the trial ends without a payment being made, users are smoothly transitioned to a freemium plan." Examples: Canva, Asana (30-day), Airtable (14-day), Notion (card required), Dropbox A/B testing. She notes pure freemium tops out around **5%** even for the best performers. — [Elena Verna, Reverse trials examples](https://www.elenaverna.com/p/reverse-trials-examples) [PRIMARY, qualitative]
- Amplitude (Verna era): freemium about **5%** free-to-paid with **25%** of freemium users staying engaged. Reverse trial "aims" for about **15%** conversion while keeping freemium engagement. This is a goal/model, **not measured results**. — [Amplitude blog: reverse trial](https://amplitude.com:443/blog/reverse-trial) [PRIMARY but aspirational]
- "Reverse trials lift freemium-to-premium conversion by **10 to 40 percent**" (attributed to Verna by secondary sites; I couldn't locate the original sample). One aggregator claims "+38.0% vs standard freemium" from Amplitude, which I could not verify. — [Inflection.io guide](https://www.inflection.io/post/complete-guide-to-reverse-trials) [SECONDARY]; [CommandBar/Command.ai](https://command.ai/blog/maximize-your-conversion-with-reverse-trials) [AGGREGATOR]
- Range claims: reverse trial **7-21%** vs freemium **3-15%** vs free trials 8-25% (attributed to OpenView research; original not located). ChartMogul 2026 bands as re-cited: reverse trial good **4-6%**, great **8-12%**. — [Inflection.io](https://www.inflection.io/post/complete-guide-to-reverse-trials) [SECONDARY/unverified]
- Toggl moved from freemium to a 30-day full-access reverse trial (the motive was multi-account freemium abuse), and this reportedly "doubled" premium-plan revenue. This is a single-company anecdote and is relayed without a date. — [Inflection.io](https://www.inflection.io/post/complete-guide-to-reverse-trials) [SECONDARY]
- Airtable 14-day reverse trial on Pro/Plus features. OpenView-Chargebee 2022 report: freemium drives more signups, trials convert better, and reverse trials combine the two (no numbers in the article). — [TechCrunch 2022](https://techcrunch.com/2022/11/12/freemium-or-free-trials-why-not-both/) [SECONDARY, 2022]
- Recommended reverse-trial length: 14-21 days so a premium feature becomes habitual. — [Inflection.io](https://www.inflection.io/post/complete-guide-to-reverse-trials) (opinion)
- **Simply Wall St (direct competitor, consumer investing research):** "When you register, your account starts with **7 days of full Premium access. No credit card required.**" After 7 days the account converts to the free plan (1 portfolio up to 10 holdings, 3 watchlists, 5 company reports/month). — [Simply Wall St plans page](https://simplywall.st/plans) [PRIMARY, checked 2026-10-08]

### Inferences
- Reverse trials work best when (a) the free tier is good enough to retain users after the downgrade, and (b) the loss is **felt**: the user has built something with Pro that visibly degrades (loss aversion). BullPen's generous free plan satisfies (a). For (b), BullPen's Pro value is mostly consumable: AI messages, Deep Dives, alerts beyond 5 stocks, daily brief. The "loss" is felt only if users hit those during the trial, so the reverse trial must actively drive users into the Pro features (a Deep Dive on a held stock, more than 5 alerts, the daily brief).
- Cost exposure: a reverse trial gives every signup Pro AI usage (Deep Dives, unlimited-ish chat), and BullPen's AI calls cost real money. Cap per-trial AI usage or measure cost per reverse-trial user before rollout (speculative).
- Simply Wall St choosing no-card 7-day reverse trial in this exact category is the strongest available "what peers do" signal, but not evidence it converts better.

### Gaps
- No published controlled B2C reverse-trial vs card-trial experiment. No consumer reverse-trial conversion benchmark with sample and date. Canva/Calendly specifics not verified this session.

---

## 5. Freemium-to-paid benchmarks and finance/investing competitor trial models

### Takeaway
Freemium free-to-paid is about 2-5% (B2B 2.6-2.8% per First Page Sage; mobile freemium download-to-paid 2.2% per RevenueCat). In consumer investing research, card-required 7-day trials are the norm among the big paid players (Seeking Alpha, Morningstar). The product closest to BullPen (Simply Wall St) uses a no-card reverse trial. Stock Rover uses a no-card 14-day trial. Koyfin uses freemium plus a 30-day refund guarantee with no trial.

### Cited Findings
- Freemium free-to-paid **2.6-2.8%**, signup rate 13.3% (First Page Sage 2022-2025, via aggregator). Self-serve freemium **3-5%**, exceptional 6-8% (Kyle Poyar 1,000+ product analysis, via Crazy Egg Sept 2025). — [Shno.co](https://www.shno.co/marketing-statistics/free-trial-conversion-statistics); [Crazy Egg](https://www.crazyegg.com/blog/free-to-paid-conversion-rate/)
- Mobile freemium download-to-paid (Day 35) **2.18%** vs hard paywall 12.11% (RevenueCat 2025). — [RevenueCat](https://www.revenuecat.com/state-of-subscription-apps-2025/)
- Freemium product distribution (ChartMogul 2026, B2B): 25% convert below 2.5%, 29% at 2.5-7.5%, 25% at 10-15%. — [Growth Unhinged](https://www.growthunhinged.com/p/free-to-paid-conversion-report)
- Sixteen Ventures: freemium "low single digits", successes "high single digits", "super-low double digits" for 6+ month active cohorts (undated, anecdotal). — [Sixteen Ventures](https://sixteenventures.com/saas-free-trial-benchmarks/)

**Competitor trial models (verify before quoting externally; several are aggregator-sourced):**

| Product | Free tier | Trial | Card required? | Source / confidence |
|---|---|---|---|---|
| Simply Wall St | Yes (1 portfolio ≤10 holdings, 3 watchlists, 5 reports/mo) | 7-day Premium, auto-downgrades to free (**reverse trial**) | **No** | [simplywall.st/plans](https://simplywall.st/plans) PRIMARY, 2026-10-08 |
| Seeking Alpha Premium | Limited free | 7-day | **Yes**, auto-charges $299/yr (promos to $269) | [SA acquisition LP](https://subscriptions.seekingalpha.com/lp_premium_acq_7ft); [College Investor](https://thecollegeinvestor.com/38909/seeking-alpha-premium-review/) SECONDARY |
| Morningstar Investor | Limited free | 7-day | **Yes**, card entered before trial | [Brokerage-Review](https://www.brokerage-review.com/promotion-offers/deal/morningstar-for-free.aspx); [Krazy Coupon Lady 2024](https://thekrazycouponlady.com/2024/05/17/try-morningstar-investor-for-free-for-7-days-save-usd50-on-first-year) AGGREGATOR |
| Stock Rover | Free plan | 14-day | **No**, "no obligation" | [Stock Rover trial page](https://www.stockrover.com/?p=1808) PRIMARY (via search snippet) |
| Koyfin | Yes ($0, 2-yr financials) | **None**; paid plans $39/$79/mo with "100% satisfaction guarantee... full refund within 30 days" | n/a | [koyfin.com/pricing](https://www.koyfin.com/pricing/) PRIMARY |
| Robinhood Gold | n/a (brokerage add-on) | 30-day free, then $5/mo or $50/yr unless cancelled | Effectively yes (brokerage account linked) | [Robinhood support](https://robinhood.com/us/en/support/articles/gold-overview) (via search summary) SECONDARY |
| TipRanks Premium | Limited free | Conflicting: "7-day" vs "30-day trial with card + 30-day refund"; sources disagree | Probably yes | [StockBrokers.com review](https://www.stockbrokers.com/review/tools/tipranks) AGGREGATOR, **unverified** |
| Public Premium | n/a | 7-day trial, $8/mo per aggregator; Public's own /premium page no longer describes a Premium tier | Unknown | [Public.com/premium](https://www.public.com/premium) PRIMARY shows no Premium product: **possibly discontinued/renamed** |

### Inferences
- Pattern: older paid-research incumbents with high annual prices ($199-299/yr) use card-required 7-day trials. Freemium-first, visual, beginner-oriented players (Simply Wall St) use a no-card reverse trial. Stock Rover (power-user) uses a no-card 14-day trial. BullPen's positioning (beginner, generous free plan, $108/yr) is closer to Simply Wall St than to Seeking Alpha.
- A 30-day refund window like Koyfin's (and BullPen's) partly substitutes for a trial as a risk reducer.

### Gaps
- Could not load TipRanks', Morningstar's or Robinhood's own pricing pages directly. Their terms rest on secondary sources and can change; recheck before relying on them.
- No public conversion data from any of these competitors.

---

## 6. Refund/chargeback/trust effects and regulatory/card-network constraints

### Takeaway
Card-required trials carry real "forgot to cancel" backlash (about 80% of US consumers say it has happened to them). As of Oct 2026 the federal Click-to-Cancel rule is **vacated** (8th Cir., July 8 2025) and the FTC **restarted rulemaking with an ANPRM on March 11 2026**. ROSCA, California's amended ARL (in force since July 1 2025, explicitly covering free-to-pay conversions), Mastercard/Visa trial rules and the EU withdrawal-button rule (from June 19 2026) all apply now. BullPen's 3-day reminder sits inside Mastercard's 3-7-day window, but **Visa's rule is commonly described as 7 days before trial end**, so 3 days may fall short for Visa cards (verify).

### Cited Findings
**Consumer backlash / trust**
- Dimers survey (released Sept 16 2026, n=2,000 US): about **80%** have forgotten to cancel a free trial and been charged; average **$45/month** on forgotten trials; most expensive forgotten charge averages $87. Recurly's Chief Customer Officer: "customers today are very suspicious of subscription businesses that do try the element of surprise lock-in", and without a clear cancellation path "you are probably ruining your chances of having them be a customer ever again." — [Customer Experience Dive](https://www.customerexperiencedive.com/news/forgotten-trials-paid-subscriptions-loyalty-suffers/830942/) [SECONDARY, sponsor-run survey]
- C+R Research 2022: **86%** charged for a subscription they forgot to cancel after a trial. Bankrate (earlier, undated in snippet): **59%** of US adults who signed up for a free trial were later charged without meaning to continue. — via [search summary; Cord Cutters News](https://cordcuttersnews.com/cord-cutters-check-your-credit-card-americans-are-losing-45-a-month-to-forgotten-free-trials/?amp=1) [AGGREGATOR; survey figures vary widely by sponsor]
- Refunds: hard-paywall (intent-before-value) apps refund **5.8% vs 3.4%** for freemium (RevenueCat 2025). — [RevenueCat](https://www.revenuecat.com/state-of-subscription-apps-2025/)

**US federal**
- FTC amended Negative Option ("Click-to-Cancel") Rule finalized Oct 2024 and **vacated in its entirety by the 8th Circuit on July 8 2025** (6 days before taking effect), on procedural grounds: the FTC skipped a preliminary regulatory analysis by wrongly estimating impact under $100M. The original narrow Negative Option Rule and **ROSCA remain enforceable**, and the FTC says many of the vacated requirements are independently required by ROSCA. — [Covington](https://www.cov.com/en/news-and-insights/insights/2025/07/eighth-circuit-vacates-ftc-negative-option-rule); [Manatt](https://www.manatt.com/insights/newsletters/eighth-circuit-vacates-the-ftc-s-recently-amended-negative-option-rule)
- **March 11 2026: FTC issued an ANPRM** restarting negative-option rulemaking. It has no draft text and asks whether a rule is needed at all, about disclosures, "express informed consent" (checkboxes?), click-to-cancel and B2B coverage. Commentators expect core elements (clear disclosure, affirmative consent, simple cancellation, no misrepresentation) to survive. — [Greenberg Traurig, Mar 2026](https://www.gtlaw.com/en/insights/2026/3/ftc-seeks-comment-on-potential-updates-to-negative-option-rule); [Perkins Coie](https://perkinscoie.com/insights/blog/ftc-kicks-new-negative-options-rulemaking); [Subscription Insider](https://www.subscriptioninsider.com/article-type/news/ftc-restarts-negative-option-rulemaking-after-click-to-cancel-vacatur-signaling-subscription-rules-are-back-in-play)
- Note: several local-news pages (ABC affiliates) still say the rule "takes effect" and is "in effect". They are **outdated** and should not be relied on. — e.g. [ABC30](https://abc30.com/entertainment/click-to-cancel-rule-aims-to-make-it-easier-to-cancel-memberships/15437401/)

**California ARL (AB 2863)**
- Signed Sept 24 2024, applies to contracts entered, amended or extended **on or after July 1 2025**. It brings **"free-to-pay conversions"** explicitly in scope ("a product or service for free for an initial period and will incur an obligation to pay... if they do not take affirmative action to cancel"). It also expands consent requirements, adds annual reminders, requires clear notice of price changes, and adds "click to quit" online cancellation. — [Kilpatrick Townsend](https://ktslaw.com/insights/alert/2024/10/california-latest-automatic-renewal-law-amendments-take-effect-in-july-2025) [PRIMARY legal analysis]

**Card networks**
- **Mastercard** (effective Sept 22 2022 per Chargeback Gurus): disclose the full trial terms at signup (length, post-trial price and frequency); **send a reminder 3-7 days before trial end** that the card will be charged unless cancelled, including how to cancel; send a receipt after each billing with cancel instructions; provide an easy online cancellation method. — [Chargeback Gurus](https://www.chargebackgurus.com/blog/mastercard-subscription-rules); background [Finextra](https://www.finextra.com/newsarticle/33221/mastercard-cracks-down-on-free-trial-subscriptions), [CNBC 2019](https://www.cnbc.com/2019/01/17/mastercard-to-protect-users-against-getting-charged-after-free-trials.html)
- **Visa** (2020 rules, as summarized by processors): notify the cardholder **at least 7 days before the trial/promo expires** with a link or simple way to cancel, electronically (email/SMS); allow online cancellation without contacting the merchant another way. — [search summary of Visa/TrustPay/Segpay materials](https://www.trustpay.eu/?p=6933) [SECONDARY; Visa's own PDF did not render, so I could not confirm whether the 7-day rule applies only to trials over a certain length]

**EU**
- EU Directive 2023/2673 (in force **June 19 2026**): B2C online contracts with a statutory withdrawal right must offer an electronic **"withdraw from the contract here"** function, available throughout the 14-day withdrawal period, which applies to non-EU sellers targeting EU consumers. The principle is that withdrawing must be "no more burdensome than concluding" the contract. Builds on the 14-day withdrawal right in the Consumer Rights Directive 2011/83/EU. — [Arnold & Porter, May 2026](https://www.arnoldporter.com/en/perspectives/advisories/2026/05/eu-withdrawal-button-uk-subscription-rules-and-data-protection-risks-for-us-online-sellers); [William Fry](https://www.williamfry.com/knowledge/world-consumer-rights-day-part-3-mandatory-withdrawal-button-coming-june-2026/); [iubenda](https://www.iubenda.com/en/blog/the-new-online-withdrawal-function-what-eu-directive-2023-2673-means-for-your-business/)

### Inferences
- **BullPen-specific compliance check (not legal advice):** the current card-required trial is a "free-to-pay conversion" under California's ARL and a negative option under ROSCA. A 3-day reminder satisfies Mastercard (3-7 days) but appears **not** to satisfy Visa's reported 7-day notice on a 7-day trial, which is impossible to meet literally if the reminder must go out 7 days before the end of a 7-day trial. Either verify Visa's exact threshold (some summaries apply it only to trials longer than 7 days), or send the reminder at trial start/day 0 plus a second one at day 4. Flag for verification.
- A **no-card reverse trial removes nearly all of this exposure**: no negative-option conversion happens, so there is no ARL free-to-pay consent, no network trial reminder rules, no forgot-to-cancel refunds or chargebacks, and no EU withdrawal-button interaction at trial end. That is a material operational simplification for a solo-founder product (inference).
- Since Norway (BullPen's base) is EEA, EU consumer rules likely apply to EEA users too (inference; check whether Norway has implemented 2023/2673).

### Gaps
- Visa's exact current trial-reminder threshold (primary document unreadable).
- No dataset on chargeback rates for card-required vs no-card SaaS trials.
- New York auto-renewal amendments were mentioned by Covington but not researched.

---

## 7. Hybrid tactics

### Takeaway
The evidence base for hybrids is thin and mostly practitioner opinion. The best-supported levers are trial length (RevenueCat), offering at install/onboarding (82-89% day-0 starts) and A/B testing paywalls. "Reverse trial then limit-moment upgrade prompts" is the best fit for a generous-freemium consumer product but rests on argued reasoning, not published experiments.

### Cited Findings
- Paid trials are rare: **4%** of B2B products (ChartMogul 2026). No conversion data was retrieved for $1 paid trials. — [Growth Unhinged](https://www.growthunhinged.com/p/free-to-paid-conversion-report)
- Day-0 dominance: 82% (RevenueCat 2025) / 89.4% (secondary summary) of trial starts happen on install day; users who don't start then rarely do later. Implication: the onboarding-end offer is the single most important placement. — [RevenueCat](https://www.revenuecat.com/state-of-subscription-apps-2025/); [SaaStr](https://www.saastr.com/of-trials-start-on-day-0-dont-waste-your-shot)
- Frequent paywall A/B testers earn "up to 100x" more (Adapty; correlational, survivorship-prone). — [Adapty](https://adapty.io/blog/state-of-in-app-subscriptions-2025-in-10-minutes/)
- Behaviour-triggered prompts claimed to outperform calendar-based ones by 67% (1Capture vendor blog, methodology unknown, [AGGREGATOR]). — [Shno.co](https://www.shno.co/marketing-statistics/free-trial-conversion-statistics)
- Trials raise LTV by up to 64% (Adapty) and first renewal (RevenueCat no-trial 35.9% vs trial 57.9% on weekly), which suggests trials work by qualifying buyers who stick. — [Adapty](https://adapty.io/blog/state-of-in-app-subscriptions-2025-in-10-minutes/); [RevenueCat](https://www.revenuecat.com/blog/growth/free-trial-length)

### Inferences (speculative, for test design)
- Candidate models for BullPen, ranked by fit with the evidence:
  1. **No-card reverse trial, 7-14 days, at signup** (Simply Wall St model). Then limit-moment prompts (16th chat message, 2nd Deep Dive, 6th alert) with a card-required checkout (optionally with an annual discount) at the moment of need. Maximises trial reach, has zero forgot-to-cancel exposure, and the free plan catches non-converters. Risk: AI cost per trial user, and lower trial-to-paid (expect roughly 5-15% vs 30-50%).
  2. **Keep card-required, lengthen to 14 days**, which RevenueCat says lifts annual-plan conversion. Fix the reminder timing for Visa.
  3. **Split by intent:** default every signup into a no-card reverse trial, and let high-intent paywall visitors (from /upgrade) take a card-required trial with a sweetener (e.g. longer trial or first-year annual discount).
- The decisive metric is **visitor (or signup) to paid at day 60, net of refunds**, not trial-to-paid. Published data cannot settle this for B2C, so an A/B test is required: randomise new signups between the card-required 7-day trial and the no-card 7-day reverse trial.

### Gaps
- No published data on $1 paid trials, trial-end discounts or "extend trial" offers in consumer subscriptions.
- No B2C A/B results comparing card-required trial vs reverse trial head to head.
