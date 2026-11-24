/**
 * Fill a hole in one member's stored congressional trades: rows the vendor
 * has between two batches we stored. Trump's 2026-11-24 filing outgrew the
 * refresh's old 500-row re-fetch, so his rows 500+ (trades dated Aug 1 to
 * Sep 2) were never stored. The refresh now pages instead (ingestPolitician);
 * this fills what was already lost.
 *
 *   npm run backfill-congress-gap -- --slug donald-trump --dry-run [--start 500]
 *   npm run backfill-congress-gap -- --slug donald-trump --start 500 --end <from the dry run> [--max-credits 4000]
 *
 * Every vendor call is billed (15 + 1 per row, 5 per executive-branch row).
 * A dry run only sizes the hole, one row per probe, and prints what filling it
 * costs; it writes nothing. A real run with --start and --end re-checks both
 * edges (the list moves when the member files again), then fetches the hole
 * and stores it through the refresh's own write path:
 *   - stamped with the arrival time of the filing it belongs to (the stored
 *     row just above the hole), so the page doesn't show it as a new filing
 *   - no notifications: users were told about that filing when it arrived
 *   - congress: cache flushed, as the refresh does
 */

import { config } from 'dotenv';

config({ path: '.env.local' });

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const num = (name: string) => (arg(name) != null ? Number(arg(name)) : undefined);

async function main() {
  const slug = arg('slug');
  const dryRun = process.argv.includes('--dry-run');
  const start = num('start');
  const end = num('end');
  const maxCredits = num('max-credits') ?? 4000;
  if (!slug) throw new Error('--slug is required');
  if (!dryRun && (start == null || end == null)) throw new Error('a real run needs --start and --end from a dry run');

  const { createServerClient } = await import('../lib/supabase/client');
  const { fetchTrades, storeTrades } = await import('../lib/congress/ingest-trades');
  const { findGap } = await import('../lib/congress/gap-search');
  const { invalidateCachedPrefix } = await import('../lib/cache/market-data-cache');
  const supabase = createServerClient();

  const { data: member, error } = await supabase
    .from('congress_politicians')
    .select('id, slug, dc_politician_id, display_name')
    .eq('slug', slug)
    .single<{ id: string; slug: string; dc_politician_id: number; display_name: string }>();
  if (error || !member) throw new Error(`no member ${slug}: ${error?.message}`);

  let spent = 0;
  let perRow = 1; // learned from the first bill: 5 for an executive-branch member
  const ids = new Map<number, number>(); // offset -> vendor trade id, for the stamp lookup
  const probe = async (offset: number): Promise<boolean | null> => {
    if (spent >= maxCredits) throw new Error(`stopped: ${spent} credits reached the --max-credits ${maxCredits}`);
    const { trades, creditsCharged } = await fetchTrades(member.dc_politician_id, 1, offset);
    spent += creditsCharged;
    if (trades.length === 0) return null;
    perRow = Math.max(1, creditsCharged - 15);
    ids.set(offset, trades[0].id);
    const { data } = await supabase.from('congress_trades').select('dc_trade_id').eq('dc_trade_id', trades[0].id).maybeSingle();
    return !!data;
  };

  const { count: storedCount } = await supabase
    .from('congress_trades')
    .select('id', { count: 'exact', head: true })
    .eq('politician_id', member.id);

  let gap: { start: number; end: number; toHistoryEnd: boolean } | null;
  if (dryRun) {
    console.log(`${member.display_name}: ${storedCount} trades stored. Sizing the hole, one billed row per probe...`);
    gap = await findGap(probe, { start, upperBound: storedCount ?? 0 });
  } else {
    // Only the four edge rows: the list moves when the member files again,
    // and a shifted window would store the wrong rows' neighbours and miss others.
    const [aboveStart, atStart, beforeEnd, atEnd] = [
      await probe(start! - 1), await probe(start!), await probe(end! - 1), await probe(end!),
    ];
    if (aboveStart !== true || atStart !== false || beforeEnd !== false || atEnd === false) {
      throw new Error(`the hole moved since the dry run (edges ${aboveStart}/${atStart}/${beforeEnd}/${atEnd}): run --dry-run again`);
    }
    gap = { start: start!, end: end!, toHistoryEnd: atEnd === null };
  }

  if (!gap) {
    console.log(`No hole found. Spent ${spent} credits.`);
    return;
  }
  const rows = gap.end - gap.start;
  const pages = Math.ceil(rows / 200);
  const fillCost = pages * 15 + rows * perRow;
  console.log(
    `Hole: rows ${gap.start} to ${gap.end - 1} (${rows} trades)${gap.toHistoryEnd ? ', running to the end of their history' : ''}.`,
  );
  console.log(`Sizing spent ${spent} credits. Filling it costs ~${fillCost} credits (${pages} calls, ${perRow} per row).`);
  if (dryRun) {
    console.log(`Dry run, nothing written. To fill: --start ${gap.start} --end ${gap.end}${fillCost + spent > maxCredits ? ` --max-credits ${fillCost + spent + 100}` : ''}`);
    return;
  }
  if (spent + fillCost > maxCredits) throw new Error(`filling would reach ${spent + fillCost} credits, over --max-credits ${maxCredits}`);

  // The filing this hole belongs to: the stored row just above it.
  const aboveId = ids.get(gap.start - 1);
  const { data: above } = aboveId
    ? await supabase.from('congress_trades').select('created_at').eq('dc_trade_id', aboveId).maybeSingle<{ created_at: string }>()
    : { data: null };
  if (!above) throw new Error('could not find the stored row above the hole to date the fill');

  const trades = [];
  for (let offset = gap.start; offset < gap.end; offset += 200) {
    const page = await fetchTrades(member.dc_politician_id, Math.min(200, gap.end - offset), offset);
    spent += page.creditsCharged;
    trades.push(...page.trades);
    console.log(`  fetched ${trades.length}/${rows}`);
  }

  const result = await storeTrades(supabase, member, trades, { createdAt: above.created_at });
  if (result.error) throw new Error(`store failed after fetching ${trades.length} trades: ${result.error}`);
  await invalidateCachedPrefix('congress:');
  console.log(
    `Done: ${result.inserted} inserted, ${result.skipped} skipped as already stored or duplicates, dated ${above.created_at}. ${spent} credits in total. No notifications sent.`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  // exitCode, not exit(): exiting with handles open aborts libuv on Windows.
  process.exitCode = 1;
});
