# Scheduled work (crons)

_Moved out of CLAUDE.md on 2026-10-19 so it is read when needed instead of sent with every request. CLAUDE.md points here._


Split across three schedulers. All cron routes are protected by the `CRON_SECRET` bearer header regardless of who triggers them. Local manual trigger: `npm run trigger-cron` (or `trigger-alerts`). Run `npm run test-cron-coverage` after touching any cron route or scheduler — it fails if a route has no scheduler pointing at it, or a scheduler references a route that doesn't exist.

**Historical note (2026-09-03):** this used to be split "Vercel = 2 time-critical crons, GitHub Actions = everything else," with the reasoning that Vercel's Hobby plan capped projects at 2 cron jobs. That cap was removed Vercel-side on 2026-01-20 (`vercel.json` cron entries now go up to 100/project on every plan, confirmed live against Vercel's own docs) — it had just never been revisited. GitHub Actions' own scheduler is measurably unreliable regardless: typical drift is 15-20 min, but multi-hour delays and occasional dropped runs are common industry-wide in 2026, this repo included. The jobs below were re-sorted onto **whichever scheduler's actual constraints fit each job**, not habit.

**Vercel crons** (`vercel.json`) — anything that fits Hobby's "once per day" cadence limit (a job that never fires twice in the same calendar day, regardless of which days of week) gets Vercel's own scheduler: tighter timing than GitHub Actions, and no separate service to manage. Vercel's cron invoker sends `Authorization: Bearer $CRON_SECRET` automatically when that env var is set — same header these routes already checked for GitHub Actions, so migrating a job here is a `vercel.json` edit only, never a route change.

