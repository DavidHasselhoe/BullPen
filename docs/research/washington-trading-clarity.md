# Washington Trading: making it stupidly easy to read

Proposal for David, 2026-11-24. **Status: Direction A shipped to preview the same day (33dd5d28), with the notification rewrite, the honest scorecard state and earlier filings as collapsed lines. The 500-row cutoff is fixed (fe0ba076) and Trump's 251 missing trades are filled (ca815eaa); see `docs/superpowers/plans/2026-11-24-congress-trade-gap-fix.md`. Not built: holdings tags (New position / Sold out) and per-visit "new since" state.**

The reader's stocks in the examples below (Apple, TJX, JPMorgan) are illustrative picks from the same filing, not anyone's real holdings.

Scope: the politician page (`app/discover/politicians/[slug]` → `components/congress/CongressMemberDetailClient.tsx`) and the two notifications that send people there (`notifyPoliticianTrades` and `notifyHoldersOfPoliticianTrades` in `lib/notifications/notification-creators.ts`, fired by `app/api/cron/refresh-congress-trades`).

All numbers below were checked against production (read-only SQL, project `kgqpzuvhslqazurfrqya`) and the running dev server on 2026-11-24.

---

## 1. What actually happened today (the facts the page should have told you)

Trump's filing landed at 14:01 UTC. What the data says:

| Fact | Value |
|---|---|
| Trades received today | **500** rows, **363** with a ticker, across **248** stocks |
| When the trades were made | Sep 2 to Sep 24, 2026 (about 2 months before we received them) |
| Size | **272 of 363** (75%) are the smallest bracket, $1K to $15K. Only 14 are $100K or more |
| Biggest | Sold Comcast, McDonald's and Home Depot, **$1M to $5M each** (Sep 23). Sold Constellation Brands and Nike, $500K to $1M |
| Same stock, both ways | 45 stocks were both bought and sold in this one filing; 80 stocks have 2 to 5 rows |
| Repeat vs first time | 94 of the 248 stocks also appear in his previous filing (received Sep 25, trades Jul 24 to 31) |
| The reporting reader's stocks | 13 of their held or watched stocks were in the filing (which ones is left out of this doc) |
| Filing date | **Missing for all 1,000 of Trump's rows** (`disclosure_date` null; House and Senate rows have it 100%) |

The one-sentence version a beginner needed: *"Trump reported 363 stock trades from September. Most were small. The big ones were sales of Comcast, McDonald's and Home Depot. He bought more of two stocks you own."*

What the page showed instead: 100 rows sorted by date, all "Sep 24, 2026", mostly $1K to $15K.

## 2. Problems, in order of how much they hurt

### Bugs hiding inside the design problem (fix regardless of direction)

1. **The page cannot show today's filing.** `loadCongressMember` reads the newest **100** trades (`TRADE_LIMIT = 100` in `lib/congress/member-data.ts`; its comment says we only *store* 100 per member, which is no longer true: Trump has 1,000 stored). Today alone brought 363. So 263 of today's trades are invisible, including:
   - the Home Depot and McDonald's $1M to $5M sales (not on the page at all),
   - Comcast $1M to $5M, Nike and Constellation (rows 98 to 100, behind four "Show more" clicks),
   - a Microsoft buy of $100K to $250K (not on the page at all).
   The chips say "All 100 / Buys 45 / Sells 55", which reads as his total. It is a cutoff.
2. **We probably did not get the whole filing.** The refresh re-fetches a burst at `BURST_TRADE_LIMIT = 500`, and both of Trump's batches are exactly 500 rows (Sep 25 and Nov 24). Worth one check against the vendor before anything is designed around "the filing". (Checked later the same day: rows 500 to 750, trades dated Sep 1 and 2, had never been stored. There was no August gap: Trump has no trades between Jul 31 and Sep 1.)
3. **The scorecard's empty state is false.** It says "Not enough buys with prices on the disclosure date to score yet". Trump has 400+ buys; the score is impossible because his rows have no disclosure date at all (executive-branch OGE filings, `source = oge.gov`). It will never fill in, and "yet" promises it will.
4. **The follow notification leads with arbitrary rows.** Today's said "Sold HD ($15K - $50K), Sold COST ($15K - $50K), Sold MCD ($1K - $15K) and 360 more". The HD and MCD sales that mattered were $1M to $5M. It takes `trades.slice(0, 3)` in vendor order.
5. **Two notifications for one event.** You got both "Donald J. Trump disclosed 363 new trades" and "Politicians traded 13 of your stocks" at the same minute, saying overlapping things in different shapes.

