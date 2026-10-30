# Same-day earnings watcher: feasibility (2026-10-30)

Question: when a company reports, can BullPen show the new quarter the same day
straight from SEC EDGAR, instead of waiting days for TwelveData's statements?

**Short answer: yes, and the best route is not the press release.** For most
quarters the company's own 10-Q, with full machine-tagged (XBRL) statements,
reaches EDGAR within hours of the release. Reading it is free, needs no AI,
and is GAAP data filed under oath. The 8-K press release lands within minutes
but has no tagged financials, so its numbers need an AI parse and are only
worth it for the headline and the "results are in" moment. Q4 is the exception:
10-Ks lag a median of 5 days, so that season leans on the 8-K.

Nothing was built. No TwelveData credits or LLM calls were spent. All
measurements used free EDGAR endpoints (about 1,000 requests at ~6/s with a
User-Agent). Scripts and raw JSON: the session's shared notes folder,
`earnings-watcher-data/`.

## 1. What EDGAR has on report day, and when

Measured on every Nasdaq-100 company with an Item 2.02 8-K (Results of
Operations) filed 2026-10-01..10-30, using `acceptanceDateTime` from the
submissions JSON.

**The 8-K lands within minutes of the release.**

| Release | n | 8-K accepted (ET) |
|---|---|---|
| After the close | 30 | 4:00 to 4:13 PM for 25 of 30. Slowest: +23, +32, +41, +65, +98 min (BKR, XEL ...) |
| Before the open | 16 | 6:00 to 8:57 AM, clustered 6:50 to 7:10 |

So "the 8-K is on EDGAR" is a good proxy for "the release is public".

**The 10-Q often arrives the same day.** Hours from earnings 8-K to the
10-Q/10-K that covers the quarter:

| Season | Pairs | Median | Within 24h | Within 72h | Within 7d |
|---|---|---|---|---|---|
| Q3 2026 (Oct) | 37 | 4.1h | 27 (73%) | 34 | 35 |
| Q2 2026 (Jul-Aug) | 87 | 6.5h | 57 (66%) | 65 | 72 |
| Q4 2025 (Jan-Mar) | 88 | 33h | 38 (43%) | 48 | 57 |
| ...of which 10-Ks only | 65 | **120h** | 25 (38%) | | 36 |

Same-minute filers: MSFT (10-Q 3 minutes after the 8-K), TMUS, CSX, GEHC,
NXPI, MDLZ, ALNY, REGN. Same evening: GOOGL (8-K 4:01 PM, 10-Q 8:29 PM on Oct
28), AMZN (4:05 PM / 6:20 PM on Oct 29), META, TSLA, INTC, GILD. Next day:
NFLX, KLAC, LRCX, FTNT, CDNS. Still no 10-Q on Oct 30: ADP, DASH, MPWR, MSTR,
ODFL, ORLY, ROP, SNDK, TER, PEP (reported Oct 7), and SBUX (fiscal year end,
so a 10-K, weeks away).

Compare with TwelveData: GOOGL's and AMZN's 10-Qs were on EDGAR on the
evenings of Oct 28 and Oct 29, and TwelveData still showed the June quarter on
Oct 30 (sibling session's finding: all 241 large caps that reported Oct 20-30
still had June as the newest cached quarter).

**The XBRL APIs already carry the new quarter.** `companyfacts` for GOOGL,
AMZN, MSFT and INTC each return the Sep 2026 quarter's revenue, net income,
operating income, diluted EPS, total assets and operating cash flow, tagged
with the 10-Q's accession. AMZN Q3: revenue $201.944B, net income $20.685B,
diluted EPS $1.89. SEC states these APIs update in near real time as filings
are disseminated; not timed here (it would need a filing landing during the
test).

**False positives exist.** Item 2.02 is also used for non-earnings results:
TSLA (Oct 2, deliveries), REGN (Oct 6), FANG (Oct 8). The watcher must match a
calendar report date (+/- 1 day), not "any 2.02".

### Day one from the 8-K: what parses

Exhibit 99.1 is plain HTML, never XBRL. Test: for the 35 Q3 8-Ks whose 10-Q
already exists, parse the press release tables with no AI and compare against
the 10-Q's XBRL (ground truth).

| Field | Value present in a matching table row |
|---|---|
| Revenue | 31 of 34 |
| Net income | 29 of 33 |
| Diluted EPS (GAAP) | 26 of 32 |