| Endpoint | Schedule (UTC) | Purpose |
|---|---|---|
| `/api/cron/generate-daily-brief` | `30 6 * * *` | Generate AI daily brief for Pro users (Anthropic Claude) |
| `/api/cron/generate-weekly-pick` | `30 6 * * 1` | Generate Bull's Weekly Pick, published before pre-market so it's actionable from that session's open |
| `/api/cron/generate-academy-course` | `17 6 * * 1` | Draft the next course in the 10-week Academy roadmap (`lib/academy/academy-roadmap.ts`) via Claude and stage it unpublished for review at `/admin/academy-roadmap`. No auto-publish — requires explicit approval. |
| `/api/cron/sync-institutional-holdings` | `0 7 * * 1` | Pull the newest 13F-HR filing for each curated fund in `institutional_investors` from SEC EDGAR, resolve CUSIPs to tickers, and upsert holdings (Discover page's institutional-holdings Pro feature). One fund's parse failure never blocks another's; supports `?slug=<fund-slug>` for a scoped rerun. |
| `/api/cron/top-up-daily-challenges` | `20 5 * * *` | Keep today plus the next 14 days of `academy_daily_challenges` filled (`lib/academy/daily-challenges.ts`): Claude Haiku 5.5 writes one Zod-validated question per empty day, topics rotating across every published course and its lessons. No review gate. ~$0.0003 a day, ~$0.005 for a full 15-day backfill; a failed day is retried by the next run |
| `/api/cron/check-daily-challenge-reminder` | `0 1 * * *` | Evening (~9pm ET) nudge for users with an active Academy streak who haven't done anything in Academy yet today. Skips everyone when today has no challenge row |
| `/api/cron/check-dividends-upcoming` | `0 8 * * *` | Notify users about held/watched stocks going ex-dividend in 3 days |
| `/api/cron/check-earnings-upcoming` | `0 8 * * *` | In-app notification about upcoming earnings in held/watched stocks (no email) |
| `/api/cron/send-alert-email` | `30 8 * * *` | Morning alert email (`lib/email/alert-email.ts`): one email per verified, opted-in user with the earnings, ex-dividend and big-move notifications from the last 26h that haven't been emailed (`notifications.emailed_at`, migration 181). Skips users with nothing new. `?dryRun=1` builds without sending, `?userId=` limits to one account. Opt-out: Settings toggle `email_alerts` or the signed link to `/email/unsubscribe` |
| `/api/cron/send-verify-reminder` | `0 9 * * *` | One verify-your-email reminder (`sendVerificationReminders`, `lib/auth/email-verification.ts`) to email signups still unverified 24-48h after signup, counted from the top of the run's hour so Hobby's in-hour jitter can't send twice. No sent-flag column; a skipped run skips that day's signups. `?dryRun=1` counts without sending |
| `/api/cron/check-economic-events` | `0 8 * * 1-5` | In-app heads-up on days with a scheduled US economic release (jobs report, CPI, Fed decision...), opt-in via `settings.notifications.economic_events`. Reads `economic_events` only, no credits |
| `/api/cron/sync-economic-calendar` | `15 5 * * 1` | Refresh `economic_events` from the BLS + BEA calendar feeds, the hand-seeded FOMC dates and the Thursday jobless-claims rule (`lib/market-data/economic-calendar.ts`). Each source fails soft; BLS 403s without a browser-like user agent. Manual rerun: `npm run sync-economic-calendar` |
| `/api/cron/refresh-congress-trades` | `0 14 * * 2` | Washington Trading: `--refresh` sweep (20 newest trades per tracked member, ~665 Disclosed Capitol credits a run at 19 members) and notify followers (`user_politician_follows`) of newly stored trades. Weekly (was twice weekly until 2026-09-25; halved to ~2,850 credits/month because vendor credits are real money and PTRs lag 30-46 days anyway). Does not refresh positions (per-row, unbounded cost: `npm run ingest-congress -- --holdings-only --dry-run` first). Needs `DISCLOSED_CAPITOL_API_KEY` in Vercel |
| `/api/cron/check-price-moves` | `30 21 * * 1-5` | In-app notification on 5%+ price moves for held/watched stocks (no email) |
| `/api/cron/instagram-earnings-weekly` | `0 12 * * 0` | Generate, stage, and immediately publish next week's earnings-calendar Instagram carousel; notify Discord. Own `content_type` (`earnings_calendar`). Skips with a Discord notice naming the companies when fewer than 3 report (`lib/instagram/content/earnings-minimum.ts`), checked before the caption call. |
| `/api/cron/instagram-earnings-results` | `0 14 * * 6` | Generate, stage, and immediately publish the past week's beat/missed earnings-results recap carousel; notify Discord. Own `content_type` (`earnings_results`), can share a `period_key` with an `earnings_calendar` row for the same week without colliding. Same fewer-than-3 skip and Discord notice, checked before the TwelveData fallback. |
| `/api/cron/instagram-picks-scoreboard` | `0 15 * * 6` | Weekly Pick track record vs the S&P 500 carousel (`lib/instagram/content/picks-scoreboard.ts`): same numbers as /picks via `computePerformance()`, posted every week whichever way it went, skipped below `MIN_PICKS_FOR_HEADLINE`. One Claude web-search call (~$0.05-0.15) for the caption and the winner/loser "what moved it" lines. Hypothetical-returns disclaimer is on the cover image, not just the caption. `?dryRun=true` stages without publishing. |
| `/api/cron/market-movers-daily` | `30 21 * * 1-5` | Generate, stage, and immediately publish that day's top-10-gainers/top-10-losers Instagram carousel (S&P 500 + Nasdaq 100 only); notify Discord. `?preMarket=true&contextNote=...` triggers an off-schedule special edition (e.g. ahead of a market-moving event). |
| `/api/cron/market-movers-period` | `40 21 * * 1-5` | Weekly and monthly editions of the movers carousel, ranked close to close from daily bars. Exits early unless today is the last trading day of the week (Fri, or Thu before a Friday closure) and/or the month; one ~518-credit closes fetch serves both. Own `content_type`s (`market_movers_weekly`, `market_movers_monthly`). Ten minutes after the daily run so they don't share the cron credit budget. `?period=week\|month&date=YYYY-MM-DD&dryRun=true` for manual runs (`npm run trigger-market-movers -- --period=week --date=... --dryRun`). |

All four Instagram crons above publish for real in the same run they stage in — see `lib/instagram/publish.ts` and `docs/instagram-setup.md` for Meta credential setup. There is no next-day publish step or manual approval gate; the Discord message posted alongside each is a confirmation, not a review window.

**Upstash QStash** — for a job that's both sub-daily (violates Hobby's once/day cadence) and genuinely time-sensitive, so "runs sometime in the next hour" (Hobby's own timing guarantee even if the cadence fit) isn't good enough either:

| Endpoint | Schedule (UTC) | Purpose |
|---|---|---|
| `/api/cron/check-user-alerts` | `30 14-21 * * 1-5` | Evaluate user-defined price/metric alerts hourly through market hours |

Migrated 2026-09-05: QStash schedule created in the Upstash console (EU region), confirmed delivering `200` on both a manual trigger and the first real fire. Auth header is passed through via `Upstash-Forward-Authorization: Bearer $CRON_SECRET`, method pinned via `Upstash-Method: GET`. The old `cron-check-user-alerts.yml` GitHub Actions workflow has been deleted.

**GitHub Actions crons** (`.github/workflows/cron-*.yml`) — reserved for jobs that need something GitHub Actions actually provides beyond scheduling: a runner that can stay alive for hours pacing batched TwelveData calls (a single serverless function invocation can't), or real git checkout+commit access. Each workflow `POST`s/`GET`s the same Vercel route with `Bearer $CRON_SECRET`; the route code is unchanged, only the scheduler differs.

| Endpoint | Schedule (UTC) | Why this stays on GitHub Actions |
|---|---|---|
| `/api/cron/prefetch-market-data` | `0 5 * * *` | Loops ~121 batches (5 symbols each) with a 75s sleep between calls, up to ~2.5h total — needs a long-lived runner, not a single request/response |
| `/api/cron/prefetch-market-data?phase=financials` | `30 7 * * *` | Own workflow (`cron-prefetch-financials.yml`) since it no longer fits in the same job as the stats phase. Loops up to 300 batches (one symbol each) with a 65s sleep, up to ~5.5h total |
| `/api/cron/prefetch-calendar` | `0 4 * * *` | Loops up to 40 batches with a 65s sleep, up to ~45 min total |
| `/api/cron/refresh-search-index` (`?part=`, `&from=`) | `45 6 * * 1` | `cron-refresh-search-index.yml` — three multi-megabyte TwelveData reference feeds with wildly unstable timings (the same `/stocks` call measured at 6s, 32s and 153s in one hour). The funds catalogue alone is ~270 paged requests, because `outputsize` is honoured up to 500 and silently ignored above it. Driven in windows, each its own invocation |
| `/api/screener/refresh` (active mode) | `0 22 * * *` | `cron-refresh-screener-stats.yml` — loops ~122 batches with a 65s sleep, up to ~160 min total |
| `/api/screener/refresh` (active + discovery mode) | `0 3 * * *` | `cron-refresh-screener-extended.yml` — two chained batch loops (up to 279 + 15 batches), up to ~180 min total. Both this and the 22:00 job skip any ticker whose `screener_stats` row is <12h old, so they don't re-fetch what `prefetch-market-data` just warmed |

`cron-sync-index-constituents.yml` (`scripts/sync-index-constituents.ts`, `0 5 * * 1`) also stays on GitHub Actions, for a different reason than the batch-loop jobs above — it's not a `/api/cron/*` route call at all, it's a repo-native script that refreshes `lib/market-data/sp500.ts` / `nasdaq100.ts` against real index membership (SPY's daily holdings disclosure for the S&P 500, Nasdaq's own constituents API for the Nasdaq-100 — TwelveData has no index-constituents endpoint) and commits any diff straight to `preview`, which needs GitHub Actions' git checkout+commit access — no serverless cron can do that. No manual review gate: both sources are official/fund-mandated daily disclosures, not a scrape. Posts to Discord (`DISCORD_INDEX_SYNC_WEBHOOK_URL`) only when membership actually changed. See `lib/market-data/index-sync.ts` for the fetch/parse logic.

After that commit the same workflow POSTs the script's JSON (`INDEX_CHANGES_FILE`: every ticker that joined or left an index, plus SPY/DIA holding weights) to `/api/cron/record-index-changes`, which stores `index_membership_events` / `index_weights` (migration 176) and notifies watchers and open holders. Fail-soft: a failed POST loses that week's events but never blocks the file sync. Events are known to the week only, so copy says "in the week of" (`lib/market-data/index-events.ts`).

`cron-generate-weekly-pick.yml` still exists but is `workflow_dispatch`-only (a manual re-run trigger from the Actions tab, not a second scheduler) — that route's real schedule lives in `vercel.json` above.

`seed-screener-universe.yml` (`/api/screener/seed-universe`) is `workflow_dispatch`-only — a manual/occasional bootstrap for newly-listed tickers, not a recurring schedule.

The GitHub Actions workflows require **`CRON_SECRET`** to be set in repo secrets (Settings → Secrets and variables → Actions). The production URL defaults to `https://bullpeninvest.com` (was bullpen.no until 2026-09-28; it now 308-redirects there) — override with an `APP_URL` repo variable if needed.


## Cron health (PostHog)

Every cron route exports its handler through `withCronReport('<job>', handler)` (`lib/cron/report.ts`), which sends one `cron_completed` event per authorised run with the HTTP status, duration and the numbers in the route's JSON response. A new cron route must do the same, and get a row in the PostHog insight "Cron jobs: overdue runs" (expected max hours between runs). Two PostHog alerts read these: "Cron job missed its schedule" (daily) and "Cron job failed or ran empty" (hourly: status >= 400, any `errors`, or check-price-moves with zero symbols).