### The design problem David named

- **Nothing says what is new.** Old and new trades sit in one list with the same weight. The only date shown is the trade date, so a beginner can't tell that "Sep 24" arrived today.
- **No relevance.** Your 13 stocks are mixed into 363 rows.
- **No summary of change.** McDonald's appears as four separate rows (bought twice and sold twice, Sep 10 to Sep 24). The reader has to assemble the story.
- **Size is unreadable.** "$1K - $15K" 272 times in a row teaches nothing. There's no sense of which trades are big for *this* person.
- **The notification repeats the name per ticker** ("<ticker>: Donald J. Trump sold and Donald J. Trump bought") and is cut off before it says anything about size or dates.

## 3. Building blocks (data we already have vs need)

| Block | Data | Status |
|---|---|---|
| "New" marker / "received" date | `congress_trades.created_at` (when we ingested it) | **Exists**, not selected by `loadCongressMember` today. One-column change |
| Group by filing | `created_at` date per member (Trump has exactly 2 batches) | **Exists** |
| "New since your last visit" | Global seen-timestamp pattern already in `overlap-groups.ts` (`overlapVisit`, migration 170) | Pattern exists; per-politician version needs a `last_seen_at` on `user_politician_follows` (followers) or localStorage (everyone). Day-level "received today/this week" needs nothing |
| Your stocks first | `useHoldings()` (open-only) + watchlist hook, client-side | **Exists** |
| Net per stock in a filing | Group rows by symbol: bought N, sold N, date span, biggest bracket | **Exists**, pure function (same shape as `groupOverlap`) |
| First time vs repeat | Is the symbol in an earlier batch for this member | **Exists** but only as deep as our history (Trump: since Jul 24). Copy must say "first time we've seen" not "first time ever" |
| Still holds / sold out | `congress_holdings` (open positions only; 2,757 rows) | **Exists for 19 of 20 members, not Trump** (no snapshot). A sell whose symbol is no longer in holdings ≈ sold out (900 of 1,778 House/Senate sells). It's the vendor's estimate and its snapshot date can predate the sell, so label it "est." |
| Size words | Map the 8 filed brackets onto 4 words | **Exists**, presentation only. Never a midpoint |
| Filing lag ("reported 61 days later") | `disclosure_date` / `days_to_disclose` | **House/Senate yes. Trump no** (fall back to "received by BullPen Nov 24", which is a true fact) |
| Sector grouping | `congress_trades.sector` | **Empty for Trump** (0 sectors). Would need a join to our catalogue. Not worth it for v1 |

## 4. Directions

### Direction A: "The latest filing, explained" (recommended)

The page opens on what arrived, in words, then the stocks in it grouped and sorted by what matters to you. Everything older folds into one line per earlier filing.

```
 ← Discover
 (photo) Donald J. Trump                         [ Following ✓ ]
         Republican · Executive branch

 ┌─ NEW · received today, Nov 24 ─────────────────────────────────┐
 │ Trump reported 363 stock trades he made from Sep 2 to Sep 24.  │
 │ Most were small: 272 were $1K to $15K.                          │
 │ The biggest were sales of Comcast, McDonald's and Home Depot,  │
 │ $1M to $5M each.                                                │
 │                                                                 │
 │ 3 of your stocks are in it  →  [Show yours]                     │
 │ (?) Why months later? · Should I copy this?                     │
 └─────────────────────────────────────────────────────────────────┘

 IN THIS FILING   [Your stocks 3] [Biggest first] [All 248 stocks]

  YOU OWN
  Apple       AAPL   ↗ Bought              Sep 2          ▮▮▮░ $100K to $250K
  TJX         TJX    ↗ Bought twice        Sep 15, Sep 16 ▮▮▮░ $250K to $500K each
  YOU WATCH
  JPMorgan    JPM    ↘ Sold                Sep 15         ▮▮▮░ $250K to $500K

  BIGGEST IN THIS FILING
  Comcast     CMCSA  ↘ Sold                Sep 23         ▮▮▮▮ $1M to $5M
  McDonald's  MCD    ↘ Sold                Sep 23         ▮▮▮▮ $1M to $5M
  ...

 EARLIER FILINGS
  ▸ Received Sep 25 · 500 trades from Jul 24 to Jul 31 · mostly sales
```