But a naive rule ("first matching row, first quarter column") picked the right
number only 66 of 91 times (73%). The failures are structural, not edge noise:

- **Column order:** FAST's first revenue table is nine months, not the quarter.
- **Which net income:** HON and MDLZ show net income before and after
  noncontrolling interests; the 10-Q's `NetIncomeLoss` is the attributable one.
- **Which revenue:** PCAR's first "revenue" row is Truck and Parts, not the
  total including Financial Services.
- **GAAP vs adjusted:** HON's "Diluted" EPS row in the release is adjusted
  ($2.40 vs GAAP $2.08). Same trap as the earnings card's AMD bug
  (project_earnings_unconfirmed_fix).
- **No tables at all:** TSLA's exhibit is its shareholder deck; LIN's is a
  2-page summary.

So day one from the 8-K reliably means an **AI read** of the release, which is
what the Instagram deep dive already does (`extractEarningsActuals`, Sonnet
5.5). Sizes: 15k to 58k characters of text per release, roughly 4k to 15k
input tokens.

| | Day one (8-K, AI) | Same day to a week (10-Q XBRL, no AI) | TwelveData |
|---|---|---|---|
| Revenue, GAAP EPS, net income | yes | yes | days later |
| Adjusted EPS, guidance, segment headline | yes (release only) | no (not tagged) | no |
| Operating income, gross profit, R&D, SG&A, tax | partly | yes (by tag, may be absent) | yes |
| Balance sheet | rarely in release | yes (instant facts) | yes |
| Cash flow, quarter | YTD only in most releases | YTD, quarter = YTD minus prior YTD | yes |
| Revenue segments (Sankey) | no | yes, `lib/segments` already does this | no |
| EBITDA, derived ratios | no | no | yes |

## 2. The existing watcher

