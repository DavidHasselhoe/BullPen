/**
 * Live-poll SEC EDGAR for one company's earnings 8-K and, the moment it
 * lands, generate the single-company earnings deep-dive Instagram carousel.
 *
 * Two-phase pipeline (see lib/instagram/content/earnings-deep-dive.ts):
 *   1. Seed a 'draft' instagram_posts row with pre-report consensus
 *      estimates (safe to do this any time before the report — not
 *      time-critical).
 *   2. Poll data.sec.gov every --interval seconds. The instant a new 8-K
 *      with Item 2.02 shows up for the given CIK, fetch its press-release
 *      exhibit (and CFO-commentary exhibit if one exists), extract actuals
 *      via Claude, flip the row to 'ready', and immediately auto-publish it
 *      for real through Vercel's production runtime (see publishViaProd
 *      below) — no manual `npm run instagram-publish` step needed anymore.
 *
 * Usage:
 *   npm run watch-earnings -- --ticker=NVDA --cik=1045810 --report-date=2026-08-26 --timing=AMC --segment="Data Center"
 *
 * Flags:
 *   --ticker         required
 *   --cik            required — SEC EDGAR Central Index Key (see
 *                    https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=<name>&type=8-K)
 *   --report-date    required, YYYY-MM-DD — used as the poll's "not before"
 *                    date and the draft row's period_key
 *   --timing         optional, "BMO" or "AMC" (default "AMC")
 *   --segment        optional business-segment label to also extract/estimate (e.g. "Data Center")
 *   --interval       optional, seconds between polls (default 15)
 *   --max-minutes    optional, give up after this long with nothing found (default 240)
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { findEarnings8K, fetchFilingIndex, pickPressReleaseFile, pickCommentaryFile, fetchExhibitText } from '../lib/edgar/edgar-watch';
import { seedEarningsDeepDiveDraft, refreshDraftEstimates, completeEarningsDeepDiveFromFiling } from '../lib/instagram/content/earnings-deep-dive';
import { extractEarningsActuals } from '../lib/instagram/content/earnings-deep-dive-extract';
import { sleep } from '../lib/utils';

function parseArg(name: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3) : undefined;
}

/** Minutes past ET midnight, right now. */
function etMinutesNow(): number {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false }));
  return et.getHours() * 60 + et.getMinutes();
}

/** 4:00 PM ET, the earliest an AMC release can land. */
const MARKET_CLOSE_ET_MINUTES = 16 * 60;

/**
 * An AMC 8-K can't legally exist before the market closes, so hammering
 * EDGAR every --interval seconds for the hours before that is pure waste —
 * both on SEC's servers and on whoever's watching this terminal. Sleeps in
 * 5-minute chunks (so progress is still visible) until the ET clock passes
 * 4:00 PM, then returns and lets the real poll loop take over.
 *
 * Deliberately reads the ET clock rather than getMarketSession(). That helper
 * reports 'extended' for BOTH pre-market (4:00-9:30) and after-hours
 * (16:00-20:00), so a "wait while it's 'regular'" check can't tell the hours
 * before the close from the hours after it. Started pre-market it waited for
 * nothing: verified live on 2026-09-10, ORCL and ADBE watchers launched at
 * 7:20 AM ET polled straight through the morning and both gave up at 11:20 AM,
 * roughly five hours before either company could possibly have reported.
 *
 * ponytail: doesn't know about early-close days (day after Thanksgiving,
 * Dec 24). On one of those it starts polling ~3h later than it could have,
 * still well inside typical AMC filing windows. Fix if that ever actually
 * matters: teach getMarketSession() the NYSE holiday calendar.
 */
async function waitForAmcWindow(): Promise<void> {
  const CHECK_INTERVAL_MS = 5 * 60_000;
  while (etMinutesNow() < MARKET_CLOSE_ET_MINUTES) {
    console.log('[watch-earnings] AMC report — market has not closed yet, waiting before polling...');
    await sleep(CHECK_INTERVAL_MS);
  }
}

/**
 * Fires the real publish through Vercel's own runtime rather than locally —
 * INSTAGRAM_ACCESS_TOKEN/INSTAGRAM_USER_ID deliberately aren't in .env.local
 * (see docs/instagram-setup.md), so a local call would just dry-run. Reads
 * APP_URL rather than NEXT_PUBLIC_APP_URL on purpose: this script has no use
 * for the localhost default other scripts here fall back to — Meta creds
 * only exist in production, so there's nothing to test by hitting local dev.
 */