How it answers David's three questions:
- **What's new:** one block, labelled with the day it arrived, written as sentences. The "NEW" label uses ink/neutral, not emerald (One Signal Rule).
- **What's old:** earlier filings are collapsed lines with the same one-line summary shape, so old never competes with new.
- **What changed:** one row per stock with the net story ("Bought 2, sold 1"). Row expands to the individual filed rows (the record stays one click away). For the 19 members with a holdings snapshot, a small tag: "New position", "Added", "Sold out (est.)".

Sorting inside the filing: your stocks first (own, then watch), then by biggest bracket, then by date. "Biggest first" is the default for someone with no overlap. Name-First: company name leads, ticker small (this is exactly the "meeting a stock for the first time" case: 154 of the 248 are new to his history).

Size: four words with a 4-step bar in neutral ink, the filed range beside it. Small = under $15K, Medium = $15K to $100K, Large = $100K to $1M, Very large = $1M and up. Plus one relative line in the summary ("Most were small"), never a sum or midpoint.

The summary sentences are **templated, not model-written**: they are counts, extremes and names from the rows, so they can't hallucinate and need no Anthropic call. (An optional "Ask Bull about this filing" button can hand the grouped data to Bull for the "why might he sell restaurants" conversation, clearly marked as AI.)

- **Effort:** M, about 2 to 3 days. Load by filing instead of newest-100 (fixes bug 1), add `created_at` to the select, pure `groupFiling()` with a self-check, the summary block, grouped rows, collapsed earlier filings, i18n keys. No migration for day-level "new".
- **Tradeoffs:** best answer to "what's new"; the page changes shape (a list becomes a briefing), so search and the year filter move under "All trades". Works poorly for members who file 1 to 3 trades at a time (the summary is then longer than the list); rule: under ~6 trades, skip the sentences and show the rows.

### Direction B: "Stock ledger" (one row per stock, all time)

Replace the trade list with one row per stock across everything we have, each with a tiny timeline of buys and sells and the current estimated position.

```
 Stocks Trump has traded (248)   [Your stocks] [Recently changed] [A to Z]

  TJX      TJX   You own  ●──●         Bought 2 · last Sep 16           NEW
  Apple    AAPL  You own  ●            Bought · Sep 2                   NEW
  JPMorgan JPM            ○            Sold · Sep 15                    NEW
  ...
```

- **Strengths:** best at "what changed in the position" over time and at "does he still own it". Great for Pelosi-type members with long histories and holdings snapshots.
- **Weaknesses:** weak at "what arrived today" (the NEW tag is the only cue); a 248-row ledger is still a list to read; for Trump, without a holdings snapshot, "still owns" is unknown, which is the column beginners would care about most.
- **Effort:** M to L, 3 to 4 days. Needs full history per member on the page (pagination by stock), the timeline mini-chart, holdings join.

### Direction C: "Filings inbox"

Treat each filing like a message: a list of filing cards (unread dot, received date, one-line summary), opening one shows Direction A's grouped view for that filing only.

- **Strengths:** the clearest possible new/old split, and it matches how disclosure actually works (they arrive in batches). Unread state can drive the notification too.
- **Weaknesses:** an extra click before any trade; per-user read state needs a table or column (migration); for members who file one trade at a time it's a list of tiny cards.
- **Effort:** L, about 4 to 5 days including read state.

### Recommendation

**Direction A**, with the per-stock grouping from B inside each filing, and C's "earlier filings" as collapsed lines rather than a separate inbox. It answers new / old / changed on the first screen, needs no migration, and fixes the 100-row cutoff as part of the change rather than as a separate patch. B's "still holds" tag comes along for free where a holdings snapshot exists.

## 5. Notifications, rewritten

