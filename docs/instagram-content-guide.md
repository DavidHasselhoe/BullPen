# BullPen Instagram Content Guide

Reference doc for the automated Instagram pipeline (`lib/instagram/`, see `docs/instagram-setup.md` for account setup). Built from 13 reference screenshots at `docs/instagram-reference/`, external research on what actually drives Instagram performance in 2026, and now a shipped, reviewed, approved visual template (see "The approved template" below) — not just a mood board anymore. **Read "The approved template" before adding a new content type or touching `lib/instagram/render/slides.tsx`** — it's the design system every future slide reuses, not a fresh decision each time.

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
| investingvisuals | Sankey/flow diagrams, clean white bg, "Not financial advice" printed directly on the graphic, sourced. | Tried on-graphic sourcing on BullPen's own posts (see "The approved template" below) and reversed it after review — noted here as a real option other brands use well, not one that fit this one. |
| carbonfinance | Big bar-chart comparisons ("Waymo is worth as much as Uber"), dark bg, sources cited at the bottom, explicit "like if you enjoyed" CTA. | Comparison format works well for a single striking number. |
| watcher.guru | Dramatic real photography (campus/product shots), huge bold sans headline, one company per carousel slide ("Trillion Dollar Club"). | High production value — not realistically achievable without licensed photography (see Constraints below). |
| einsteinofwallst, daytrading, advicefromtraders, stocksharks | Bold ALL-CAPS sans-serif, high-energy, meme-adjacent, color-highlighted keywords, "SWIPE" cues. | A punchier secondary register for high-energy/breaking-news content, not the default. |
| stockmarketchasers | Ranked grid with real company logos, humor/relatability illustration. | Real ticker logos in a grid read very clean and are directly reusable — BullPen already has `logo_url` data for this. |
| invest (HappyStocks) | Category grid ("9 Industries of the Future"), neon-on-dark, ticker badges grouped by theme. | Good model for thematic/educational roundup posts. |

## The approved template (shipped, locked in)

Built, tested, reviewed, and approved end-to-end on the earnings-calendar carousel — this is now **the** BullPen Instagram visual template, not a proposal. Every future content type reuses this exactly rather than re-deriving a new look. Lives in `lib/instagram/render/slides.tsx`; treat that file as the source of truth if this doc and the code ever disagree.

**Theme — light, not dark.** The original build used a dark canvas (`#070b09`) matching the app's default dark mode. Shipped reality is the opposite: white background, near-black ink, across *all* slide kinds in a carousel together, never mixed. The reason wasn't aesthetic preference — most third-party ticker logos are white/transparent-background PNGs, which forced an isolated light badge on a dark slide and read as an awkward box-in-a-box. White canvas fixes this at the root: a logo just sits on the page with a thin ring, no boxed-in mismatch. Once one slide in a carousel is light, every slide in it has to be (§ "Keep the visual system identical" below is a rule, not a suggestion).

```
BG          #ffffff   canvas
FG          #0a0a0a   primary text / ink
SURFACE     #f7f7f7   card fill (list rows) — separates from pure-white canvas without a hard border
MUTED       #71717a   secondary text (company names)
MUTED_DIM   #a1a1aa   tertiary text (dates) — legible at slide viewing size; below strict 4.5:1 AA if held to that bar, a deliberate call for de-emphasized metadata in a promotional graphic, not an oversight
BORDER      #e4e4e7   hairlines, logo badge ring
BRAND       #34d399   Signal Emerald (emerald-400) — the one deliberate color per post, per DESIGN.md's One Signal Rule. Never decorative, never a background wash.
BRAND_INK   #0a0a0a   text/icon on top of BRAND — dark reads better on emerald-400 than white does
BMO         #0ea5e9   Tailwind sky-500, matches EarningsCalendarWidget's BMO tag elsewhere in the app
AMC         #f59e0b   Tailwind amber-500, matches EarningsCalendarWidget's AMC tag
```

**Wordmark.** Icon (`public/BullPenLogo.png`) + lowercase "bullpen", bold, `-0.02em` tracking — matches `components/landing/Atoms.tsx`'s real brand treatment exactly. (First build used spaced-out uppercase text; that was never how the wordmark renders anywhere else in the app.) Default size 36px icon on hook/list slides; 44px on the CTA/closing slide, deliberately the largest brand moment since it's the last thing before the swipe-away. `Wordmark` component takes a `size` prop — reuse it, don't rebuild it.

**Company logo badges.** Circle, thin `BORDER` ring, no fill — logo sits directly on the white canvas. Real logo resolved once at *content-generation* time via `/api/logo/[ticker]` (same self-healing proxy `CompanyLogo` uses in the app), never at render time — Satori has no `onError`, so the fallback (ticker initials) has to be decided before the slide is ever rendered, not during. `CompanyBadge` component, reuse for any content type that lists companies.

**The mascot — one hero moment, not decoration.** `public/illustrations/bull-alert.png` (checking a phone, notification bell) appears on the **hook slide only**, bleeding off the bottom-right corner. It works directly on a light slide because it's black line art on transparent background already — no CSS invert needed the way the app's own dark-mode usage requires. It does not repeat on list/CTA slides — one appearance per carousel keeps it a moment instead of wallpaper. Pick the mascot pose to match the content's actual mood (`bull-alert` = "heads up, something's coming," fits a calendar/schedule format specifically) rather than defaulting to the same pose for every content type — see `public/illustrations/` for the full pose set.

**The stat pill.** Small emerald pill, bold, uppercase, e.g. "6 COMPANIES REPORTING" — sits above the headline on the hook slide, gives an immediate scannable number before the reader even parses the headline text. Generalizes past earnings: "4 STOCKS AT 52-WEEK HIGHS," "$1.2T MARKET CAP," whatever the content type's single most scannable number is. This is the ONE use of `BRAND` color on the hook slide — don't add a second colored element on the same slide, that's what the One Signal Rule is guarding against.

