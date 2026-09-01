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
import { seedEarningsDeepDiveDraft, completeEarningsDeepDiveFromFiling } from '../lib/instagram/content/earnings-deep-dive';
import { extractEarningsActuals } from '../lib/instagram/content/earnings-deep-dive-extract';

function parseArg(name: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3) : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
