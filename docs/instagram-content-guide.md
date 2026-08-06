# BullPen Instagram Content Guide

Reference doc for the automated Instagram pipeline (`lib/instagram/`, see `docs/instagram-setup.md` for account setup). Two inputs: 13 reference screenshots at `docs/instagram-reference/` from accounts posting similar financial content, and external research on what actually drives Instagram performance in 2026. Read this before adding a new content type or touching `lib/instagram/render/slides.tsx`.

## What the data says (not just taste)

Pulled from current research on carousel performance, not assumed:

- **Carousels outperform single images**: 2.14x more engagement, ~35% more saves, and the highest engagement rate of any format in Q2 2026 (0.50%, ahead of Reels at 0.48%). [Source: postnitro.ai](https://postnitro.ai/blog/post/instagram-carousel-post)
- **7-10 slides is the sweet spot.** Below 5 reads as a "short post"; above 10 triggers swipe fatigue. [Source: adpicto.com](https://www.adpicto.com/en/blog/instagram-carousel-best-practices-2026)
- **The first slide carries ~80% of the weight.** Exit rate is 23.8% right after slide one, stabilizing around 15% by slide four. The hook has to land in under 0.7 seconds of read time. [Source: opus.pro](https://www.opus.pro/blog/instagram-reels-hook-formulas)
- **Under 12 words per slide.** If it needs zooming or more than a glance, the swipe is already gone. [Source: opus.pro](https://www.opus.pro/research/best-video-hooks-instagram)
- **The 2026 algorithm ranks on saves, shares, watch time, and profile clicks — not likes or follower count.** A carousel with a 70%+ swipe-through rate gets distributed to 3-5x more non-followers. Frequency without quality actively hurts distribution now: a low-signal post drags down the account's average and suppresses future reach too. [Source: later.com](https://later.com/blog/how-instagram-algorithm-works/), [Source: kontentino.com](https://www.kontentino.com/blog/how-often-to-post-on-instagram/)
- **Post 3-4x/week minimum for growth, evening hours (6-11pm), Tue-Thu strongest.** [Source: buffer.com](https://buffer.com/resources/when-is-the-best-time-to-post-on-instagram/)
- **Caption's first 125 characters are the only part visible before "more."** That first line has one job: turn "interested" into "invested" enough to tap. [Source: cyndizaweski.com](https://www.cyndizaweski.com/articles/how-to-write-instagram-captions)
- **Financial content lives or dies on saves and shares specifically** — people share things they find genuinely useful, more than any other niche. Design every post to be worth bookmarking, not just liking.

**Practical implication for the pipeline**: the current earnings-calendar generator caps at ~24 companies / up to 6 slides. That's fine for a quiet week but worth revisiting toward the 7-10 slide target for a busy week — more room for the hook to breathe and for the CTA to not feel rushed.

## The reference accounts (`docs/instagram-reference/`)

| Account | Style | Takeaway |
|---|---|---|
| **moby.invest** ⭐ | Elegant serif headlines over real photography or clean white backgrounds. A small "stat strip" of Market Cap + sparklines across 1M/3M/6M/1Y/5Y timeframes, color-coded. Alternates dark and white backgrounds by mood. Editorial, magazine-like, restrained color use. | **This is the primary reference.** Closest to BullPen's own brand voice (§7 "Never decorative color" in DESIGN.md) and the one the user explicitly prefers. |
| investingvisuals | Sankey/flow diagrams, clean white bg, "Not financial advice" printed directly on the graphic, sourced. | On-graphic disclaimer + sourcing is worth copying outright. |
| carbonfinance | Big bar-chart comparisons ("Waymo is worth as much as Uber"), dark bg, sources cited at the bottom, explicit "like if you enjoyed" CTA. | Comparison format works well for a single striking number. |
| watcher.guru | Dramatic real photography (campus/product shots), huge bold sans headline, one company per carousel slide ("Trillion Dollar Club"). | High production value — not realistically achievable without licensed photography (see Constraints below). |
| einsteinofwallst, daytrading, advicefromtraders, stocksharks | Bold ALL-CAPS sans-serif, high-energy, meme-adjacent, color-highlighted keywords, "SWIPE" cues. | A punchier secondary register for high-energy/breaking-news content, not the default. |
| stockmarketchasers | Ranked grid with real company logos, humor/relatability illustration. | Real ticker logos in a grid read very clean and are directly reusable — BullPen already has `logo_url` data for this. |
| invest (HappyStocks) | Category grid ("9 Industries of the Future"), neon-on-dark, ticker badges grouped by theme. | Good model for thematic/educational roundup posts. |

## Style system to adopt

Extends BullPen's existing brand system (`DESIGN.md`) rather than replacing it — same tokens, moby-inspired composition.

1. **Lead with Instrument Serif, not just as an accent.** DESIGN.md already reserves this font for marketing headlines — moby's whole visual identity is basically "what if the *One Serif Word Rule* was the whole headline." Current `HookSlide` uses serif only for a small "This week's earnings" eyebrow line with the real headline in bold Geist Sans. Worth testing serif-as-hero-headline for company-spotlight posts specifically (moby's exact composition), keeping Geist Sans bold for list/data-heavy slides where legibility at small sizes matters more.
2. **Real ticker logos over text-only badges.** `logo_url` is already fetched via TwelveData/logo.dev everywhere else in the app (`CompanyLogo` component). The earnings-list slide currently shows ticker + name as plain text — adding the actual logo per row (like stockmarketchasers' grid or HappyStocks' category boxes) would close a real gap versus these references at near-zero new cost, since the data's already there.
3. **A light/white background variant, used deliberately.** Every current BullPen Instagram slide is dark (`#070b09`). moby alternates based on content mood — data visualizations and clean comparisons often read better on white (see their Tesla YTD chart, investingvisuals' Sankey diagrams). Not a redesign — an optional second `bg`/`fg` pair for specific content types (comparisons, "how they make money" style breakdowns), same tokens BullPen's light theme already defines in `app/globals.css`.
4. **The "stat strip"** (Market Cap + 1M/3M/6M/1Y/5Y sparklines, red/blue-coded) is moby's most distinctive, ownable device and BullPen has every input for it already (`getStockCandles`, `getStatistics`). Worth building as a reusable slide component for any single-company spotlight post (earnings reaction, health-score spotlight, milestone post) — not earnings-calendar-specific.
5. **Cite the source, on the slide.** investingvisuals and carbonfinance both print their data source directly on the graphic ("Source: Bloomberg," "Source: Fiscal AI"). BullPen should do the same — "Source: Twelve Data" or similar, small, bottom corner — it reads as more credible than a source line buried in the caption, and takes zero extra design work.
6. **Keep the visual system identical across every slide in a carousel.** Every reference account (moby especially) keeps typography/color/spacing locked across all slides in a post — it's what makes a carousel read as one designed object instead of a slideshow. BullPen's `slides.tsx` already does this (shared `BG`/`FG`/font constants across `HookSlide`/`EarningsListSlide`/`CTASlide`) — just don't regress this when adding new templates.

### Constraints worth naming honestly

- **No licensed photography or AI-generated hero imagery.** watcher.guru/stocksharks/advicefromtraders lean heavily on dramatic real or AI-generated photography as backdrops. BullPen's renderer (`next/og`/Satori) can composite raster images, but there's no photo library, no AI image generation wired up, and using real company campus photos or executive headshots without rights is a genuine legal exposure, not just a nice-to-have someone forgot. **Do not add "generate a hero photo" to the pipeline without a licensing conversation first.** Company *logos* (small, factual, nominative use) are a different and much safer category than editorial photography of people or property.
- **No segment-level revenue breakdowns.** investingvisuals' "How they make money" Sankey diagrams need product-line revenue splits (e.g. Apple's Services vs. iPhone vs. Mac). TwelveData's income statement doesn't carry this level of segment detail — it would need SEC XBRL parsing (`lib/ingestion/` handles filing ingestion but not to this granularity yet). Flag as a real content type worth wanting, not a quick add.
- **Bold ALL-CAPS/meme register is a deliberate occasional choice, not the default.** It fits breaking-news, single-day-mover content. Applying it to routine weekly content would clash with BullPen's actual brand positioning (`DESIGN.md`: "Bloomberg-terminal density" and hype-driven design are the named anti-references).

## Content ideas, mapped to what BullPen can actually build

Ordered by how directly they reuse existing data/infrastructure — first few are close to trivial, later ones need new work.

**Already buildable from existing data, no new integration needed:**
1. **Earnings calendar** (shipped) — this week's confirmed S&P 500/Nasdaq 100/TSM reporters.
2. **Weekly market movers** — top gainers/losers, S&P 500/Nasdaq 100 scope (`getTopMovers`), styled like stockmarketchasers' ranked grid with real logos.
3. **Post-earnings reaction** — "X beat/missed by Y%, stock moved Z%" the morning after a report (`getCompanyEarnings` EPS surprise data already exists and already computes beat/miss for the in-app Earnings Calendar widget).
4. **52-week high/low tracker** — stocks in the tracked universe hitting new highs or lows this week (`screener_stats.week52_high/low`, already computed for alerts).
5. **Dividend calendar** — upcoming ex-dividend dates for notable payers (`getDividendsCalendar`, already wired for the in-app Market Calendar).
6. **Market cap milestones** — "X just crossed $1T," watcher.guru's exact format, driven by `screener_stats.market_cap` crossing round thresholds.
7. **Company comparison** — carbonfinance's "A vs B" bar chart, using `screener_stats` (market cap, P/E, revenue) for any two tickers — good for rivalries (e.g. two chipmakers, two airlines).
8. **Sector/industry weekly leaderboard** — which sectors led/lagged (`sector_metric_stats`, `industry_metric_stats`, same data the in-app Sector Heatmap leaderboard already uses).
9. **Mega-cap performance comparison** — moby's "Tesla is the worst-performing Mag 7 stock" format, trivial with existing quote data for a fixed watchlist (Mag 7, or any themed basket).
10. **Stock split announcements** — `getSplitsCalendar`, already wired for the in-app calendar.

**Needs a repurposing pass, not new data:**
11. **Weekly AI Stock Pick reveal** — BullPen already generates a grounded, published weekly pick via `lib/ai/picks/`'s scout→ground→commit pipeline (see that pipeline's architecture notes). Reusing its already-published, already-fact-checked thesis for a short-form slide is far lower-risk than generating new picks content from scratch, and was flagged as the natural v2 content type when the Instagram pipeline was first built.
12. **Health Score spotlight** — BullPen's own differentiated IP (nothing in the reference set has an equivalent). "Why does $X have a health score of 82?" using `computeHealthScore`'s existing category breakdown. Good save/share bait specifically because it's not generic market commentary — it's a BullPen-only lens.
13. **"How [Company] makes money"** — buildable today at the *whole-company* level (revenue/gross profit/net income from `getIncomeStatement`, styled like investingvisuals but without the segment-level Sankey breakdown) — a simpler bar/waterfall version is realistic now; the full segment Sankey is the ingestion-dependent version above.

**Different register — educational, not data-driven:**
14. **Academy glossary explainers** — "What is a P/E ratio, actually" style posts, repurposing existing Academy course content (`lib/academy` course material already exists in beginner-friendly language). Good for engagement variety and top-of-funnel reach beyond people who already track individual stocks.

## Caption and copy rules

- First line does the work — assume only the first ~125 characters are ever read before a tap.
- Every post ends with a specific, low-friction call to action pointed at BullPen (not just "link in bio") — the existing generator already does this correctly.
- The house style already in `lib/instagram/content/earnings-calendar.ts`'s system prompt stays: no em/en dashes, no hype language, cite only real provided data, fixed non-negotiable disclaimer appended in code (never left to the model). Apply this same prompt shape to every future content-type generator, not just earnings.
- Cite the data source on caption *and* slide (see Style System §5) — matches how the more credible reference accounts (investingvisuals, carbonfinance) operate, and it's free trust-building.

## Posting cadence

Given the algorithm now rewards signal quality over frequency, and the research above shows 3-4x/week as the growth threshold: the current weekly earnings-calendar cadence is a reasonable floor, not a ceiling. As more content types from the list above come online, evening postings (6-11pm, Tue-Thu strongest) is the target window rather than the current Sunday-morning generation slot — worth revisiting `cron-instagram-earnings.yml`'s schedule once there's more than one content type in rotation and an actual posting calendar to plan around.

## Where this feeds into the codebase

- New content-type generators live in `lib/instagram/content/<name>.ts`, following `earnings-calendar.ts`'s shape: fetch real data first, Claude only writes grounded copy, return `null` (skip, don't post filler) when there's nothing real to say.
- New slide templates live in `lib/instagram/render/slides.tsx`, reusing the shared color/font tokens — don't fork a new visual system per content type.
- `instagram_posts.content_type` already supports arbitrary values — adding a new content type doesn't need a migration, just a new generator + a new cron trigger (or extending the existing weekly one to try multiple content types per run).
