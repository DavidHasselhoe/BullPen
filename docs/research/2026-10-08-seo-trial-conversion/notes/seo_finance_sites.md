# SEO strategy for an early-stage consumer investing / stock research web app (2024-2026 evidence)

Scope note: about 18 searches and fetches, done 2026-10-08. Third-party traffic numbers (Semrush, Similarweb, Ahrefs) are modelled estimates, not analytics. Anything flagged "vendor" comes from an SEO agency or link-selling blog with a commercial interest, so treat it as directional only.

## 1. How successful finance/investing sites earn organic traffic, and which page types drive it

### Takeaway
The big data sites (Stock Analysis, Finviz, Macrotrends) win on ticker-level data pages and tools. Their traffic leans heavily on brand and direct visits, built over years. The publishers (Investopedia, the Dotdash Meredith network) win on glossary and educational content, and that is exactly the segment AI Overviews are eroding. I found no published, primary-source case study of how Stock Analysis grew.

### Cited Findings
- Stock Analysis was founded in 2019 by Kris Gunnars. He previously founded Authority Nutrition, which became the basis of Healthline's nutrition brand. That makes him a founder with a proven content/SEO track record, not a first-timer. — [stockanalysis.com/about](https://stockanalysis.com/about/); [Healthline author page](https://www.healthline.com/authors/kris-gunnars)
- Semrush, August 2026 data for stockanalysis.com: about 6.09M total visits (down from 7.32M in July), about 1.26M organic visits, and 70.72% of traffic from direct. Top organic keywords are branded ("stock analysis" 74K/mo volume, "stockanalysis", "stockanalysis com"). 1.33M backlinks, about 15.16K referring domains, Authority Score 60. — [Semrush overview](https://semrush.com/website/stockanalysis.com/overview)
- A secondary summary of an earlier Semrush snapshot gives 8.38M visits in January 2026. This is consistent with seasonal and market-driven swings, but the two snapshots are not directly comparable. — [instantdomainsearch summary of Semrush](https://instantdomainsearch.com/directory/stockanalysis.com)
- Similarweb, October 2025, top finance sites by visits: Yahoo (3.2B/mo, mostly Yahoo Finance and portal traffic), PayPal 744.9M, TradingView 232.4M, Investing.com 167.3M. Ahrefs (July 2025) estimates Investing.com at about 90M organic visits globally, and Investopedia at about 11M US search traffic, rank #7 among US finance sites. — [Ahrefs top finance websites](https://ahrefs.com/websites/finance); [Ahrefs US finance](https://ahrefs.com/websites/united-states/finance); search summary of [Similarweb](https://similarweb.com/company/investing.com)
- IAC's Q1 2025 earnings: Dotdash Meredith (owner of Investopedia) reported a 3% YoY drop in core sessions, partly blamed on "weakening referral traffic from search platforms" and AI Overviews. AI Overviews appeared on roughly a third of the searches tied to its content. — [PPC Land on Dotdash Meredith Q1 2025](https://ppc.land/dotdash-meredith-reports-google-ai-overviews-impact-traffic-in-q1-earnings/)

### Inferences
- Stock Analysis traffic is mostly direct and branded. Its organic engine is the long tail of ticker pages ("AAPL market cap", "NVDA revenue", "TSLA financials"), but its moat is product quality turning into repeat and direct visits. This is inferred from the 70% direct share and the branded top keywords, not from a disclosed breakdown.
- The page types that work for data sites are ticker sub-pages (financials, statistics, dividends, market cap history), screeners, comparison pages, ETF holdings, and IPO/earnings calendars. This is general domain knowledge and could not be verified with page-level traffic data (Semrush page data is paywalled). Treat it as informed inference.
- A two-week-old domain cannot compete head-on for "AAPL stock" (Yahoo, Google Finance, CNBC, Nasdaq and Robinhood dominate). The realistic early wins are narrower, attribute-specific long-tail queries.

### Gaps
- No founder interview or case study on Stock Analysis growth was found. A search result attributed a "we didn't invest much in SEO, grew by word of mouth" quote to an Indie Hackers interview, but that interview appears to be about Cronometer, not Stock Analysis. Do not use it.
- No 2025-2026 traffic estimates were found for Finviz, Macrotrends, Simply Wall St, TipRanks, Zacks or Koyfin, and no page-type traffic splits for any of them.

## 2. Programmatic SEO for ticker/stock pages: what ranks vs what gets flagged

### Takeaway
Google's scaled content abuse policy is method-neutral and has no page-count threshold. It targets pages made "for the primary purpose of manipulating search rankings and not helping users." The risk is judged across the whole site, not page by page, and lost trust takes months to rebuild. Ticker pages are legitimate when each one carries real, per-ticker data that users want. Template prose with the ticker swapped in is the failure mode.

### Cited Findings
- Google's spam policies (last updated 2026-08-28): "Scaled content abuse is when many pages are generated for the primary purpose of manipulating search rankings and not helping users." Examples: "Using generative AI tools or other similar tools to generate many pages without adding value for users"; "Scraping feeds, search results, or other content to generate many pages (including through automated transformations…)"; "Stitching or combining content from different web pages without adding value." — [Google Search Central spam policies](https://developers.google.com/search/docs/essentials/spam-policies)
- The same page defines doorway abuse as "when sites or pages are created to rank for specific, similar search queries" that "lead users to intermediate pages that aren't as useful as the final destination." This is relevant to near-identical "is X a good buy" style pages. — [Google spam policies](https://developers.google.com/search/docs/essentials/spam-policies)
- No volume threshold has been published. The policy applies whether pages come from AI, humans or both. — [PPC Land explainer](https://ppc.land/scaled-content-abuse/)
- John Mueller (Bluesky, about September 2026), on a programmatic site that generated pages from combinations of attributes: programmatic SEO "often leads to a site that's either spam, borderline spam, or low quality". "Our systems have possibly lost faith in your site providing good value to users based on the old pages". Recovery "tends to take time and significant effort to show the value". Deleting the bad pages does not automatically restore trust. — [TechWyse report of Mueller's post](https://www.techwyse.com/news/search-seo/google-john-mueller-programmatic-seo-site-trust-recovery)
- Glenn Gabe on the December 2025 core update: "publishing AI content without human intervention is extremely risky". Humans should be involved "(editing, reviewing, fact checking)" to avoid drops or scaled-content-abuse manual actions. — [GSQi December 2025 core update analysis](https://gsqi.com/marketing-blog/google-december-2025-broad-core-update-analysis-findings)
- Industry guidance (secondary, not Google): "thin content almost always traces back to thin data". Pages need unique per-page data, not a variable swapped into identical boilerplate, and Google "forms a view of a site and a section based on the quality it sees across many pages." — [IRPR on avoiding thin content in pSEO](https://seo.irpr.agency/programmatic-seo/avoiding-thin-content/)

### Inferences
- For BullPen, about 519 ticker pages is small and not a "scale" red flag in itself. The risk is low per-page differentiation, for example an AI paragraph per ticker that reads the same across 500 pages, or pages that are mostly a client-rendered shell before JS.
- Google's own systems rate the site as a whole, so a large set of low-value auto-generated pages (thin glossary entries, or weekly pick pages with little content) can drag down the stronger pages. Pruning or noindexing the weakest templates may help indexing of the rest. This is inferred from the Mueller and IRPR points above.
- Differentiators BullPen already has that competitors' ticker pages often lack: the health score, signals, the "Why Today" price explanation, Washington Trading congress trades, 13F institutional holders, and beginner-level plain-language explanations. Making these server-rendered and crawlable on the ticker page is the per-page uniqueness the policy rewards. This is a product-specific inference.

### Gaps
- No named, verified example of a finance ticker-page site that was penalized for scaled content abuse was found.

## 3. YMYL and E-E-A-T for finance content

### Takeaway
Finance is classic YMYL, and core updates hit it hardest: the December 2025 update caused "massive volatility" in finance. Sites with clear author credentials and well-organised, in-depth content were reported as winners. I found no evidence that Google applies a separate stricter rule to small sites. In practice, though, small new finance sites have fewer trust signals (links, mentions, authors) to rely on.

### Cited Findings
- The December 2025 broad core update (December 11-29, 18 days, major tremor December 20) "heavily impacted" finance sites from about December 14. Some dropped severely, others surged. Gabe tracked over 3,000 sites. — [GSQi](https://gsqi.com/marketing-blog/google-december-2025-broad-core-update-analysis-findings)
- Secondary analysis of the December 2025 update: the biggest shifts were in healthcare and financial YMYL sectors. — [Xpert.Digital](https://xpert.digital/en/google-core-update-december-2025/?amp=1)
- June 2025 core update (from June 30, 16 days): "independent & long-standing sites, especially those with clear author credentials, in-depth visuals, and well-organised layouts, surged". Some sites hit by the September 2023 Helpful Content Update partly recovered. — [Amsive (Lily Ray's team) June 2025 winners/losers](https://www.amsive.com/insights/seo/june-2025-core-update-winners-losers-trends/); [Outrank summary](https://www.outrank.co.uk/?p=35629)

### Inferences
- Practical E-E-A-T for BullPen: a named human author or editor with credentials on educational and Academy content, an "About / methodology" page explaining the health score and data sources (TwelveData, SEC filings), data-source citations on ticker pages, clear "not investment advice" disclosures, and human review of AI-generated text before it is indexed. These are commonly recommended, but their ranking impact is not quantified by any source found.
- AI-written weekly stock picks are the highest YMYL risk among BullPen's page types: they are generated, opinionated, and "should you buy" content.

### Gaps
- No quantitative study isolating the effect of author bylines or credentials on finance rankings was found. Lily Ray's own finance/YMYL posts were not fetched directly.

## 4. Realistic timelines and tactics for a new or migrated domain

### Takeaway
"Discovered, currently not indexed" means Google knows the URL but has not yet chosen to crawl it. For a site of this size, that is about demand and priority (popularity, internal links, perceived quality), not crawl budget capacity. Google says crawl budget matters for sites with 10K+ rapidly changing pages or 1M+ pages. Domain moves take months to settle, even when done correctly.

### Cited Findings
- Google's crawl budget guide is aimed at "Large sites (1 million+ unique pages)…" or "Medium or larger sites (10,000+ unique pages) with very rapidly changing content (daily)", or sites with "a large portion of their total URLs classified by Search Console as Discovered - currently not indexed." Crawl demand is driven by "perceived inventory", "popularity" ("URLs that are more popular on the Internet tend to be crawled more often") and "staleness". Recommendations: consolidate duplicates, keep sitemaps updated with `<lastmod>`, improve load speed, support 304 responses. — [Google: managing crawl budget](https://developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget)
- Mueller has said the likeliest causes of "Discovered, currently not indexed" are auto-generating too many URL variations or poor internal linking. Linking priority pages from pages higher in the site architecture is the main fix. — [Positional](https://www.positional.com/blog/discovered-currently-not-indexed); [Rank Math KB](https://rankmath.com/kb/discovered-currently-not-indexed/)
- Mueller has also said site-move outcomes cannot be fully predicted even when done correctly, and that rankings can take months to settle. Practitioners recommend monitoring for at least 180 days. Partial or staggered migrations do worse than a full move at once. — [SEO-Day summary](https://www.seo-day.de/news/article/google-site-move-outcomes-impossible-to-fully-know-ahead-of?lang=en); [SEJ](https://www.searchenginejournal.com/google-splitting-merging-website-can-cause-months-unstable-search-rankings/256789/); [Google site move docs](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes)

### Inferences
- With about 630 discovered-not-indexed URLs on a 2-week-old domain, this is expected and normal. Google is rationing crawls on a domain with little popularity signal. The fastest levers are likely:
  1. Internal links from the homepage and other indexed pages into hub pages (an "S&P 500 stocks" list page, sector pages, an A-Z glossary index), with each hub linking to its children.
  2. Cross-linking between ticker pages: peers, sector, compare.
  3. A first wave of external links or mentions.
  4. Making sure ticker pages serve meaningful server-rendered HTML.
  5. Manually requesting indexing for the 20-50 most important pages.

  This ranking of levers is an inference from Google's "popularity" and internal-link guidance, not a measured result.
- The bullpen.no to bullpeninvest.com 301 passes whatever equity the old domain had. bullpen.no was itself young with few links, so the migration likely neither helped nor hurt much. Expect several months before indexing and rankings stabilise.
- There is no official "sandbox". The observed slow start of new domains is consistent with Google's popularity-based crawl demand. No 2024-2026 primary source quantifies sandbox length.

### Gaps
- No quantitative data was found on how long a 500-page finance site typically takes to move from "discovered" to "indexed".

## 5. Long-tail keyword opportunities for beginner investors

### Takeaway
Question-style beginner queries ("what is a P/E ratio") are now the queries most likely to show an AI Overview. Short ticker or attribute queries rarely trigger one. That shifts the opportunity toward data and tool queries (ticker sub-metrics, X vs Y comparisons, calculators) and away from pure definitions.

### Cited Findings
- Pew (March 2025 browsing data, 900 US adults, 68,879 searches): 60% of question-format searches produced an AI summary, as did 53% of 10+ word searches and 36% of full-sentence queries, but only 8% of 1-2 word searches. — [Pew Research](https://www.pewresearch.org/short-reads/2025/07/22/google-users-are-less-likely-to-click-on-links-when-an-ai-summary-appears-in-the-results/)

### Inferences
- Better bets for BullPen: "[ticker] vs [ticker]" comparison pages (BullPen already has compare), "[ticker] dividend history / yield", "[ticker] insider/congress trades", "[ticker] institutional holders", "[ticker] earnings date", and calculators (dividend, compound interest, DCA). These are short, data-seeking queries that AI Overviews trigger on less often, which fits BullPen's data. This is inferred from Pew's query-length finding.
- The "is X stock a good buy" pattern is both YMYL-sensitive and doorway-shaped. Treat it with care (see section 2).

### Gaps
- No keyword difficulty or volume data was pulled for specific beginner queries. A paid tool (Ahrefs or Semrush) is needed. No study was found that breaks out AI Overview prevalence specifically for finance or investing queries.

## 6. Link building and digital PR for small fintech sites

### Takeaway
The formats repeatedly cited as working are original data studies, expert commentary on news (newsjacking), and free tools or calculators. The available statistics come from link-building vendors and should be treated as marketing.

### Cited Findings
- Vendor claims (2026): finance and insurance sites average 101 new referring domains per month, the highest of any industry. Top-ranking fintech pages have a median DR of 74 and 412 referring domains. Editorial dofollow finance links cost about $1,200 each in 2026, up from $850 in 2023. Campaigns cost $4K-25K per month. The top digital PR formats are original data studies, reactive expert commentary, and free tools or calculators. — [Webtonic (vendor)](https://www.webtonic.io/blog/fintech-link-building-statistics)
- Example: a personal finance site earned 108 backlinks from a "cost of beer in each U.S. state" data story. — [Go Fish Digital DollarGeek case study](https://gofishdigital.com/case-study/dollargeek/) (via search summary)
- Stock Analysis has about 15.16K referring domains, up 6% month over month. That is the scale of link equity behind a mature data site. — [Semrush](https://semrush.com/website/stockanalysis.com/overview)

### Inferences
- BullPen has unusual data assets for low-cost data PR: Washington Trading (congress trades), 13F institutional holdings, and the weekly pick track record. Recurring data stories ("what Congress bought this quarter", "most-held stocks by top funds") are the kind of reactive, data-led content journalists cite. This is speculation and untested.
- Embeddable widgets and HARO alternatives (Connectively shut down in 2024; Qwoted and Featured are commonly cited replacements) were not researched with sources. Treat these as unverified.

### Gaps
- No independent (non-vendor) quantitative study of link-building ROI for small fintech sites was found. Embeddable-widget link tactics were not researched.

## 7. Glossary and educational content after AI Overviews

### Takeaway
Informational queries with AI Overviews lose roughly half or more of their clicks. Ahrefs measured a 58% lower top-result CTR (December 2025), Seer a 61% organic CTR drop, and Pew 8% vs 15% click rates. Definition-style glossary pages are the most exposed format. They can still earn some traffic and work as internal-link hubs, but they are a weak primary acquisition bet for 2026.

### Cited Findings
- Ahrefs (December 2025 GSC data, 300K keywords vs a December 2023 baseline): AI Overview presence correlates with a 58% lower CTR for the #1 result, up from 34.5% in their April 2025 study. Reported per-position reductions: pos 2 -50.8%, pos 3 -46.4%, pos 10 -19.4%. — [Ahrefs](https://ahrefs.com/blog/ai-overviews-reduce-clicks-update/); [Medianama](https://www.medianama.com/2026/02/223-google-ai-overviews-click-through-rates-58-study/). Note: one secondary source quotes absolute CTRs of 0.073% to 0.016%, which do not fit a 58% drop. It is likely misreported, so do not use those absolute numbers.
- Seer Interactive (published November 4, 2025; 3,119 informational queries, 42 organizations, 25.1M organic impressions, June 2024-September 2025): organic CTR on queries with AI Overviews fell 61%, and paid CTR fell 68%. — [PPC Land on Seer](https://ppc.land/google-ai-overviews-reduce-organic-ctr-61-paid-traffic-68/); [Seer](https://www.seerinteractive.com/news/forbes-cites-seer-interactive-research-on-ai-overviews)
- Pew (March 2025): with an AI summary, users clicked a traditional result in 8% of visits vs 15% without. Only 1% clicked a link inside the summary. 26% ended their browsing session vs 16%. About 18% of all searches showed an AI summary. — [Pew Research](https://www.pewresearch.org/short-reads/2025/07/22/google-users-are-less-likely-to-click-on-links-when-an-ai-summary-appears-in-the-results/)
- Dotdash Meredith (Investopedia's owner) attributed part of a 3% session decline to AI Overviews (Q1 2025). — [PPC Land](https://ppc.land/dotdash-meredith-reports-google-ai-overviews-impact-traffic-in-q1-earnings/)

### Inferences
- BullPen's 116 glossary pages: their best value is likely as internal-link hubs and on-site tooltip targets, plus citation candidates inside AI answers (brand exposure), not raw clicks. Glossary pages that embed live data examples ("P/E ratio of the S&P 500's largest companies today") are more differentiated than definitions.

### Gaps
- No finance-specific AI Overview CTR study was found. There is no data on whether being cited inside an AI Overview offsets the click loss for small sites.