Rules: one notification per event per user (merge the follow and the holdings one); name the person once; lead with your stocks, then the biggest; say when the trades happened and when they arrived; link straight to the new filing with your stocks filtered.

**One politician, you hold or watch some of it (today's case):**

> **Trump reported 363 trades, 3 in your stocks**
> You own 2: he bought Apple and TJX. You watch JPMorgan, which he sold. Trades are from September, reported today. Biggest overall: sold Comcast, McDonald's and Home Depot, $1M to $5M each.
> → *See the filing* (`/discover/politicians/donald-trump?filing=2026-11-24&show=mine`)

**You follow them, none of your stocks:**

> **Trump reported 363 trades from September**
> Most were small. Biggest: sold Comcast, McDonald's and Home Depot, $1M to $5M each.

**Several politicians, your stocks (the Pro holdings digest):**

> **3 politicians traded 5 of your stocks**
> Apple: Trump bought. JPMorgan: Trump and another member sold. Plus 3 more.
> → the Washington section with the overlap panel's existing "new since your last visit" markers.

Notes:
- "Biggest" picks by `amount_low`, never vendor order (fixes bug 4).
- Watched stocks are counted ("and 10 you watch") rather than listed when owned ones exist, so the sentence stays short without cutting anything off.
- No dashes in any of it; amounts read "$1M to $5M" in sentences (the "$1M - $5M" hyphen form stays in dense rows only).
- Effort: S to M, about 1 day. Mostly `notification-creators.ts`, `notification-href.ts`, and i18n keys. Merging the two needs the follow notice to skip users who get the holdings one in the same run.

## 6. Learning moments (linked once, never walls)

One `(?)` row under the summary with two or three collapsed questions, each 2 sentences max:

- **Why did this show up months later?** "Officials have up to 45 days to report a trade, and reports often land in batches. You're seeing what they did in September, not what they're doing now."
- **What does $1K to $15K mean?** "The law only asks for a range, not the exact amount. A trade in a top bracket can be hundreds of times bigger than one in the bottom."
- **Should I copy this?** "By the time a trade is public, the price has usually moved. Treat it as one clue about what someone is doing, not a signal to buy or sell."

Also: a `TermTooltip` on "reported" and on the size word. The existing `DisclosureNote` caveat stays, but folds into these questions instead of sitting as two always-on lines above the list.

## 7. The empty scorecard

Say the real reason, specific to the member:

- **No filing dates (Trump, all executive filings we have):** "We can't score Trump's trades. His reports don't say the day they became public, and the score starts from that day." Then hide the 4 tiles permanently for him rather than showing a "yet" box.
- **Truly too few buys (a member with 2 buys):** "Not enough buys to score yet. We need at least 5." (keeps "yet", because it's true there).
- Optional later: score Trump from `created_at` labelled "from the day BullPen received it". That's a different, weaker number; only if clearly labelled. Not recommended for v1 (never ship a number whose meaning shifted).

## 8. Applying the principle beyond this page

Patterns here that are reusable elsewhere (13F fund pages have the same "flat list of a filing" shape):
- A "NEW · received <day>" block written as 2 to 3 templated sentences, above the data, collapsed earlier periods below.
- Group by the thing the user thinks in (the stock), not the row the source sends.
- Your stocks first, then biggest, then newest.
- Every notification links to the exact new slice, filtered to you.

## 9. Follow-ups found along the way (not part of this proposal)

- Done: Trump's filings were truncated at 500 rows; fixed and filled (`docs/superpowers/plans/2026-11-24-congress-trade-gap-fix.md`).
- Done: the stale `member-data.ts` comment "we only store the most recent 100 per member" went with the 100-trade cap.
- Trump has no positions snapshot (`holdings_synced_at` null); the page's "Estimated portfolio" section is sent to the bottom for him. Probably skipped by the positions-row ceiling; worth confirming the reason.

## 10. Decisions for David

1. Direction A, B or C (recommended: A with B's per-stock rows).
2. "New" means received today / this week (no migration), or since *your* last visit (needs per-follow seen state)? Recommended: start with received date, add last-visit later if people come back.
3. Merge the follow and holdings notifications into one? Recommended: yes.
4. Fix the 100-row cutoff now, separately, even before the redesign? Recommended: yes, it hides today's biggest trades.
