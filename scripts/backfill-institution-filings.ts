/**
 * Seeds quarter-over-quarter history for the 13F tracker by ingesting the
 * newest N filings per fund, not just the newest one.
 *
 * Usage:
 *   npx tsx scripts/backfill-institution-filings.ts [--slug=<fund>] [--quarters=5] [--no-resolve] [--reingest] [--dry-run]
 *   npx tsx scripts/backfill-institution-filings.ts --fill-missing [--dry-run]   (tickers for stored holdings without one)
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
 * --reingest re-parses filings that are already stored, for a parser fix (e.g.
 * migration 138 keeping options apart from shares). Without it those filings
 * report already_ingested and are left as they are.
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
import { resolveHoldingsForFiling } from '../lib/institutions/resolve-cusip';
import type { Raw13FHolding } from '../lib/institutions/parse-13f-xml';

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

/**
 * --fill-missing: resolve every CUSIP that stored holdings carry without a
 * ticker and that was never looked up, biggest position first, then copy the
 * results onto the holdings (fill_13f_symbols_from_cache, migration 172).
 *
 * Exists because a stored filing is never re-resolved, and the resolver gives
 * up once the cron credit budget stays full for 8s: Citadel's ~13,500
 * holdings could never finish in one pass (found 2026-10-15, 3,178 CUSIPs
 * worth $27.9B left). Here the resolver waits for budget instead. ~3 credits
 * per CUSIP at the 400/min cron share, so 3,000 CUSIPs take ~25 minutes.
 */
async function fillMissingSymbols(supabase: ReturnType<typeof createServerClient>, dryRun: boolean) {
  const rows: Array<{ cusip: string; name_of_issuer: string; value_usd: number | null }> = [];
  for (let from = 0; ; from += 1000) {
    // Paged: PostgREST returns at most 1000 rows per request.
    const { data, error } = await supabase
      .from('institutional_holdings')
      .select('cusip, name_of_issuer, value_usd')
      .is('symbol', null)
      .is('put_call', null)
      .order('id')
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as typeof rows));
    if (!data || data.length < 1000) break;
  }

  const byCusip = new Map<string, Raw13FHolding>();
  for (const r of rows) {
    const prev = byCusip.get(r.cusip);
    const value = Number(r.value_usd ?? 0);
    if (!prev || value > prev.valueUsd) {
      byCusip.set(r.cusip, { cusip: r.cusip, nameOfIssuer: r.name_of_issuer, valueUsd: value, shares: 0, shareType: null, putCall: null });
    }
  }

  // Skip CUSIPs already tried (a map row with symbol null): retrying those
  // spends credits on the same no-match.
  const tried = new Set<string>();
  const cusips = [...byCusip.keys()];
  for (let i = 0; i < cusips.length; i += 300) {
    const { data } = await supabase.from('cusip_ticker_map').select('cusip').in('cusip', cusips.slice(i, i + 300));
    for (const m of (data ?? []) as Array<{ cusip: string }>) tried.add(m.cusip);
  }
  const todo = [...byCusip.values()].filter((h) => !tried.has(h.cusip)).sort((a, b) => b.valueUsd - a.valueUsd);
  console.log(`${rows.length} holdings without a ticker, ${byCusip.size} distinct CUSIPs, ${todo.length} never looked up.`);
  if (dryRun || todo.length === 0) return;

  // One CUSIP per call so progress shows and a kill loses nothing: every
  // resolution is written to cusip_ticker_map as it happens.
  let resolved = 0;
  for (let i = 0; i < todo.length; i++) {
    const [h] = await resolveHoldingsForFiling([todo[i]], { budgetWaitMs: 5 * 60_000 });
    if (h.symbol) resolved++;
    if ((i + 1) % 50 === 0 || i === todo.length - 1) console.log(`  ${i + 1}/${todo.length} looked up, ${resolved} resolved`);
  }

  const { data: filled, error } = await supabase.rpc('fill_13f_symbols_from_cache' as never);
  if (error) throw error;
  console.log(`Filled ${filled} holdings. Clear the institutions:% rows in market_data_cache so pages show it.`);
}

async function main() {
  const slug = flag('slug');
  const quarters = Number(flag('quarters') ?? 5);
  const resolveSymbols = flag('no-resolve') === undefined;
  const dryRun = flag('dry-run') !== undefined;
  const reingest = flag('reingest') !== undefined;

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

  if (flag('fill-missing') !== undefined) {
    await fillMissingSymbols(supabase, dryRun);
    return;
  }

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

      const result = await ingestFiling(supabase, investor, filing, { resolveSymbols, reingest });
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
