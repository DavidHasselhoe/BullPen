# AI Search Visibility (GEO/AEO) and Non-Search Organic Channels for an Early-Stage Consumer Investing App (2024-2026)

Research date: 2026-10-08. Scope: US/English. "Vendor claim" = published by a company selling GEO/SEO tooling or services; treat as directional. About 17 searches/fetches. Reddit could not be fetched directly, so subreddit rules are second-hand.

## 1. How much traffic do AI assistants / AI search send, and how does it convert vs Google organic?

### Takeaway
AI referrals are growing fast but are still about 1% of site traffic. Google sends on the order of 100-345x more referrals. Every published dataset says AI-referred visitors convert better than Google organic (roughly 2x to 23x depending on site and method), but the samples are small and mostly B2B/SaaS. Google's own AI Overviews meanwhile cut clicks on the organic results they sit above.

### Cited Findings
**Volume**
- In June 2025, AI platforms sent over 1.13B referrals to the top 1,000 websites globally, up 357% YoY. Google Search sent about 191B referrals in the same month. ChatGPT accounted for over 80% of AI referrals — [TechCrunch on Similarweb data](https://techcrunch.com/2025/07/25/ai-referrals-to-top-websites-were-up-357-year-over-year-in-june-reaching-1-13b/)
- ChatGPT's global share of referral traffic was about 0.19% vs Google's about 42% (same period) — [TechCrunch / Similarweb](https://techcrunch.com/2025/07/25/ai-referrals-to-top-websites-were-up-357-year-over-year-in-june-reaching-1-13b/)
- AI referrals to news/media sites were up 770% since June 2024, but not enough to offset search declines — [TechCrunch, Jul 2025](https://techcrunch.com/2025/07/02/chatgpt-referrals-to-news-sites-are-growing-but-not-enough-to-offset-search-declines/)
- Aggregator summary (secondary, unverified): AI referrals are about 1.08% of total traffic across industries, and Google sends about 345x more traffic than ChatGPT, Gemini and Perplexity combined — [airops](https://www.airops.com/blog/ai-referral-traffic-conversion-rates), [passionfruit](https://www.getpassionfruit.com/blog/are-ai-search-referrals-the-new-clicks)
- ChatGPT's share of AI referrals reportedly fell from 89% to 63% by 2026 as Gemini, Perplexity and others grew. This is a vendor claim — [Goodie AI](https://higoodie.com/blog/ai-search-traffic-report-2026/)

**Conversion**
- Ahrefs (first-party data, Jun 2025): AI search was 0.5% of Ahrefs.com visitors over 30 days but produced 12.1% of signups, about 23x the conversion rate of traditional organic. Most of it came from ChatGPT. This is one B2B SEO-tool company with a highly AI-literate audience — [Ahrefs](https://ahrefs.com/blog/ai-search-traffic-conversions-ahrefs/)
- Semrush (Jun 2025): the "average AI search visitor is worth 4.4x a traditional organic visitor" on conversion. This is partly a **model/projection**, not a measured cross-site average. Semrush also forecasts AI search visitors will surpass organic within 3-4 years (speculative) — [Semrush](https://www.semrush.com/blog/ai-search-seo-traffic-study/), [MarTech](https://martech.org/average-llm-visitor-worth-4-4x-organic-search-visitors/)
- Similarweb 2026 cross-site figure (secondhand): AI referral conversion 11.4% vs organic 5.3% (about 2.15x). Per-platform rates (ChatGPT 15.9%, Perplexity 10.5%, Claude 5.0%) and "Opollo 14.2% vs 2.8%" come from aggregators I could not trace to primary data — [airops summary](https://www.airops.com/blog/ai-referral-traffic-conversion-rates)
- AI-referred visitors view about 50% more pages per session (aggregator, unverified) — [airops](https://www.airops.com/blog/ai-referral-traffic-conversion-rates)
- Google's own claim: clicks from results pages with AI Overviews are "higher quality (meaning, users are more likely to spend more time on the site)." No numbers given — [Google Search Central](https://developers.google.com/search/docs/appearance/ai-features)

**What AI Overviews do to Google organic clicks**
- Pew (Mar 2025 browsing data, 900 US adults, 68,879 searches; about 18% showed an AI Overview): users clicked a traditional result 8% of the time with an AI Overview vs 15% without one. Only 1% of visits clicked a link inside the AI Overview. 26% of AI-Overview sessions ended with no click at all, vs 16% without one — [9to5Google on Pew](https://9to5google.com/2025/07/23/google-ai-overview-link-click-study/), [The Decoder](https://the-decoder.com/pew-finds-that-only-1-percent-of-users-click-a-source-link-directly-from-googles-ai-overviews/)
- Ahrefs (300k keywords, GSC data, Mar 2024 vs Mar 2025): AI Overviews cut position-1 CTR by 34.5% on average. For AIO keywords, position-1 CTR fell from 0.073 to 0.026 — [Ahrefs](https://ahrefs.com/blog/ai-overviews-reduce-clicks/), [PPC Land](https://ppc.land/googles-ai-overviews-cut-organic-clicks-by-34-5-despite-company-claims/)
- SparkToro/Datos (Sep 2022 to May 2024, **pre-AIO-at-scale, possibly outdated**): 58.5% of US Google searches end with zero clicks. About 37% click to the open web, and nearly 30% of clicks go to Google-owned properties — [Search Engine Land](https://searchengineland.com/google-search-zero-click-study-2024-443869)

### Inferences
- For a young domain, AI referrals will be a small absolute number for a long time. The case for working on AI visibility is the conversion quality and the "recommended by ChatGPT" brand effect, not volume. Google organic, even shrinking, remains the bigger pool.
- Informational "what is P/E ratio" style content (Academy-type pages) is exactly the query class hit hardest by AI Overviews. Clicks per ranking will be lower than older SEO benchmarks suggest.
- The 23x Ahrefs number should not be used as a planning assumption for a consumer finance app. A defensible range is "2-5x organic conversion, on tiny volume."

### Gaps
- No public AI-referral or conversion dataset specific to consumer fintech or investing apps was found. Similarweb's industry breakdown page returned 404.
- No measurement of how often AI-referred *app signups* (vs page conversions) stick or pay.
- I could not confirm Adobe's AI referral figures (retail/travel) in this pass.

## 2. What is known (with evidence) about getting cited by LLMs and AI Overviews?

### Takeaway
The best-supported levers are: (1) be crawlable by the search bots (OAI-SearchBot, Googlebot, PerplexityBot), (2) rank in normal search, because AI Overviews and ChatGPT search ride on search indices, and (3) earn **off-site brand mentions** on Reddit, YouTube, review/"best X" roundups and Wikipedia-type sources. Brand mentions correlate with AIO visibility about 3x more strongly than backlinks. Google says no special schema or AI text file is needed. llms.txt is effectively unused by AI crawlers.

### Cited Findings
**Official platform statements**
- Google: "There are no additional requirements to appear in AI Overviews or AI Mode, nor other special optimizations necessary." "You don't need to create new machine readable files, AI text files, or markup... no special schema.org structured data that you need to add." AI Overviews and AI Mode use "query fan-out" (multiple related sub-searches), which surfaces "a wider and more diverse set of helpful links" — [Google Search Central: AI features and your website](https://developers.google.com/search/docs/appearance/ai-features)
- OpenAI: OAI-SearchBot governs ChatGPT search inclusion. "Sites that are opted out of OAI-SearchBot will not be shown in ChatGPT search answers." GPTBot is training-only, so blocking it does not affect ChatGPT search. ChatGPT-User fetches pages on a user's request and "is not used to determine whether content may appear in Search." robots.txt changes take about 24h — [OpenAI crawler docs](https://developers.openai.com/api/docs/bots)

**llms.txt**
- Google's John Mueller: "no AI system currently uses llms.txt." Gary Illyes said Google does not support it and does not plan to — [summarised in longato.ch audit](https://www.longato.ch/llms-recommendation-2025-august/), [ariashaw.com](https://ariashaw.com/does-llms-txt-actually-work)
- Server-log studies: across 12 days and 9,645 logged requests, external AI crawlers requested /llms.txt zero times — [AWRSHIFT](https://wp.awrshift.com/llms-txt-in-practice/). Another dataset found llms.txt was about 0.001% of 400M requests. Most hits came from SEO audit tools and Googlebot's general crawling, not LLM bots — [SEO Depths](https://seodepths.com/seo-research/what-server-logs-tell-about-llms-txt/). "We put llms.txt on 83 websites. OpenAI read it 7 times" — [ezy.ai](https://www.ezy.ai/research/do-ai-bots-read-llms-txt)
- One counter-anecdote (single site, vendor blog, unverified): llms.txt content "powering AI answers" after GSC submission — [dev5310](https://www.dev5310.com/en/lab/llms-txt-is-powering-ai-answers). Treat as an outlier.

**Which sources get cited**
- Peec AI (30M sources across ChatGPT, AI Mode, Gemini, Perplexity and AIO): Reddit is the most-cited domain, followed by YouTube and LinkedIn — [Search Engine Land](https://searchengineland.com/ai-search-engines-cite-reddit-youtube-and-linkedin-most-study-473138)
- For AI Overviews, the top cited domains are YouTube, Reddit, Forbes, LinkedIn and Wikipedia — [Contently 2026](https://contently.com/2026/04/29/top-sources-llms-cite/)
- Similarweb: Wikipedia leads with a 3.4% citation share across 58.6M citations. The top domain on any platform rarely exceeds about 5% of citations, so the long tail dominates — [Similarweb AI search blog](https://aisearch.similarweb.com/blog/most-cited-domains-llms/)
- Conflicting figure: Wikipedia and Reddit "each roughly 12-13% of ChatGPT citations" in the US (aggregator; likely a different denominator, e.g. share among top domains) — [dageno](https://www.dageno.ai/blog/most-cited-domains-in-llms). This conflicts with Similarweb's "rarely exceeds 5%." Methodologies differ, so prefer Similarweb's larger sample.
- Reddit was 24% of Perplexity citations in Jan 2026 and 44% of AIO "social" citations (vendor claims) — [quickseo](https://quickseo.ai/blog/how-reddit-affects-ai-visibility-2026)
- Industry breakdowns of cited domains exist (finance included) from vendor Goodie — [Goodie](https://higoodie.com/blog/most-cited-domains-in-llms-industry-breakdown/) (not fetched; finance-specific top domains unverified)

**Brand mentions vs links**
- Ahrefs (75k brands, mid-2025): correlation with AI Overview brand visibility was 0.664 for branded web mentions, 0.527 for branded anchors, 0.392 for branded search volume, and only 0.218 for backlinks. About 26% of brands had zero AIO mentions. These are correlations, not causation — [Ahrefs](https://ahrefs.com/blog/ai-overview-brand-correlation/)

### Inferences
- BullPen's llms.txt is harmless but should be considered zero-impact. Checking that robots.txt allows OAI-SearchBot, PerplexityBot, Googlebot (and ideally Claude-SearchBot and similar) matters far more.
- Schema helps normal rich results and indexing, but Google explicitly says it is not an AIO requirement. Prioritise it as normal SEO hygiene, not as "GEO."
- The highest-leverage GEO action for a tiny brand is getting **mentioned by name** where models look: Reddit threads ("best app for beginner stock research"), YouTube reviews, and "best stock research apps / best AI stock apps" listicles on sites that already rank (e.g. NerdWallet/Forbes-type roundups, niche finance blogs).
- Freshness: no hard citable study was found in this pass (see gaps). Query fan-out favours pages that answer specific sub-questions (e.g. per-ticker pages with fresh data), which BullPen's stock pages already are.

### Gaps
- No rigorous public study isolating content freshness or structured data as a *causal* AI citation factor. Most claims are vendor correlation studies.
- No data on Claude's citation sources specifically, or on whether Perplexity honours llms.txt.
- No finance-specific citation breakdown verified (e.g. how often NerdWallet, Investopedia or Reddit appear for "best stock research app").

## 3. Which non-search organic channels work for investing/fintech apps?

### Takeaway
The historical winners for consumer investing apps are referral/word-of-mouth (Robinhood), content plus community (Public.com) and creators/YouTube (most brokerages run creator programs). Reddit is high-leverage for both humans and AI citations, but finance subs are strict on self-promotion. Product Hunt gives a one-day spike of a few hundred signups at best. I found little hard data on newsletters, podcasts or Discord as acquisition channels for investing apps.

### Cited Findings
**Reddit**
- Sitewide norm: about 90/10 (no more than about 10% of activity self-promotional). Individual subs are stricter. Finance subs' sidebar rules are paraphrased across guides as "No direct advertising, marketing, or self-promotion of any kind." Second-hand, since Reddit could not be fetched; verify on each sub's sidebar before posting — [redship](https://redship.io/blog/reddit-self-promotion-rules), [rankcow](https://www.rankcow.com/blog/reddit-self-promotion-rules)
- There is a curated list of fintech-relevant subreddits with FINRA context — [GitHub awesome-fintech-subreddits](https://github.com/soarsh/awesome-fintech-subreddits)
- Reddit is the #1 or #2 cited source in AI answers (see section 2), so genuine Reddit presence does double duty — [Search Engine Land](https://searchengineland.com/ai-search-engines-cite-reddit-youtube-and-linkedin-most-study-473138)

**Content + community (Public.com)**
- Public.com (launched Sep 2019) built its growth on content and community. It reportedly reached 1M users in about 18 months, grew its community 13x in 2020, and had a DAU/MAU of 50%. This is a copywriting-agency case study, not a company filing — [Mint Copywriting Studios](https://www.mintcopywritingstudios.com/blog/public-community-content-case-study)

**YouTube / creators**
- Brokerages and investing apps (Public, Webull, Moomoo) run active YouTube creator programs. Finance/investing channel sponsorships command $50-200 CPM (agency figure) — [Creators Agency](https://creatorsagency.co/blog/best-fintech-sponsors-for-youtube-creators)
- 2026 research: US consumers increasingly arrive at financial products after learning and validating on YouTube, social video and finance creators — [Advanced Television](https://www.advanced-television.com/2026/07/23/research-youtube-mobile-apps-driving-us-consumer-finance/)
- YouTube is a top-2 cited domain in AI Overviews and LLM answers — [Contently](https://contently.com/2026/04/29/top-sources-llms-cite/)

**Product Hunt / launch sites**
- 2026 benchmarks (single-source guide): a top-3 product of the day gets about 5,000-15,000 visitors and 100-400 signups. Top 10 gets about 1,000-3,000 visitors and 30-100 signups — [Causo](https://hub.causo.ai/guides/product-hunt-traffic-data-2026)
- No fintech/investing-specific Product Hunt outcome found. One low-ranked finance launch (#56, 5 upvotes) illustrates the downside — [hunted.space](https://www.hunted.space/product/pitch-investors-live/launches/pitch-investors-live)

### Inferences
- For BullPen, Instagram auto-carousels are a reasonable low-effort asset, but no evidence was found that market-mover carousels drive signups. Measure via UTM/link-in-bio before investing more.
- Reddit plus YouTube are the two channels that pay twice (direct users and AI citations). That makes them the best fit for a one-person team that also wants GEO.
- Product Hunt is worth one coordinated launch (cheap, gives a durable backlink and listing that AI models may cite), not an ongoing channel.

### Gaps
- No quantitative data found for newsletters (Substack/beehiiv), podcasts, TikTok or X as acquisition channels for investing apps specifically.
- No primary data on Seeking Alpha, Simply Wall St or Stocktwits acquisition mix (searched; not found).
- No data on Discord as an acquisition (vs retention) channel.
- Exact current rules of r/investing, r/stocks and r/personalfinance not verified directly (Reddit blocked from fetch).

## 4. Product-led / viral loops for investing apps

### Takeaway
Referral is the proven loop in consumer investing. Robinhood's S-1 attributes over 80% of new funded accounts (2020 to Q1 2021) to organic plus referral combined. That is not 80% from referral alone, a common misquote. Free tools and calculators are a well-trodden "engineering as marketing" play, but public evidence for them is mostly indie anecdotes without conversion data.

### Cited Findings
- Robinhood S-1 (2021): "Organic growth and the Robinhood Referral Program were responsible for over 80% of the new Funded Accounts that joined the platform in 2020 and in the three months ended March 31, 2021." "Organic" = cannot be attributed to paid marketing or referral — [Robinhood S-1, SEC](https://www.sec.gov/Archives/edgar/data/1783879/000162828021013318/robinhoods-1.htm)
- The referral reward was a free share each for referrer and referee, with a potential value of $2.50 to $225 — [PYMNTS on S-1](https://www.pymnts.com/ipo/2021/robinhood-filing-shows-continued-surge-in-retail-investing)
- Some secondary sources misstate this as "80% from referral program." The S-1 wording combines organic and referral — [prefinery](https://www.prefinery.com/blog/referral-programs/robinhood/) vs [S-1](https://www.sec.gov/Archives/edgar/data/1783879/000162828021013318/robinhoods-1.htm)
- Robinhood's pre-launch (2013-14) waitlist with a referral "move up the line" mechanic reached about 1M signups (**old data, pre-2024**) — [Viral Loops](https://viral-loops.com/blog/how-robinhood-got-1-million-users/)
- Free-tool / calculator examples are indie-founder self-reports with page counts but no signup or revenue outcomes. Examples: FinanceCount (18 calculators, 100+ pSEO pages), CalcFi (300+ calculators, 22k pages in 10 days) — [Indie Hackers](https://www.indiehackers.com/post/i-built-18-free-finance-calculators-in-my-spare-time-heres-what-i-learned-vf3RTbDyYz7SL5XstQTE), [Indie Hackers CalcFi](https://www.indiehackers.com/product/calcfi)

### Inferences
- Robinhood's referral worked because the reward was cash-like and symmetric (both sides get a stock). A subscription SaaS can mirror this with symmetric free Pro time. BullPen already has a referral program, so the lever is reward size and placement (e.g. prompting after a "win" moment), not building a new one.
- Shareable artefacts are the natural viral objects for BullPen, because each share carries the brand and creates crawlable, citable pages. Candidates: public profiles, the Weekly Pick track record, per-ticker pages, carousels. This is an inference; no investing-app-specific share-loop data was found.
- Mass programmatic calculator pages are risky on a young domain (thin-content/scaled-content policies) and are the query type AI Overviews answer in place. A few genuinely useful tools tied to the product are a safer bet than hundreds of pages.

### Gaps
- No public data on viral coefficients for shareable portfolios or public profiles (e.g. Public.com, Commonstock, Stocktwits).
- No data on embeddable widgets as an acquisition channel for investing apps.
- No current (2024-2026) Robinhood referral share breakdown. Later 10-Ks were not checked.

## 5. Finfluencer/creator partnerships and affiliates: costs, compliance, effectiveness

### Takeaway
Creator partnerships work at scale for brokerages, but the only hard effectiveness number found is modest per creator. M1 Finance got about 39,400 accounts from about 1,700 influencers over about 3.3 years, roughly 23 accounts per influencer. FTC disclosure rules apply to everyone. FINRA Rule 2210 and the SEC Marketing Rule bind broker-dealers and registered advisers specifically. BullPen, as a non-broker research app, is mainly under the FTC, plus general anti-fraud and investment-adviser-definition risk around the Weekly Pick.

### Cited Findings
- FINRA fined M1 Finance $850,000 (2024), its first finfluencer enforcement. Between Jan 2020 and Apr 2023, about 1,700 influencers brought in over 39,400 new accounts through unique links, paid per funded account. Posts were found unfair, unbalanced or promissory (Rules 2210/2010) — [InvestmentNews](https://investmentnews.com/regulation-and-legislation/finra-fines-m1-finance-in-landmark-social-media-enforcement/250948), [Crowdfund Insider](https://www.crowdfundinsider.com/2024/03/222833-finra-fines-m1-finance-for-alleged-violations-regarding-use-of-influencer-program/)
- FTC Endorsement Guides: any material connection (payment, free product, affiliate commission) must be disclosed clearly and conspicuously, so that a reasonable person sees it before engaging. Buried hashtags and caption-only disclosures are insufficient (compliance-vendor summary). Civil penalties are cited at up to $53,088 per violation — [Sedric](https://www.sedric.ai/blog/influencer-compliance), [Adclear](https://www.adclear.ai/blog/finfluencer-marketing-sec-finra-compliance)
- FINRA: a third party's posts become the member firm's retail communications under Rule 2210 if the firm paid for them, helped prepare them, or endorsed or approved them — [Adclear](https://www.adclear.ai/blog/finfluencer-marketing-sec-finra-compliance)
- SEC Marketing Rule (registered investment advisers): paid testimonials and endorsements are allowed with disclosures (client status, compensation, conflicts), written agreements and oversight — [Adclear](https://www.adclear.ai/blog/finfluencer-marketing-sec-finra-compliance)
- SEC Investor Advisory Committee issued finfluencer recommendations (Nov 2024), a signal of rising regulatory attention — [SEC IAC PDF](https://www.sec.gov/files/sec-iac-finfluencer-recommendation-11222024.pdf)
- Cost: finance YouTube sponsorship $50-200 CPM (agency-reported) — [Creators Agency](https://creatorsagency.co/blog/best-fintech-sponsors-for-youtube-creators)

### Inferences
- For a bootstrapped app, revenue-share/affiliate (pay per paid conversion) with micro-creators is the cheapest way in. M1's numbers suggest most creators deliver little, so expect a power law and recruit many small ones rather than one big sponsorship.
- Compliance for BullPen (non-broker): require #ad/"paid partnership" disclosures and ban performance promises ("this pick made 40%") in creator briefs. The Weekly Pick track record is the riskiest asset to have creators amplify, because it reads as investment advice and as promissory. Not legal advice; if the Weekly Pick is ever personalised, adviser-registration questions arise.

### Gaps
- No verified per-acquisition cost or ROI benchmarks for fintech creator or affiliate programs (2024-2026).
- No data on micro-influencer (under 10k followers) finance CPMs or conversion in the US.

## 6. What's realistic for a one-person team: best 2-3 channels and time-to-results

### Takeaway
Combining the evidence above (this section is inference-heavy), the best early ROI for a solo founder is: (1) **Reddit and community participation** done genuinely, (2) **getting listed and mentioned** in third-party "best X app" roundups and YouTube reviews, and (3) **tightening the existing referral loop and shareable artefacts**. These compound into both human acquisition and AI citations. Search/GEO is a 6-12+ month play on a young domain. Creator affiliates are a reasonable fourth once the funnel converts.

### Cited Findings
- Off-site brand mentions are the strongest correlate of AI Overview visibility (0.664 vs 0.218 for backlinks) — [Ahrefs](https://ahrefs.com/blog/ai-overview-brand-correlation/)
- Reddit and YouTube are the most-cited domains across AI engines — [Search Engine Land / Peec AI](https://searchengineland.com/ai-search-engines-cite-reddit-youtube-and-linkedin-most-study-473138)
- Organic plus referral drove over 80% of Robinhood's new funded accounts in its hypergrowth period — [Robinhood S-1](https://www.sec.gov/Archives/edgar/data/1783879/000162828021013318/robinhoods-1.htm)
- AI referral traffic is small (about 1%) but converts better — [TechCrunch / Similarweb](https://techcrunch.com/2025/07/25/ai-referrals-to-top-websites-were-up-357-year-over-year-in-june-reaching-1-13b/), [Ahrefs](https://ahrefs.com/blog/ai-search-traffic-conversions-ahrefs/)
- Product Hunt: a one-day spike of 100-400 signups at top-3 — [Causo](https://hub.causo.ai/guides/product-hunt-traffic-data-2026)
- ChatGPT search inclusion requires only allowing OAI-SearchBot (about 24h to take effect) — [OpenAI](https://developers.openai.com/api/docs/bots)

### Inferences
- **Quick wins (days):** verify robots.txt allows OAI-SearchBot, PerplexityBot, Googlebot and Bingbot (ChatGPT search also leans on Bing-style indices; not verified in this pass). Treat llms.txt as optional. Add UTM/referrer tracking for chatgpt.com, perplexity.ai and gemini in PostHog so AI referrals are measured, not guessed.
- **Weeks:** one Product Hunt launch. Pitch inclusion in existing "best stock research app / best AI investing app" listicles (models cite these). Seed honest Reddit participation under the founder's own name.
- **Months (3-12):** Academy/ticker-page SEO and the AI-mention flywheel. Expect lower CTR than legacy benchmarks because of AI Overviews (-34.5% at position 1).
- Instagram auto-carousels and Discord are low marginal cost, but no evidence was found that they acquire users. Keep them running, measure them, and don't expand them without data.

### Gaps
- No rigorous time-to-results benchmark for GEO/AI citation on a new domain. Vendor claims of "weeks" are unverified.
- No head-to-head channel ROI comparison for solo-founder consumer fintech apps.