`lib/edgar/edgar-watch.ts` (generic, reusable as is):
`fetchSubmissions`, `findEarnings8K(cik, notBefore)`, `fetchFilingIndex`
(parses `-index.htm`, because `index.json` lagged 2+ hours on NVDA's 8-K),
`pickPressReleaseFile`, `fetchExhibitText`, `fetchFiscalTagsByAccession`.

`scripts/watch-earnings.ts` (Instagram-specific): one ticker per process, run
by hand with a CIK, polls every 15s for up to 4h, waits for 4 PM on AMC, then
Claude extraction, then publishes the carousel through prod.

`lib/instagram/content/earnings-deep-dive-extract.ts`: the AI extractor. Its
schema is carousel-shaped (outlook, capex, key metric) but already extracts
GAAP and non-GAAP EPS separately, revenue, segment revenue and margins, and
fails loudly on a bad response. Reusable with a smaller schema.

Also reusable: `lib/segments/cik.ts` (ticker to CIK), `lib/segments/edgar-facts.ts`
(instance-document parser with the 5 XBRL traps solved),
`lib/edgar/revenue-history.ts` (companyconcept quarters with Q4 = year minus
three quarters), `lib/finance/fiscal-calendar.ts` (fiscal quarter names from
SEC, which the TD fields get wrong).

## 3. Where the data would go

Every consumer reads the same cache keys `financials:SYM:{income,balance,cashflow}:quarterly`:
stock page Financials and Sankey (`/api/stock/[ticker]/financials`), Deep Dive
(`gather-data.ts`), Ask Bull (`tools.ts`), Compare, Health Score
(`get-health-score.ts`) and screener stats. The earnings card is separate
(TD `/earnings` plus the Nasdaq-merged calendar).

**Recommendation: SEC rows in their own table, overlaid into the existing keys.**

- New table `sec_quarterly_statements` (ticker, period_end, fiscal label,
  statement type, row JSON, accession, form, accepted_at). Durable: no TTL.
- One helper all writers of `financials:*` call. It overlays SEC rows onto TD
  rows: a period TD lacks gets the SEC row; a TD stub row (AMZN Q2: EPS only,
  revenue null) gets its null fields filled; any field TD has wins. Each row
  carries `source: 'td' | 'sec_10q'`.
- Why not only the cache: the cache expires and is rewritten by at least six
  writers (prefetch cron, health score, stock route, Deep Dive, Bull, compare).
  A plain write would be overwritten by the next TwelveData refetch that still
  lacks the quarter. Why not only a table: then every reader changes.
- **The 8-K numbers do not go into the statement rows.** They are partial and
  carry the GAAP/adjusted trap. They live on the earnings record ("Just
  reported" on the earnings card, Bull's context, the notification) labelled
  as from the press release, and are dropped when the 10-Q lands.
- GAAP vs adjusted: the earnings card's beat/miss stays on the Nasdaq or TD
  actual vs consensus (both usually adjusted). SEC's GAAP EPS fills
  `eps_diluted` in the statements only, never `eps_actual` on the card.
- Quarter names from `fiscal-calendar.ts` (SEC fy/fp), never from TD fields.
- Never ship synthetic numbers: a field the 10-Q doesn't tag stays null.
  Derivations are limited to identities SEC data supports exactly (quarter
  cash flow = YTD minus prior YTD of the same filer and tag; Q4 = year minus
  three quarters, as `revenue-history.ts` already does). Gross profit only
  from `GrossProfit` or revenue minus a tagged cost of revenue. The UI says
  "From the 10-Q filed Oct 28" where a source is shown.

## 4. Scheduling

Polling has two jobs: catch the 8-K (minutes matter) and catch the 10-Q (hours
are fine).

- **QStash, every 5 minutes, weekdays 10:00 to 01:00 UTC** (covers the BMO and
  AMC windows in both EDT and EST, like `check-economic-results`). Each tick:
  read today's and the last 10 days' reporters from the calendar cache (no
  credits), keep the ones still missing an 8-K or 10-Q, fetch each one's
  submissions JSON (23KB gzipped for GOOGL), act on what's new.
- Load: Nasdaq-100 peaked at 13 reporters on Oct 28 (12 on Oct 29); the S&P
  500 is roughly five times that (estimate, not measured). Even 60 requests per tick at ~6/s is 10s of mostly network wait. Active CPU is
  billed for CPU, not waiting: estimate well under a minute a day. If the
  S&P 500 makes ticks slow, swap per-company polling for EDGAR's current-filings
  Atom feed (one 6KB request lists the latest 100 8-Ks).
- Vercel cron is out (once a day). GitHub Actions is out (15-20 min drift,
  dropped runs).
- Timeout: `maxDuration` 60 and a time budget per tick; whatever is left rolls
  to the next tick.

## 5. Notifications

Today: `check-earnings-upcoming` (08:00 UTC) posts an in-app "reports today"
notification for held and watched stocks; `send-alert-email` (08:30 UTC)
emails the last 26h of notifications to opted-in, verified users. Nothing
fires when results come out. The activation analysis (10-23) found in-app
notifications go unread (0 of 14 new users ever read one).

Plug-in: when the 8-K lands, create an `earnings` notification with
`kind: 'earnings_released'` per holder/watcher (same recipient query as
`check-earnings-upcoming`, dedupe per symbol and period). It needs no parsing:
"Alphabet released its Q3 results" with a link. Add the headline numbers once
the AI read (or the 10-Q) has them. It rides the next morning email
automatically. Real-time delivery needs web push (scoped in
`docs/PWA_WEB_PUSH_SCOPE.md`, not started); an instant email per report is
possible but risks fatigue in peak weeks.

## 6. Interaction with the post-earnings fundamentals refresh

The sibling session's `checkRecentReporters()` (uncommitted) re-checks
TwelveData `last_change` for reporters whose newest cached quarter is more than
95 days before the report. Two notions must stay apart:

- **"Quarter visible"**: newest period end across TD and SEC rows. Drives the
  UI ("statements pending" note, Deep Dive "as of", Bull).
- **"TwelveData caught up"**: newest TD period end only. Drives the 5-credit
  re-check, which must keep running after SEC fills the quarter, so TD's
  fuller rows (EBITDA, every line item) eventually replace the overlay.

So `reportersBehind` should keep reading TD-only dates, and the overlay helper
should be the one place that knows about SEC rows. Both read the report date
from the same calendar cache.

## Phase 1 as built (2026-10-30)

- `lib/edgar/sec-statements.ts`: companyfacts to `IncomeStatementPeriod` /
  `BalanceSheetPeriod` / `CashFlowPeriod` rows (`source: 'sec'`), the merge,
  and the store. No new table after all: the rows live in `market_data_cache`
  under `sec:statements:SYM` (120-day TTL; SEC can always be re-read for free).
- The overlay runs inside `getIncomeStatement` / `getBalanceSheet` /
  `getCashFlow` (quarterly only), so every writer of `financials:*` gets it
  with no consumer change. Storing a new quarter also patches the cached rows
  in place without touching `fetched_at`, so TwelveData's `last_change` check
  still sees its own update when it lands.
- `/api/cron/check-sec-filings` (QStash, every 15 min): Nasdaq-100 reporters of
  the last 10 days whose quarter is missing. `?dryRun=1` stores nothing.
- `checkRecentReporters` reads TwelveData-only dates.
- Checked field by field against TwelveData's cached quarters
  (`npm run test-sec-statements -- --live`). Agreement: revenue 346/353, net
  income 345/349 (TwelveData includes minority interests: `ProfitLoss`),
  diluted EPS 251/260, total assets 360/361, equity 349/361, operating cash
  flow 354/357. Operating income 216/337 and long-term debt 105/270 are
  TwelveData's own computations; the filed figure is used. Goodwill plus
  intangibles and investing/financing totals disagree too much and stay empty.
- A SEC row is added only when it has every figure the calculations use that
  TwelveData's newest row has (revenue, gross profit, operating income, net
  income, diluted EPS, interest, tax; assets, current assets and liabilities,
  cash, liabilities, long-term debt, equity; operating and free cash flow).
  Simulated on TwelveData's newest Nasdaq-100 quarter: income 50/93, balance
  63/93, cash flow 82/93. Main blockers: no quarterly EPS in a 10-K (fiscal
  year ends), no reported gross profit (services, railroads, telecom), no
  long-term debt tag. Those quarters wait for TwelveData, as before.
- Dry run 2026-10-30: GOOGL, AMZN, MSFT, INTC, META, TSLA got Q3 on all
  statements (TSLA balance blocked); AMZN also gets the Q2 balance sheet and
  cash flow TwelveData never had.

## 7. Proposed phases

1. **10-Q fast path, Nasdaq-100.** QStash tick finds the 10-Q for recent
   reporters, reads the quarter from XBRL (companyfacts or the instance
   document), stores it, overlays it. Payoff: GOOGL and AMZN would have had
   Q3 on the evening they reported. Check: compare SEC rows with TD rows for
   every quarter where both exist, field by field.
2. **"Results are in" notification** from 8-K detection alone (no parsing).
3. **Day-one headline** from the 8-K via the AI read: revenue, GAAP and
   adjusted EPS, net income, on the earnings card and in Bull until the 10-Q
   lands. Most valuable in Q4 season (10-K median 5 days). Guard: only show
   a figure when the AI value also appears in one of the release's own table
   rows; audit each against the 10-Q when it arrives.
4. **S&P 500**, after phase 1 has run a full season clean.

## 8. Cost

- SEC: free. Respect 10 req/s and the User-Agent rule.
- TwelveData: none added. The existing re-check spends 5 credits per lagging
  reporter.
- AI (phase 3 only): Sonnet 5.5 at $2 / $10 per million tokens, ~9k input plus
  ~2k output (thinking included) per release, about $0.04 each. Nasdaq-100
  about $4 a quarter, S&P 500 about $20. Haiku 5.5 would be ~$0.002 each but
  is unproven on this extraction. Not measured: needs a paid run, ask first.
- Vercel: one short function every 5 minutes, mostly network wait.

## 9. Open risks

- **Q4 season**: 10-Ks lag (median 5 days), so phase 1 helps least in Jan-Mar.
- **Tag variety**: revenue alone has four common tags; `revenue-history.ts`
  tries each, never mixes them. Banks, insurers and REITs use different
  income statements; expect more nulls there.
- **Overlay correctness**: a wrong SEC row would sit beside TD rows in every
  consumer. The field-by-field comparison against TD on past quarters is the
  gate before turning it on.
- **Restatements and amendments** (10-Q/A): take the latest accession per
  period.
- **Foreign filers** (ASML, ARM, PDD, SHOP, CCEP...) file 6-K/20-F/40-F, not
  8-K/10-Q. Out of scope; TwelveData only.
- **Dual classes**: GOOG and GOOGL share a CIK; store once, serve both.
- **SEC fair access**: a burst over 10 req/s gets the IP blocked for minutes.
  One shared limiter for every EDGAR caller (segments, 13F, this).