**No on-slide source citation.** Originally added ("Source: Twelve Data," matching investingvisuals/carbonfinance) then explicitly removed after review — decided against it for this brand. Caption-level data-fidelity language stays (see Caption rules below); it just doesn't print on the graphic itself.

**Keep the visual system identical across every slide in a carousel.** Every reference account (moby especially) keeps typography/color/spacing locked across all slides in a post — it's what makes a carousel read as one designed object instead of a slideshow. `slides.tsx` shares its color/font constants and `Wordmark`/`CompanyBadge` components across every slide kind — don't fork a parallel palette or wordmark treatment for a new content type.

### Still open, not yet decided

These were considered during the build but not adopted — worth revisiting for a content type where they fit better than they did here, not assumed settled either way:

- **Serif-as-hero-headline** (moby's exact composition, the whole headline in Instrument Serif rather than bold Geist Sans). Earnings-calendar kept bold sans for legibility on a data-listing format; a single-company spotlight post (health-score spotlight, earnings reaction) is the more natural fit to actually try this.
- **The "stat strip"** (Market Cap + 1M/3M/6M/1Y/5Y sparklines, red/blue-coded) — moby's most distinctive device. Not needed for a calendar/list format; the natural home is a single-company spotlight slide, same candidates as above.

### Constraints worth naming honestly

- **No licensed photography or AI-generated hero imagery.** watcher.guru/stocksharks/advicefromtraders lean heavily on dramatic real or AI-generated photography as backdrops. BullPen's renderer (`next/og`/Satori) can composite raster images, but there's no photo library, no AI image generation wired up, and using real company campus photos or executive headshots without rights is a genuine legal exposure, not just a nice-to-have someone forgot. **Do not add "generate a hero photo" to the pipeline without a licensing conversation first.** Company *logos* (small, factual, nominative use) are a different and much safer category than editorial photography of people or property.
- **No segment-level revenue breakdowns.** investingvisuals' "How they make money" Sankey diagrams need product-line revenue splits (e.g. Apple's Services vs. iPhone vs. Mac). TwelveData's income statement doesn't carry this level of segment detail — it would need SEC XBRL parsing (`lib/ingestion/` handles filing ingestion but not to this granularity yet). Flag as a real content type worth wanting, not a quick add.
- **Bold ALL-CAPS/meme register is a deliberate occasional choice, not the default.** It fits breaking-news, single-day-mover content. Applying it to routine weekly content would clash with BullPen's actual brand positioning (`DESIGN.md`: "Bloomberg-terminal density" and hype-driven design are the named anti-references).

## Content ideas, mapped to what BullPen can actually build

Ordered by how directly they reuse existing data/infrastructure — first few are close to trivial, later ones need new work.

**Already buildable from existing data, no new integration needed:**
1. **Earnings calendar** (shipped) — this week's confirmed S&P 500/Nasdaq 100/TSM reporters.
2. **Weekly market movers** — top gainers/losers, S&P 500/Nasdaq 100 scope (`getTopMovers`), styled like stockmarketchasers' ranked grid with real logos.
3. **Earnings results recap** (shipped 2026-08-22) — Saturday companion to #1: same allowlisted companies, but "did they beat or miss." `lib/instagram/content/earnings-results.ts` re-derives the week's reporters from Nasdaq's calendar API (same free source as #1), which turns out to carry `eps`/`surprise` alongside `epsForecast` once a date is in the past — no second discovery source needed the way the forward-looking post needs Claude web search. `getCompanyEarnings` (TwelveData, 20 credits/symbol) is a narrow fallback only for whatever Nasdaq's feed didn't confirm. Beat/missed uses the same `actual >= estimate` rule already shown in-app (`components/stock/EarningsCalendar.tsx`).
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
- Cite the data source in the caption ("Data from Twelve Data...", already in the fixed disclaimer) — the on-graphic version of this was tried and explicitly dropped, see "The approved template" above; the caption is the sourcing surface, not the slide.

## Posting cadence

Given the algorithm now rewards signal quality over frequency, and the research above shows 3-4x/week as the growth threshold: the current weekly earnings-calendar cadence is a reasonable floor, not a ceiling. As more content types from the list above come online, evening postings (6-11pm, Tue-Thu strongest) is the target window rather than the current Sunday-morning generation slot — worth revisiting `cron-instagram-earnings.yml`'s schedule once there's more than one content type in rotation and an actual posting calendar to plan around.

## Where this feeds into the codebase

- New content-type generators live in `lib/instagram/content/<name>.ts`, following `earnings-calendar.ts`'s shape: fetch real data first, Claude only writes grounded copy, return `null` (skip, don't post filler) when there's nothing real to say. Shared house-style pieces (disclaimer, hashtags, week-label formatting, logo resolution) live in `lib/instagram/content/shared.ts`, and the curated ticker allowlist lives in `lib/instagram/content/allowlist.ts` — both extracted once `earnings-results.ts` needed the exact same pieces `earnings-calendar.ts` already had, rather than forking copies that could drift.
- New slide templates live in `lib/instagram/render/slides.tsx`, reusing the shared color/font tokens — don't fork a new visual system per content type. `HookSlide` takes an optional `pillText` override for a content type whose "one scannable number" isn't a plain company count (e.g. earnings-results.ts's "9 OF 12 BEAT ESTIMATES").
- `instagram_posts.content_type` already supports arbitrary values — adding a new content type doesn't need a migration, just a new generator + a new cron trigger (`earnings_calendar` and `earnings_results` are the two live examples, each with its own Saturday/Sunday cron rather than one job trying multiple content types per run).
