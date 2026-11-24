# Congress trade refresh: stop losing the tail of big filings

Plan, 2026-11-24. **Part 1 built the same day.** Parts 2 and 3 and the bonds option are not built; each needs David's go-ahead before any paid call.

## What we know (measured, not assumed)

- **The refresh cut Trump's Nov 24 filing.** `refresh-congress-trades` (Vercel cron, Tuesdays 14:00 UTC) fetches 20 rows per member. When all 20 are new it re-fetches once at `BURST_TRADE_LIMIT = 500` and stops there (`ingestPolitician`, `lib/congress/ingest-trades.ts`). Both Trump batches are exactly 500 rows. One read-only call for `limit=50&offset=500` returned 50 rows, none stored, all dated 2026-09-02, the oldest day we hold. Trades dated Aug 1 to Sep 1 are absent entirely. The size of the gap is unknown.
- **Pricing, from the vendor's OpenAPI spec** (`https://api.disclosedcapitol.com/openapi.json`, free to read): endpoint base + 1 credit per row returned, **5 per executive-branch row** (`source = oge.gov`). Our check billed 265 = 15 + 50 × 5. So **offset rows are not billed**, and the code comments are wrong for Trump: his 500-row burst cost ~2,515 credits, not 515, and his quiet weekly refresh costs ~115, not 35.
- **Vendor trade ids grow over time.** Our max stored ids: House 295823, Senate 295719, Executive 296599. Useful for a cursor later.
- **Executive rows carry no disclosure date at the vendor either**, so nothing here fixes the Trump scorecard.
- **The vendor has filters we don't use.** `GET /trades` takes `politician_id`, `asset_type` (Stock, Option, ETF, Bond, Fund), `date_from`, `date_to`, `sort_by`, `limit` ≤ 1000 and `offset`. `GET /politicians/{id}/trades` takes only `limit` ≤ 1000 and `offset`.

## The fix, in three parts

### 1. The weekly refresh pages until it reaches a trade we already have (the real fix)

Replace the single 500-row re-fetch with a loop on `/politicians/{id}/trades`:

1. Fetch the newest 20, as today.
2. While the page is full **and** none of its ids are stored: fetch the next page (`offset += page`, page size 200), collecting rows.
3. Stop at the first page holding a known id, a short page (end of history), or the **per-member credit ceiling**.
4. Insert everything collected in one pass through the existing `buildRows` → `verifyVendorSymbols` → `dropVendorDuplicates` → upsert path. Notifications stay one per filing, because the cron already notifies once per member per run.

Because offset is free, the cost is exactly the rows we needed, plus 15 per page.

- **Per-member ceiling:** stop at ~4,000 credits (800 executive rows, or 4,000 congressional). When it stops on the ceiling rather than on a known id, the result's `error` says so. That makes it reach the existing cron-health alert in Discord instead of failing silently, the way today's cut did.
- **The run ceiling** (`MAX_CREDITS_PER_RUN = 6000`) stays as the outer guard. Check it still holds: one Trump burst near the member ceiling plus 19 quiet members at ~35 each is ~4,700.
- **Pure helper + self-check:** a `shouldFetchMore(page, knownIds, spent, ceiling)` function with asserts in `scripts/test-congress-ingest.ts` (full page all new → more; any known id → stop; short page → stop; ceiling → stop and flag).
- **Fix the cost comments** (`BURST_TRADE_LIMIT`, `REFRESH_TRADE_LIMIT`, the header block) with the 5-credit executive rate.

### 2. One-off catch-up for Trump's missing trades (a script, not the cron)

`scripts/backfill-congress-gap.ts --slug donald-trump [--dry-run] [--max-credits N]`

1. **Size the gap first, cheaply.** Binary-search the offset where our stored rows begin again, with `limit=1` probes at ~20 credits each. About 8 probes, ~160 credits, gives the exact number of missing rows. `--dry-run` stops here and prints the count and the cost of step 2.
2. **Fetch the gap** in 200-row pages from offset 500 up to that point, then insert through the same path as the cron.
3. **Backdate `created_at`** of the inserted rows to the filing they belong to (2026-11-24 14:01 UTC, the existing batch's timestamp). Otherwise the page's "Latest filing" would show a fake "arrived today" filing of August trades.
4. **Send no notifications.** These are part of a filing users were already told about.
5. Flush `congress:` cache keys afterwards (`invalidateCachedPrefix('congress:')`), as the cron does.

Cost: about 160 credits to size, then 5 credits × missing rows. If August looks like September (~500 rows in three weeks), that's ~2,500 credits (~$2.50). The dry run states the real figure before anything is spent.

### 3. Optional, later: a cursor instead of a window

`/feed/recent?since_id=` and `/v1/detections?since=` return everything newer than an id, so no window can be outgrown. Two unknowns need one measured call each before this is worth it: their credit cost (`/trades/recent` was 15 flat and capped at 50 rows) and whether they include executive-branch rows at all. Not part of this fix.

## Side option: stop paying 5 credits for Trump's bonds

27% of Trump's rows (137 of 500 on Nov 24) are munis and treasuries with no ticker, which the app never shows. The code keeps non-stock rows on purpose because they arrive "free"; at 5 credits each they don't. `GET /trades?politician_id=…&asset_type=Stock,ETF` would skip them. That's ~685 credits saved per 500-row Trump filing, but it changes the "store everything" rule, and `/trades` pricing and field parity are unmeasured (one call to check). Recommend: decide separately, after part 1.

## Order and effort

1. Part 1 with its self-check: ~2 to 3 hours. No migration, no paid call to build it; it costs credits only when a member files more than 20 trades.
2. Part 2 dry run (~160 credits, needs David's OK), then the backfill (5 × rows, needs David's OK on the printed figure): ~1 to 2 hours plus the run.
3. `npm run test-congress-ingest`, `npm run test-cron-coverage`, lint. After the next Tuesday run, read its result for Trump (fetched / inserted / credits) to confirm it stopped on a known id.

## Decisions for David

1. Go ahead with part 1 (no spend to build)?
2. Per-member ceiling: 4,000 credits (~$4) proposed.
3. Approve the ~160-credit sizing dry run for part 2, then decide on the backfill once it prints the real cost?
4. Bonds side option: keep paying 5 credits per Trump bond row, or filter to stocks and ETFs?
