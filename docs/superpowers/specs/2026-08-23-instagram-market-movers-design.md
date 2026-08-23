# Instagram Market Movers — Design Spec

**Status:** Approved by user in chat (slide theme, structure, quiet-day handling, publish flow, caption content all confirmed). Ready for `writing-plans`.

## Goal

A new daily (weekday) Instagram content type: top 5 gainers / top 5 losers, restricted to the S&P 500 + Nasdaq 100 universe (`SIGNIFICANT_TICKERS`), following the exact generate → stage → Discord-review → manual-publish pattern already established by `earnings_calendar` / `earnings_results`.

## Confirmed decisions (from brainstorming)

1. **Universe:** S&P 500 + Nasdaq 100 only (`lib/market-data/significant-tickers.ts`'s `SIGNIFICANT_TICKERS`, 518 unique tickers) — not the full market, not the `INSTAGRAM_ALLOWLIST` used by the earnings posts (that list adds curated non-index names like TSM/CRWV; Market Movers deliberately does NOT use it, per "people don't care if a random bio-health stock goes up 100%").
2. **Count:** exactly 5 winners + 5 losers, split across two separate slides (not one combined slide).
3. **Theme:** light theme, matching the existing carousel system exactly (white bg, `BRAND` emerald for gains, `MISSED_COLOR` red for losses — both already defined in `slides.tsx`). The dark reference image's layout/bar-badge concept is kept; its color scheme is not.
4. **Slide structure:** 3 slides — Winners → Losers → CTA. No separate hook slide; the Winners slide's own title serves as the opener, matching the reference image (each is a full title slide, not a paginated list under a generic header).
5. **Quiet-day handling:** always post the top 5/top 5, regardless of how small the day's moves were. No skip-on-flat-day threshold (unlike `earnings_calendar`'s skip-on-empty-week, this is never "empty" — there's always a #1 through #5 by rank).
6. **Publish flow:** stage only (`status: 'ready'`) + Discord preview notification, same as `earnings_results` today. No auto-publish for this content type initially — manual publish via the existing `scripts/publish-instagram.ts --id=<postId>` / `app/api/instagram/publish-by-id` remote endpoint. Can be flipped to auto-publish later once trusted.
7. **Caption:** data-only Claude-written caption (short, factual, states the day's top gainer/loser by name, soft CTA) — no "why it moved" narrative, no web search.
8. **Scope clarifier:** both slides carry a subtitle stating the universe explicitly (e.g. "S&P 500 & Nasdaq 100 · Aug 24, 2026"), per the user's ask to make the restricted scope visible on the post itself.

## Data source & timing

- `getStockQuotes()` (`lib/twelvedata/twelvedata-client.ts:339`) already returns `percent_change` (as `StockQuote.dp`) per symbol from a single batched `/quote` POST — no new TwelveData endpoint needed, no separate % calculation.
- Universe is `[...SIGNIFICANT_TICKERS]` (518 tickers). `getStockQuotes` does not internally chunk (`twelvedata-client.ts:339-364` builds one `requests` object per call), so the generator chunks into groups of 100 (`SEED_CHUNK` convention, `lib/market-data/seed-prices.ts:42`) and calls `getStockQuotes` **sequentially** per chunk (not `Promise.all` — see Credit budget below), merging the returned `Map`s.
- **Credit budget:** `/quote` is 1 credit/symbol, so 518 credits total — more than `CRON_CREDIT_SHARE` (400, `lib/twelvedata/credit-budget.ts:47`) in one burst if fired unthrottled. Each chunk must call `await waitForCronCreditBudget(chunk.length)` before `getStockQuotes(chunk)`, exactly the pattern `prefetch-market-data`, `screener-stats.ts`, and `calendar-days.ts` already use. Sequential (not parallel) chunk processing avoids multiple simultaneous reservation waits against the same shared counter.
- **Timing:** new GitHub Actions workflow at `30 21 * * 1-5` (21:30 UTC weekdays) — the exact same cron expression already used by `check-price-moves` (`.github/workflows/cron-check-price-moves.yml`) for the identical reason (reliably after US market close in both EDT and EST; the codebase doesn't hardcode a UTC close time anywhere — market-session logic always resolves ET via `Intl`).
- Company name + logo: `attachCalendarMeta()` (`lib/market-data/calendar-market-cap.ts:82`) — a single cached (6h) whole-universe lookup against `screener_stats`, returning `{ name, market_cap, logo_url }` per symbol in one call. This is used **instead of** `earnings-calendar.ts`'s separate per-ticker `resolveLogoUrl()` loop (that generator calls both `attachCalendarMeta` and `resolveLogoUrl` per company — `resolveLogoUrl`'s result is what's actually used for `logoUrl`, `attachCalendarMeta`'s `logo_url` field appears unused there; not touching that file, just not repeating the redundant pattern here).

## New types (`lib/instagram/content/schema.ts`)

```ts
export interface MarketMoverEntry {
  symbol: string;
  name: string;
  changePercent: number; // signed: +13.70 or -8.60
  price: number;
  logoUrl: string | null;
}

export interface MarketMoversSlides {
  contentType: 'market_movers';
  dateLabel: string; // e.g. "Aug 24, 2026"
  winners: MarketMoverEntry[]; // exactly 5, sorted descending by changePercent
  losers: MarketMoverEntry[]; // exactly 5, sorted ascending by changePercent (most negative first)
  caption: string;
}

export type InstagramPostSlides = EarningsCalendarSlides | EarningsResultsSlides | MarketMoversSlides;
```

`InstagramPostSlides` is a new exported alias — replaces the repeated `EarningsCalendarSlides | EarningsResultsSlides` union at its 3 current call sites (see "Shared plumbing changes" below).

## New generator (`lib/instagram/content/market-movers.ts`)

Mirrors `earnings-calendar.ts`'s shape (Anthropic client, `logAiCall`, real-data-first-Claude-writes-copy-only), with these differences:

- `generateMarketMoversContent(dateET: string): Promise<MarketMoversSlides>` — **always returns content**, never `null` (per decision #5, there's no "skip" case).
- Fetch quotes for `[...SIGNIFICANT_TICKERS]`, chunked/budgeted as above.
- Filter out any symbol with a non-finite or zero quote (`quote.c <= 0` or `!isFinite(quote.dp)`) — same defensive check `seed-prices.ts:131` already uses — before ranking, so a bad/missing quote can't corrupt the top-5.
- Sort by `dp` descending → top 5 = winners; sort by `dp` ascending → top 5 = losers.
- Enrich the resulting 10 symbols with `attachCalendarMeta()` for name + logo (never used for anything else — no market cap needed on this slide).
- One short Claude call (new system prompt, data-only per decision #7) for `caption` only — no `headline` field needed since there's no hook slide title to write.
- New disclaimer line: `earnings-calendar.ts`'s `FIXED_DISCLAIMER` ("Report dates gathered from public sources...") doesn't apply to price data. Add `MARKET_DATA_DISCLAIMER = 'Not financial advice. Prices and % changes as of market close.'` to `shared.ts`, used here instead of `FIXED_DISCLAIMER`. `FIXED_HASHTAGS` is reused as-is (still on-topic).
- New `formatDateLabel(dateStr: string): string` in `shared.ts` (e.g. "Aug 24, 2026") — single-date sibling to the existing `formatWeekLabel`, same UTC-noon-anchor approach `slides.tsx`'s `formatDateHeader` already uses.

## Slide rendering (`lib/instagram/render/slides.tsx`)

New shared `MoversListSlide` component (winners/losers differ only by title text, sign, and color — one component, two call sites), added alongside the existing `HookSlide` / `EarningsListSlide` / `CTASlide` in this same file (no file split — matches how this file already houses every render template for the whole pipeline).

- Header: `Wordmark` + `SlideIndicator` (both reused as-is).
- Big `Instrument Serif` italic title: "Daily Winners" / "Daily Losers" (static string, not model-generated — matches the reference image).
- Subtitle: `S&P 500 & Nasdaq 100 · {dateLabel}` (per decision #8), `Geist Mono`, `MUTED` color — same visual register as the existing carousel's mono metadata lines (e.g. `weekLabel` on the hook slide).
- 5 rows, each: `CompanyBadge` (reused as-is, ticker-initials fallback when `logoUrl` is null) + ticker (bold) + company name (muted) on the left; a bar-style % badge on the right — a fixed-width track with a filled, rounded-rect bar whose width is `Math.max(0.2, Math.abs(entry.changePercent) / maxAbsInSet) * TRACK_WIDTH` — floored at 20% of the track so the #5 entry's bar stays legible even when the top mover dominates the range — filled `BRAND` (winners) or `MISSED_COLOR` (losers, both already defined constants), with the signed `%` label right-aligned inside the bar.
- `CTASlide` reused completely unchanged (its generic "Track earnings, prices, and your whole portfolio" copy still applies).

### Shared plumbing changes (touches 3 existing call sites)

`totalSlideCount(companyCount: number)` and `slideKindAt(index, companyCount)` currently assume every content type is "hook + N paginated list slides + cta", which doesn't fit Market Movers' fixed 3-slide shape (no hook, always exactly winners+losers+cta). Both functions (plus `altTextForSlide`, which already takes the full slides object) change signature to take the full `InstagramPostSlides` object and branch on `contentType`:

- `earnings_calendar` / `earnings_results`: unchanged behavior, just reads `slides.companies.length` internally instead of receiving it as a param.
- `market_movers`: always returns 3 / branches `index === 0 ? 'winners' : index === 1 ? 'losers' : 'cta'`. Two new `SlideKind` values (`'winners'`, `'losers'`) added alongside the existing `'hook' | 'list' | 'cta'`.

Call sites to update: `lib/instagram/publish.ts:46` (`totalSlideCount(post.slides.companies.length)` → `totalSlideCount(post.slides)`), `app/api/instagram/render/[postId]/[slideIndex]/route.tsx` (`totalSlideCount(companyCount)` / `slideKindAt(slideIndex, companyCount)` → pass `slides` directly, and add the `kind === 'winners' | 'losers'` render branch), `app/api/cron/instagram-earnings-weekly/route.ts` and `app/api/cron/instagram-earnings-results/route.ts` (`totalSlideCount(content.companies.length)` → `totalSlideCount(content)`).

## New cron route (`app/api/cron/market-movers-daily/route.ts`)

Same shape as `app/api/cron/instagram-earnings-results/route.ts`: `CRON_SECRET` auth check, idempotency check, generate, insert (`status: 'ready'`), Discord notification, JSON summary response.

- `CONTENT_TYPE = 'market_movers'`.
- `period_key` = today's ET date as `YYYY-MM-DD` (not an ISO week — this is a daily post). No existing helper for this; add inline (`new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })` — `en-CA` locale reliably formats as `YYYY-MM-DD`).
- Idempotency: same `(content_type, period_key)` uniqueness check pattern as the existing crons (already enforced at the DB level by migration 102's `UNIQUE (content_type, period_key)` constraint too).
- No "skip if empty" branch (decision #5) — generation always succeeds.
- Discord embed: same structure as `instagram-earnings-results`'s (title, description with per-slide preview links + caption, `Publish` field with the `npm run instagram-publish -- --id=<postId>` command, timestamp).

## New GitHub Actions workflow (`.github/workflows/cron-market-movers.yml`)

Copy of `cron-check-price-moves.yml`'s shape: `30 21 * * 1-5`, `workflow_dispatch`, `CRON_SECRET` bearer POST to the new route, same `APP_URL` default fallback.

## Out of scope for this spec

- Auto-publish (deferred, per decision #6).
- The "why it moved" narrative (deferred, per decision #7 — would need Claude web search, real cost/latency/accuracy tradeoffs).
- Economic Data content type (separate spec, brainstormed after this one ships).
- Any change to `earnings-calendar.ts`'s redundant `attachCalendarMeta`/`resolveLogoUrl` double-call — noted above, not fixed here (out of scope, unrelated to this feature).