async function publishViaProd(postId: string): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[watch-earnings] CRON_SECRET not set — cannot auto-publish. Publish manually once it is set:');
    console.error(`  npm run instagram-publish -- --id=${postId}`);
    return;
  }

  const base = process.env.APP_URL || 'https://bullpen.no';
  const res = await fetch(`${base}/api/instagram/publish-by-id?id=${postId}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const body = await res.json().catch(() => ({}));

  if (body.dryRun) {
    console.log('[watch-earnings] Production Instagram credentials are not configured — dry run only, post left as \'ready\'.');
    console.log(`  Publish for real once configured: npm run instagram-publish -- --id=${postId}`);
  } else if (body.success) {
    console.log(`[watch-earnings] Published to Instagram. Media id: ${body.mediaId}`);
    if (body.permalink) console.log(`  Permalink: ${body.permalink}`);
  } else {
    console.error('[watch-earnings] Auto-publish failed:', body.error ?? res.status);
    console.error(`  Retry manually: npm run instagram-publish -- --id=${postId}`);
  }
}

async function main() {
  const ticker = parseArg('ticker');
  const cik = parseArg('cik');
  const reportDate = parseArg('report-date');
  const timingArg = parseArg('timing');
  const segment = parseArg('segment');
  const intervalSeconds = Number(parseArg('interval') ?? '15');
  const maxMinutes = Number(parseArg('max-minutes') ?? '240');

  if (!ticker || !cik || !reportDate) {
    console.error('Usage: npm run watch-earnings -- --ticker=NVDA --cik=1045810 --report-date=2026-08-26 [--timing=AMC] [--segment="Data Center"] [--interval=15] [--max-minutes=240]');
    process.exit(1);
  }

  const timing: 'BMO' | 'AMC' | null = timingArg === 'BMO' || timingArg === 'AMC' ? timingArg : 'AMC';

  console.log(`[watch-earnings] Seeding draft for ${ticker} (report date ${reportDate})...`);
  const { postId, alreadyExisted } = await seedEarningsDeepDiveDraft({
    ticker,
    reportDate,
    reportTiming: timing,
    segmentLabel: segment,
  });
  console.log(`[watch-earnings] Draft post ${postId} ${alreadyExisted ? '(already existed)' : '(created)'}.`);

  if (timing === 'AMC') await waitForAmcWindow();

  // Second run at the consensus figures, now that the trading day's worth of
  // preview coverage exists. Skips itself when the seed already found them, so
  // this costs a search only when there's something to fix. See
  // refreshDraftEstimates for why the timing changes the outcome.
  const refresh = await refreshDraftEstimates({ ticker, reportDate, segmentLabel: segment });
  if (refresh.attempted) {
    if (refresh.filled.length > 0) {
      console.log(`[watch-earnings] Estimates refreshed, filled: ${refresh.filled.join(', ')}.`);
    } else {
      console.log('[watch-earnings] Estimates refreshed, still nothing found.');
    }
    if (refresh.stillMissing.length > 0) {
      // The publish guard refuses a deep dive with no beat/miss, so say now
      // that this post is on track to be held rather than at 4:05pm.
      console.warn(
        `[watch-earnings] WARNING: still missing ${refresh.stillMissing.join(', ')}. ` +
        'A deep dive without a consensus comparison will be blocked at publish time.'
      );
    }
  }

  console.log(`[watch-earnings] Polling SEC EDGAR every ${intervalSeconds}s for CIK ${cik}'s next 8-K (Item 2.02) filed on/after ${reportDate}...`);

  const deadline = Date.now() + maxMinutes * 60_000;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt += 1;
    const filing = await findEarnings8K(cik, reportDate);

    if (filing) {
      console.log(`[watch-earnings] Found it: ${filing.accessionNumber} filed ${filing.filingDate}. Fetching exhibits...`);

      const files = await fetchFilingIndex(cik, filing.accessionNumber);
      const pressReleaseFile = pickPressReleaseFile(files, filing.primaryDocument);
      if (!pressReleaseFile) {
        console.error('[watch-earnings] Could not identify a press-release exhibit in the filing. Files found:', files.map((f) => f.name));
        process.exit(1);
      }
      console.log(`[watch-earnings] Press release: ${pressReleaseFile.name} (${pressReleaseFile.size} bytes)`);

      const pressReleaseText = await fetchExhibitText(cik, filing.accessionNumber, pressReleaseFile.name);

      const commentaryFile = pickCommentaryFile(files);
      let commentaryText: string | undefined;
      if (commentaryFile) {
        console.log(`[watch-earnings] CFO commentary: ${commentaryFile.name} (${commentaryFile.size} bytes)`);
        commentaryText = await fetchExhibitText(cik, filing.accessionNumber, commentaryFile.name);
      }

      console.log('[watch-earnings] Extracting actuals via Claude...');
      const extracted = await extractEarningsActuals(ticker, pressReleaseText, commentaryText, segment);
      console.log('[watch-earnings] Extracted:', JSON.stringify(extracted, null, 2));

      console.log('[watch-earnings] Computing beat/miss and writing headline/caption...');
      const final = await completeEarningsDeepDiveFromFiling(ticker, reportDate, extracted);

      console.log(`[watch-earnings] Done. Post ${postId} is now 'ready'.`);
      console.log(`  EPS: ${final.epsActual} vs ${final.epsEstimate} (${final.epsStatus})`);
      console.log(`  Revenue: ${final.revenueActual} vs ${final.revenueEstimate} (${final.revenueStatus})`);
      console.log(`  Headline: ${final.headline}`);

      console.log('[watch-earnings] Auto-publishing to Instagram...');
      await publishViaProd(postId);
      process.exit(0);
    }

    if (attempt % 10 === 1) {
      console.log(`[watch-earnings] [attempt ${attempt}] Not filed yet, still polling...`);
    }
    await sleep(intervalSeconds * 1000);
  }

  console.error(`[watch-earnings] Gave up after ${maxMinutes} minutes with no filing found. Post ${postId} remains a draft — check SEC EDGAR manually and re-run once the filing exists, or complete it by hand.`);
  process.exit(1);
}

main().catch((err) => {
  console.error('[watch-earnings] Fatal error:', err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
