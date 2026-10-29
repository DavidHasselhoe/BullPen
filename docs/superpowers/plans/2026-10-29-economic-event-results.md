# Economic event results: research and plan

_2026-10-29. Research and plan only. Nothing is built yet._

## The idea, and my take

Today BullPen tells people *when* the Fed decides, when CPI lands, when the jobs report comes out. It never tells them *what happened*. That's the gap. Someone who got the 8:30 heads-up has to leave for CNBC to find the number. Closing it is cheap, because almost all of this data is US government work in the public domain. The one exception is rate odds: the market-implied Fed probabilities everyone quotes come from CME data, and that data is not free to redistribute. Consensus forecasts have the same problem. The plan below ships what is free and honest first, and says plainly what we leave out.

Verdict: **worth building.** Phase 1 is roughly 3-4 focused days and costs no TwelveData credits.

---

## 1. What exists today

| Piece | What it does |
|---|---|
| `supabase/migrations/152_economic_events.sql` | Table `economic_events`: `id` (`<kind>:<YYYY-MM-DD>`), `kind` (jobs, cpi, ppi, jolts, claims, fomc, gdp, pce), `date` (ET), `release_at`, `detail` (BEA's edition text such as "Advance Estimate, 3rd Quarter 2026"), `has_projections` (FOMC with SEP), `source`. Public read RLS. **Schedule only. No actual, previous or consensus values anywhere.** |
| `lib/market-data/economic-kinds.ts` | Static meta per kind: English name, source URL, watch URL (Fed press conference), free lesson (`macro-basics/the-big-four-macro-forces`), Pro deeper lesson (`macro-mechanics/discount-rate-growth-vs-value`). |
| `lib/market-data/economic-calendar.ts` | Builds the schedule: BLS `.ics` (jobs, CPI, PPI, JOLTS), BEA `.ics` (GDP, PCE), hand-seeded FOMC dates through 2027, a Thursday rule for claims. `syncEconomicCalendar()` upserts 30 days back to a year ahead and prunes future rows a source dropped. Past rows are never deleted. |
| `/api/cron/sync-economic-calendar` | Vercel, `15 5 * * 1`. Runs the sync above. |
| `/api/cron/check-economic-events` | Vercel, `0 8 * * 1-5`. Calls `notifyEconomicEventsToday()` (`lib/notifications/notification-creators.ts:891`): one `market` notification per opted-in user (`settings.notifications.economic_events`, off by default), filtered by `calendar_prefs.economicKinds`, `entity_id = economic:<date>`. |
| `/api/calendar/economic` | Reads the table for a date range (max 62 days). |
| `components/tools/calendar/EconomicEvents.tsx` | Calendar day panel: time, source link, watch link, lesson links. |
| `components/dashboard/ComingUp.tsx` | Home card. Shows fomc, cpi, jobs, pce and gdp rows, linking to `/tools/calendar`. |
| `lib/email/alert-email.ts:209` | Morning email turns `economic:` notifications into an "On the calendar" section. Line 700 drops `economic:` rows that aren't for today, so a new result notification needs its **own prefix**. |

---

## 2. Data sources: go or no-go

All the agencies below are US federal works, which are public domain in the US. Their terms ask for credit, no implied endorsement and no logos. None of them prohibits commercial use.

| Source | Use for | Verdict | Terms and attribution |
|---|---|---|---|
| **FRED API** (St. Louis Fed) | One API for every series we need: `CPIAUCSL`, `CPIAUCNS`, `CPILFESL`, `PAYEMS`, `UNRATE`, `PCEPI`, `PCEPILFE`, `A191RL1Q225SBEA` (real GDP, annualized q/q), `ICSA`, `IC4WSA`, `DFEDTARU`/`DFEDTARL` (target range), `FEDTARMD` (SEP median). | **GO, recommended primary.** Every series listed comes from BLS, BEA, DOL or the Board, so none is a copyrighted third-party series. Before adding any other series, check its notes for the word "Copyright"; those need the owner's permission. | [FRED API Terms of Use](https://fred.stlouisfed.org/docs/api/terms_of_use.html). Required: show *"This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis."* prominently, link users to the terms, and mention them in our own Terms. Not allowed: "FRED" in a hostname, St. Louis Fed logos, or replicating FRED's core experience (a small results page doesn't). Needs a free key (`FRED_API_KEY`). |
| **BLS API v2** | CPI and jobs straight from the source, if FRED turns out slow on release mornings. | **GO, fallback.** | [BLS API terms](https://www.bls.gov/developers/termsOfService.htm). Give the access date and state *"BLS.gov cannot vouch for the data or analyses derived from these data after the data have been retrieved from BLS.gov."* No BLS logo, don't misrepresent. The registered v2 key allows ~500 queries a day and 50 series per query; recheck the [FAQ](https://www.bls.gov/developers/api_faqs.htm). BLS 403s requests without a browser user agent, as the calendar sync already found. |
| **BEA API** | GDP and PCE from the source. | **GO, fallback.** | Public domain, free key. The [API guide](https://apps.bea.gov/api/_pdf/bea_web_service_api_user_guide.pdf) limits use to about 100 requests and 100 MB a minute, with a lockout when exceeded. Credit "U.S. Bureau of Economic Analysis". |
| **Federal Reserve Board** (statements, H.15, SEP) | FOMC verdict, fast: the [monetary policy RSS feed](https://www.federalreserve.gov/feeds/press_monetary.xml) (checked live today, it lists "Federal Reserve issues FOMC statement") links the statement, and its text says "decided to maintain / raise / lower the target range ... to X to Y percent". SEP dot-plot median. | **GO.** | [Board disclaimer](https://www.federalreserve.gov/disclaimer.htm): public domain, "credit the Board as the source". Seals and logos are protected. No framing their site. |
| **DOL ETA** (weekly claims) | Claims straight from the source: `https://oui.doleta.gov/unemploy/csv/ar539.csv` (returns 200), plus the Thursday `data.pdf`. | **GO, fallback.** FRED `ICSA` is the same number. | US government work. Credit "U.S. Department of Labor". |
| **NY Fed** (EFFR, SOFR) | The rate the Fed actually hits inside its range. Nice to have, not phase 1. | **GO** with notices. | [NY Fed Terms of Use](https://www.newyorkfed.org/privacy/termsofuse) allow use "for your personal or business purposes". For reference rates, add a notice that the data "is subject to the Terms of Use posted at newyorkfed.org" and that the NY Fed does not endorse any republication. SOFR also needs a DTCC Solutions credit. Say we are not affiliated with the NY Fed. |
| **Treasury** (yield curve) | 2-year yield as a market-expectations line. Later, if at all. | **GO.** | Public domain. |
| **TwelveData** | Nothing here. | **NO-GO.** Our client uses no economic endpoints. One `/symbol_search?symbol=ZQ` (1 credit, run 10-29) returned only unrelated ETFs and stocks, so there is no fed funds futures listing. (The TwelveData MCP failed to connect this session, so its docs weren't searched beyond that.) | |
| **CME FedWatch / CME futures prices** | Market-implied rate odds. | **NO-GO** without a paid licence. | [CME Data Terms of Use](https://www.cmegroup.com/trading/market-data-explanation-disclaimer.html): website data is for personal, non-commercial use. No redistribution, no derivative works, no caching or scraping. Delayed settlements on cmegroup.com fall under the same terms. Commercial EOD data needs a licence through CME or a distributor, and CME [recently reclassified EOD fees](https://www.waterstechnology.com/data-management/7952957/cme-rankles-market-data-users-with-licensing-changes). |
| **Atlanta Fed Market Probability Tracker** | Odds from SOFR options. | **NO-GO to republish, OK to link.** | Built from CME data "used with permission". The page footer says "All Rights Reserved" ([what to know](https://www.atlantafed.org/research-and-data/data/market-probability-tracker/what-to-know)). Link out only. |
| **Kalshi / Polymarket** (Fed decision markets) | Real traded probabilities. | **UNVERIFIED. Don't ship without written permission.** Kalshi's data terms PDF returned 429 and nothing authoritative turned up. They are also betting markets, which is an odd look for a beginner investing app. | Ask Kalshi in writing if we ever want it. |
| **Consensus forecasts** (Bloomberg, Reuters, Trading Economics, FMP, Eulerpool...) | "Expected" value. | **NO-GO for phase 1.** No free source licenses consensus for commercial display. Every provider sells it, and most charge extra for display rights. | If wanted later, it is a paid-vendor decision with its own display licence. Never scrape it. |

### When results are available

| Kind | Release (ET) | Fastest free source | Note |
|---|---|---|---|
| FOMC | 2:00 PM | Fed RSS and statement page, within minutes | `DFEDTARU`/`L` on FRED update the same or next day. Use the statement for the verdict and FRED for history. |
| CPI, jobs | 8:30 AM | BLS API, at release | FRED usually follows within the hour, but nobody guarantees that. **Measure it on the next CPI (Nov) and jobs release before choosing.** |
| PCE, GDP | 8:30 AM (some BEA releases 10:00) | BEA API, at release | Same check for FRED lag. |
| Claims | 8:30 AM Thu | DOL `ar539.csv` and `data.pdf` | FRED `ICSA` the same morning. |

Recommendation: **FRED for every number** (one key, one parser, one attribution line) plus **the Fed RSS for the FOMC verdict**. Re-poll until a new observation appears. Fall back to BLS or BEA only if the measured FRED lag is too slow for the notification.

### Calculations (must match what the agencies publish)

- **CPI headline y/y:** non-seasonally-adjusted `CPIAUCNS`, `idx_t / idx_{t-12} - 1`, rounded to 1 decimal. That's what BLS headlines. **m/m:** seasonally adjusted `CPIAUCSL`. **Core:** `CPILFESL`, the same way.
- **Jobs:** payrolls change = `PAYEMS_t - PAYEMS_{t-1}` (thousands, SA). Unemployment rate = `UNRATE`. Previous month's payrolls change is shown **as revised in this release**, which matches what BLS prints.
- **PCE:** `PCEPI` and `PCEPILFE`, y/y and m/m, SA.
- **GDP:** `A191RL1Q225SBEA` is already annualized real growth. Show the BEA edition from `economic_events.detail` (Advance / Second / Third).
- **Claims:** `ICSA` level and the 4-week average `IC4WSA`.
- **FOMC:** new target range (lower to upper), change in bps vs the previous range, and the direction: held, raised or lowered.
- Ship one check script that recomputes the last 3 published CPI, jobs and PCE headlines from FRED and asserts they equal the BLS/BEA press-release figures. Index levels have 3 decimals, so rounding can drift by 0.1, and the script catches that. This is the ponytail "one runnable check".

---

## 3. Fed rate odds

### The standard method (what FedWatch does)

ZQ (30-day fed funds futures) settles at `100 - average daily EFFR` over every calendar day of the contract month. So `implied_avg = 100 - price`.

For a meeting on day `m` of a month with `D` days, `N = m` days carry the pre-meeting rate (the decision takes effect the next day):

```
implied_avg = (N/D) * EFFR_pre + ((D - N)/D) * EFFR_post
EFFR_post   = (implied_avg - (N/D) * EFFR_pre) / ((D - N)/D)
```

`EFFR_pre` comes from the previous month's contract, or from a month with no meeting, whose price *is* the expected rate. Late-month meetings make `D - N` small, so CME then reads `EFFR_post` from the next month's contract instead.

Then `Δ = EFFR_post - EFFR_pre`, split into 25 bp steps. For example `Δ = -0.18`: 72% one cut (−25) and 28% hold, because `0.18 / 0.25 = 0.72`. Later meetings chain this into a probability tree. Source: [CME FedWatch methodology](https://www.cmegroup.com/articles/2023/understanding-the-cme-group-fedwatch-tool-methodology.html). The exact formula above comes from a third-party replica and matches the textbook method. CME's own write-up adds conditional and aggregated variants.

### Can we get the inputs legally and free?

**No.** ZQ prices are CME market data: personal, non-commercial use only, and computed probabilities are a derivative work, which is also prohibited. TwelveData doesn't list ZQ. The Atlanta Fed's numbers are CME-derived and all rights reserved. OIS and SOFR swap quotes are dealer data with no free licensed feed either. The NY Fed publishes realized SOFR and EFFR, not forward curves.

### Honest options

1. **Show no odds (phase 1).** Instead, show **"What Fed officials themselves projected"**: the SEP dot-plot median (`FEDTARMD` on FRED, or the Board's SEP table), quarterly, with its date. Label it as the officials' own projection, **never** as a probability or "what markets expect". Add plain links out: "See market odds on CME FedWatch" and "Atlanta Fed Market Probability Tracker".
2. **Licensed odds (later, paid).** License CME EOD ZQ settlements through a distributor, compute the probabilities with the formula above, and credit CME. Get a quote first; this is a pricing decision for the user, not a build task.
3. **2-year Treasury yield** as a rough "markets lean" line is a **proxy**, not a probability. Under never-ship-synthetic-numbers it may only appear labelled as what it is ("2-year Treasury yield"), never converted into odds.

---

## 4. The plan

### 4.1 Data model (one migration, next free number at build time; 183 is the highest committed today)

```sql
-- Raw series observations, for charts and for computing results.
create table economic_observations (
  series_id text not null,      -- FRED id, e.g. 'CPIAUCNS'
  period date not null,         -- observation date (month/quarter start, week ending, day)
  value numeric not null,
  fetched_at timestamptz not null default now(),
  primary key (series_id, period)
);
-- Frozen release result on the event itself: what was published that day.
alter table economic_events
  add column period_label text null,      -- 'September 2026', 'Q3 2026 (Advance)', 'Week ending Oct 25'
  add column results jsonb null,          -- [{ key:'cpi_yoy', actual:2.9, previous:2.7, unit:'pct' }, ...]
  add column results_at timestamptz null,
  add column verdict text null;           -- FOMC: 'hold' | 'raise' | 'lower'; null otherwise
```

Public read RLS on `economic_observations`, the same as `economic_events`; writes go through the service role. `results` is frozen at release time, so the "previous" a user saw that morning stays put when FRED revises it later. Charts read `economic_observations`, which is revised. No separate results table: one release maps to one event row, and the metrics per kind are fixed and small.

Watch for: past event rows only reach back 30 days. A backfill script inserts historical event rows (`source` 'fed', 'bls', 'bea' or 'rule' as today) so decision history has rows. The sync's prune only touches `date >= today`, so they survive.

### 4.2 Ingestion

- `lib/market-data/economic-results.ts`: a per-kind map `{ series: string[], compute(obs) => results }`, a FRED fetch (`series/observations`, `sort_order=desc`, `limit=14`), and the Fed RSS statement parser for FOMC.
- **Route** `/api/cron/check-economic-results`, wrapped in `withCronReport`. It picks today's events with `release_at <= now()` and `results_at is null`, fetches each kind's series, and writes results once FRED shows an observation for the expected period. Otherwise it exits and tries next run. No events pending means one DB read and no provider calls.
- **Scheduler: QStash.** It runs several times a day and is time-sensitive, which is the documented QStash case in `docs/agent/scheduled-work.md`. Schedule `*/15 12-20 * * 1-5` UTC covers 8:30 and 10:00 ET plus the 2:00 PM FOMC statement under both EDT and EST. Same auth as `check-user-alerts` (`Upstash-Forward-Authorization`, `Upstash-Method: GET`).
- Daily backstop: nothing extra. A result missed today stays `results_at is null`; widen the pick to "the last 7 days" so tomorrow's runs catch it.
- **Observations history:** append to the weekly `sync-economic-calendar` run (fetch the last ~24 observations per series, upsert), plus a one-off `scripts/backfill-economic-observations.ts` (~10 years, about 12 FRED calls).
- Update `docs/agent/scheduled-work.md` (QStash table), `docs/agent/environment.md` (`FRED_API_KEY`), the PostHog "overdue runs" insight row, then `npm run test-cron-coverage`.
- Cost: FRED is free. Worst case ~12 series × 4 polls on a release day.

### 4.3 The page

**Route:** `/tools/economy` (hub) and `/tools/economy/[kind]` (fed-rate, cpi, jobs, pce, gdp, claims). Slugs are public, so `fomc` becomes `fed-rate`. Server-render the first screen like the stock subpages: crawlable SEO pages for "fed rate decision history" and "CPI history". TanStack Query for client refresh, with the kind in the `queryKey` and `staleTime` of 5 min (results change at most a few times a day).

- **Hub:** one card per kind: latest actual, previous, change arrow, release date, next scheduled release (from `economic_events`). Emerald/red only where the direction is unambiguous for the reader. A rate cut isn't "good", so FOMC and claims use neutral colour. Under DESIGN.md, Signal colour means gain or loss, and an inflation print isn't either.
- **Fed rate page:** current target range; the last decision (held, raised or lowered, by how much, date); a step chart of the target range over ~10 years (`DFEDTARU`/`L`); a decision history table (date, decision, new range, change); a "Fed officials' projection" block from the SEP median (dated, labelled as above); the next meeting date and time via `fmtReleaseTimeForViewer`; links out to FedWatch and the Atlanta Fed for market odds; the press-conference watch link.
- **CPI / PCE:** headline and core, y/y and m/m: actual vs previous; a 5-year line chart of y/y with the Fed's 2% target as a reference line (a fact, not a forecast); a release history table.
- **Jobs:** payrolls change bar chart (24 months), unemployment rate line, actual vs previous.
- **GDP:** quarterly growth bars and the estimate edition.
- **Claims:** weekly level and 4-week average line.
- Every page: a source line per number ("Source: U.S. Bureau of Labor Statistics via FRED, retrieved <date>"), plus the FRED notice in the page footer and on `/legal/terms`. Lesson links reuse `ECONOMIC_KINDS[kind].lessonHref` / `deeperLessonHref`. Dates are date-only and never go through the clock. Release times use `fmtReleaseTimeForViewer`.
- No consensus column. Leave it out entirely rather than show an empty "Expected" cell.
- All copy is templated. If a later phase adds a model-written "what this means" line, wrap it in `ClampedText` and run `npm run test-no-truncated-text`.

### 4.4 Verdict notifications

- In the ingestion route, after results are written: `notifyEconomicResults(event)` in `notification-creators.ts`. It reuses the opted-in user query from `notifyEconomicEventsToday` (pull it out into a small shared helper, since it would otherwise be copied) and filters by `calendar_prefs.economicKinds`.
- `entity_id = economic-result:<event.id>`. The new prefix keeps it clear of the `economic:` filter at `alert-email.ts:700`, and the id makes it idempotent (check existing ids before insert, as today).
- Templated copy through `msg()` params, no dashes. For example:
  - "The Fed held rates at 4.25% to 4.50%"
  - "The Fed lowered rates by 0.25 points to 4.00% to 4.25%"
  - "CPI inflation was 2.9% over the past year, up from 2.7%"
  - "The economy added 142,000 jobs in September. Unemployment was 4.1%"
- **Email:** add a branch in `alert-email.ts` for `economic-result:` with section `economic`, cue "See the full history", href `/tools/economy/<slug>`. The morning email runs at 8:30 UTC, so a result reaches email the *next* morning. That's fine. In-app notifications are the fast path. Realtime push would be a separate project (no push today).
- Settings: reuse the existing `economic_events` toggle and relabel it "Economic releases and results". No new setting.

### 4.5 Links in

- `EconomicEvents.tsx` (calendar day panel): past events with `results` show the actual vs previous inline plus "See history" → `/tools/economy/<slug>`; future events link to the same page. Extend `/api/calendar/economic` to return `period_label`, `results` and `verdict`.
- `ComingUp.tsx`: no change in phase 1 (it's forward-looking). Phase 2: a "Just released" row for today's results.
- Academy: add a "See the latest numbers" link to the macro-basics Big Four lesson and the macro-mechanics rates lesson. Lesson content can live only in Supabase (see the Academy live-DB drift memory), so edit by migration and check the live row first.
- `/tools` index card, sitemap entries, and the Bull chat: a later `get_economic_results` tool in `lib/ai/tools.ts` so "what did CPI do?" gets a real number.

### 4.6 i18n

New keys in `tools.json` (page) and `notifications`, plus the server `msg()` keys, across en, de, es, fr, ja, no (and qa). Kind names already exist (`economicName_<kind>`). Run `i18n:translate`, then review the diff, since it rewrites unrelated keys. Numbers go through the user's locale (never `toLocaleString(undefined)`).

### 4.7 Free vs Pro

**Everything in phase 1 is free.** It's public data, it builds the "all-in-one" case, and it makes good SEO pages. Gating government numbers behind a paywall would look petty. Possible Pro additions later: an AI "what this means for your holdings" note per release (uses Claude, so it has a real cost), and licensed market odds if we ever pay for them.

### 4.8 Phases and rough effort

| Phase | Scope | Effort |
|---|---|---|
| **0. Measure** (before building notifications) | Get a free FRED key, add `FRED_API_KEY` to Vercel. On the next CPI (Nov) and claims (Thursday), log when FRED shows the new observation vs 8:30 ET. Decide FRED-only or BLS/BEA fallback. | 0.5 day, mostly waiting |
| **1. Results + page** | Migration, `economic-results.ts` + check script, the QStash ingestion route, backfill script, `/tools/economy` hub + 6 kind pages (charts, tables, SEP block, link-outs), calendar panel inline results, FRED attribution + Terms update, en copy, docs updates. | 3-4 days |
| **2. Verdict notifications** | `notifyEconomicResults`, email branch, settings relabel, translations. | 1 day |
| **3. Reach** | Coming up "Just released" row, Academy links, `/tools` card, sitemap, Bull tool, `/impeccable polish`. | 1-1.5 days |
| **Later, user decision** | Consensus (paid vendor with display rights), market odds (CME EOD licence via distributor), NY Fed EFFR line, 2y Treasury line, Pro AI explainer. | Quote first |

### Not doing

Scraping consensus or FedWatch; computing odds from any proxy; PPI and JOLTS pages (they're on the calendar, but the user asked about the big ones, and they're easy to add later through the same kind map).
