/**
 * Seeds quarter-over-quarter history for the 13F tracker by ingesting the
 * newest N filings per fund, not just the newest one.
 *
 * Usage:
 *   npx tsx scripts/backfill-institution-filings.ts [--slug=<fund>] [--quarters=5] [--no-resolve] [--dry-run]
 *
 * Why a script and not a cron route: the weekly sync is capped at
 * maxDuration=300 and Citadel alone is 7166 holdings per quarter. A local run
 * has no timeout. The parse pipeline itself is shared with the cron
 * (lib/institutions/ingest-filing.ts) so the two cannot drift.
 *
 * Re-runnable and resumable with no extra bookkeeping: ingestFiling returns
 * `already_ingested` for any accession already at parse_status='ok', and
 * retries 'pending'/'parse_failed' rows in place. Kill it mid-run and re-run
 * the identical command.
 *
 * For the two giant funds, prefer running them alone and shallow:
 *   npx tsx scripts/backfill-institution-filings.ts --slug=citadel-advisors --quarters=2 --no-resolve
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createServerClient } from '../lib/supabase/client';
import {
  ingestFiling,
  list13FFilings,
  EARLIEST_SUPPORTED_PERIOD,
  type IngestTarget,
  type IngestResult,
} from '../lib/institutions/ingest-filing';

/**
 * ingestFiling makes 3 EDGAR requests per filing (index, cover page, info
 * table). One second between filings keeps the sustained rate near 3 req/s
 * against SEC's 10 req/s fair-access ceiling, with parse time as extra slack.
 */
const INTER_FILING_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function flag(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : '';
}

async function main() {
  const slug = flag('slug');
  const quarters = Number(flag('quarters') ?? 5);
  const resolveSymbols = flag('no-resolve') === undefined;
  const dryRun = flag('dry-run') !== undefined;

  if (!Number.isInteger(quarters) || quarters < 1) {
    console.error(`Invalid --quarters=${flag('quarters')}; expected a positive integer.`);
    process.exit(1);
  }

  // tryReserveCredits fails open when Upstash isn't configured, so a laptop
  // run without these would hammer TwelveData unthrottled for hours.
  if (resolveSymbols && !process.env.UPSTASH_REDIS_REST_URL) {
    console.warn(
      'WARNING: UPSTASH_REDIS_REST_URL is unset, so the TwelveData credit budget will fail open.\n' +
        '         Set it, or re-run with --no-resolve, before backfilling a large fund.\n'
    );
  }

  const supabase = createServerClient();
  let query = supabase
    .from('institutional_investors')
    .select('id, slug, cik')
    .eq('is_active', true)
    .order('sort_order');
  if (slug) query = query.eq('slug', slug);

  const { data, error } = await query;
  if (error || !data) {
    console.error('Could not load institutional_investors:', error?.message);
    process.exit(1);
  }
  const investors = data as IngestTarget[];
  if (investors.length === 0) {
    console.error(slug ? `No active fund with slug "${slug}".` : 'No active funds.');
    process.exit(1);
  }

  console.log(
    `Backfilling ${quarters} quarter(s) for ${investors.length} fund(s)` +
      `${resolveSymbols ? '' : ', skipping CUSIP resolution'}${dryRun ? ' (dry run)' : ''}.` +
      `\nRefusing anything filed for a period before ${EARLIEST_SUPPORTED_PERIOD}.\n`
  );

  const tally: Record<string, number> = {};
  const results: Array<IngestResult & { fund: string }> = [];

  for (const investor of investors) {
    const filings = (await list13FFilings(investor.cik)).slice(0, quarters);
    console.log(`${investor.slug} (CIK ${investor.cik}): ${filings.length} filing(s) to consider`);

    for (const filing of filings) {
      if (dryRun) {
        console.log(`  [dry-run] ${filing.accessionNumber} filed ${filing.filingDate}`);
        continue;
      }

      const result = await ingestFiling(supabase, investor, filing, { resolveSymbols });
      tally[result.status] = (tally[result.status] ?? 0) + 1;
      results.push({ ...result, fund: investor.slug });

      const detail =
        result.status === 'ok'
          ? `${result.periodOfReport} · ${result.positions} positions · ${result.resolved} resolved`
          : result.status === 'parse_failed'
            ? `${result.periodOfReport ?? '?'} · ${result.error}`
            : (result.periodOfReport ?? filing.filingDate);
      console.log(`  ${result.status.padEnd(16)} ${detail}`);

      await sleep(INTER_FILING_DELAY_MS);
    }
  }

  if (dryRun) return;

  console.log('\nSummary');
  for (const [status, count] of Object.entries(tally).sort()) {
    console.log(`  ${status.padEnd(16)} ${count}`);
  }

  const failures = results.filter((r) => r.status === 'parse_failed');
  if (failures.length > 0) {
    console.log('\nFailures (re-run the same command to retry these in place):');
    for (const f of failures) console.log(`  ${f.fund} ${f.accessionNumber}: ${f.error}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
