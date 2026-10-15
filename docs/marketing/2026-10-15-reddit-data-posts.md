# Reddit data posts, 2026-10-15

Two posts built from the June 30, 2026 13F filings of the 17 funds BullPen tracks. Every number was queried from the database on 2026-10-15, after fixing the bug that left Citadel and Renaissance holdings without tickers (commit 4e547dd4). Common stock only; options are not counted.

Before posting:
- Read each subreddit's sidebar. Most investing subs ban self-promotion outright or allow it only in a weekly thread. The disclosure line at the bottom of each post is required either way (FTC endorsement rules, and Reddit's own norms).
- Post from your own account and stay in the comments for the first hour or two. Answer questions with data, not links.
- Q3 2026 filings are due by November 14. These numbers will be stale then, which is also the moment for a fresh version of post 1.

Suggested subs: r/ValueInvesting, r/stocks (check the self-promotion rule), r/investing (daily thread only), r/SecurityAnalysis (strict, data-first). For post 2: r/NVDA_Stock, r/stocks.

---

## Post 1

**Title:** I counted which stocks 17 famous funds all owned at the end of Q2. Amazon was in 14 of them.

I went through the June 30, 2026 13F filings for 17 well-known funds and counted how many of them held each stock: Berkshire Hathaway, Bridgewater, Citadel, Renaissance Technologies, Pershing Square, Tiger Global, Coatue, Viking Global, Lone Pine, Third Point, Appaloosa, Duquesne, Soros Fund Management, Baupost, ARK, Thiel Macro and Situational Awareness.

| Stock | Funds holding it (of 17) |
|---|---|
| Amazon (AMZN) | 14 |
| Alphabet (GOOGL / GOOG) | 13 |
| Taiwan Semiconductor (TSM) | 13 |
| Meta (META) | 10 |
| Microsoft (MSFT) | 9 |
| AMD (AMD) | 9 |
| Nvidia, Broadcom, SpaceX, Reddit, Sea, Visa | 8 each |

A few things that stood out:

- Only three of the 17 had no Amazon: Berkshire, Lone Pine and Situational Awareness.
- Of the top three, Berkshire held only Alphabet.
- Nvidia was in just 8 of the 17 portfolios. Nine funds held no Nvidia shares at all, including Situational Awareness, the fund built around an AI thesis.
- SpaceX was already in 8 of them.

Caveats, because 13Fs are easy to over-read:

- This is a June 30 snapshot. Funds file up to 45 days after the quarter ends, so some of these positions have changed since.
- 13Fs only show long positions in US-listed securities. No shorts, no cash, no foreign listings.
- A count says nothing about size. For some of these funds a stock is a top-five holding, for others it is a rounding error. Citadel and Renaissance in particular hold thousands of stocks.

Q3 filings land by November 14, and I'll redo this when they're in.

*Disclosure: I build BullPen, a stock research app for beginner investors, and this comes from its fund tracker. The list of which funds hold a given stock is free on each stock's page, for example [Amazon](https://bullpeninvest.com/stock/AMZN/fund-holders?utm_source=reddit&utm_medium=social&utm_campaign=13f_overlap_q2).*

---

## Post 2

**Title:** 9 of 17 famous funds held zero Nvidia shares at the end of Q2, including the AI-focused one

From the June 30, 2026 13F filings of 17 well-known funds, 8 held Nvidia stock: Appaloosa, ARK, Bridgewater, Citadel, Coatue, Renaissance, Soros and Tiger Global.

The 9 that held no Nvidia shares: Berkshire, Baupost, Duquesne, Lone Pine, Pershing Square, Thiel Macro, Third Point, Viking Global and Situational Awareness, Leopold Aschenbrenner's fund, which is built around an AI thesis. It held no Nvidia options either.

For comparison, Amazon was in 14 of the 17 and TSMC in 13. Five of the nine that skipped Nvidia (Duquesne, Lone Pine, Third Point, Viking and Situational Awareness) held TSMC, the company that manufactures Nvidia's chips.

Usual caveats: this is a June 30 snapshot filed up to 45 days later, 13Fs show only long US positions, and a count says nothing about position size. Q3 filings arrive by November 14.

*Disclosure: I build BullPen, a stock research app for beginner investors, and this comes from its fund tracker. Which funds hold Nvidia is free on [its stock page](https://bullpeninvest.com/stock/NVDA/fund-holders?utm_source=reddit&utm_medium=social&utm_campaign=13f_nvda_q2).*

---

## Not posted: congress trades

The congress data is too thin for a post right now. BullPen tracks 19 active members, and in the last 90 days no stock was traded by more than 3 of them, mostly in the $1,001 to $15,000 bracket. One possible lead needs checking against the official filing first: a Senator's Apple sale dated 2024-10-29 was disclosed 2026-08-05, far past the 45-day rule. The date could be a vendor error or an amendment, so verify it on efdsearch.senate.gov before saying anything publicly.
