/**
 * One-off: re-runs mergeNasdaqIntoEarningsDay over every cached earnings day,
 * against Nasdaq's rows for that date (free, works for past dates). Cleans
 * the cloned-beat batches cached before 2026-10-01, which a refetch can't fix:
 * a past day's refetch keeps every previously cached row, and TD's past-date
 * feed is mostly noise anyway.
 *
 *   npx tsx scripts/repair-earnings-calendar-cache.ts           dry run
 *   npx tsx scripts/repair-earnings-calendar-cache.ts --apply   write
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { mergeNasdaqIntoEarningsDay, NASDAQ_MERGE_DAYS_AHEAD } from '../lib/market-data/calendar-days';
import { fetchNasdaqEarningsDay } from '../lib/market-data/nasdaq-earnings-calendar';
import type { EarningsCalendarItem } from '../lib/twelvedata/twelvedata-client';
import { addDays, todayET } from '../lib/dates/calendar-format';

const apply = process.argv.includes('--apply');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const eps = (r: EarningsCalendarItem) => `${r.eps_estimate ?? '-'}/${r.eps_actual ?? '-'}`;

async function main() {
  const { data, error } = await supabase
    .from('market_data_cache')
    .select('cache_key, payload')
    .like('cache_key', 'calendar-day:earnings:US:%')
    .order('cache_key');
  if (error) throw error;

  let changedDays = 0;
  for (const { cache_key, payload } of data ?? []) {
    const date = cache_key.slice(-10);
    const rows = payload as EarningsCalendarItem[];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    // Past the Nasdaq merge window a refresh is TD-only and would undo this.
    if (date > addDays(todayET(), NASDAQ_MERGE_DAYS_AHEAD)) continue;

    const nasdaq = await fetchNasdaqEarningsDay(date);
    const fixed = mergeNasdaqIntoEarningsDay(rows, nasdaq, date);

    const after = new Map(fixed.map((r) => [r.symbol.toUpperCase(), r]));
    const dropped = rows.filter((r) => !after.has(r.symbol.toUpperCase())).map((r) => r.symbol);
    const changed = rows.flatMap((r) => {
      const a = after.get(r.symbol.toUpperCase());
      return a && (eps(a) !== eps(r) || !!a.date_estimated !== !!r.date_estimated) ? [`${r.symbol} ${eps(r)} -> ${eps(a)}${a.date_estimated ? ' (estimated)' : ''}`] : [];
    });
    const added = fixed.length - (rows.length - dropped.length);
    if (dropped.length === 0 && changed.length === 0 && added === 0) continue;

    changedDays++;
    console.log(`${date}  nasdaq=${nasdaq.length}  dropped ${dropped.length}, eps/flag changed ${changed.length}, added ${added}`);
    if (dropped.length) console.log(`  dropped: ${dropped.slice(0, 15).join(',')}${dropped.length > 15 ? ',…' : ''}`);
    for (const c of changed.slice(0, 8)) console.log(`  ${c}`);

    if (apply) {
      const { error: writeError } = await supabase.from('market_data_cache').update({ payload: fixed }).eq('cache_key', cache_key);
      if (writeError) console.error(`  write failed: ${writeError.message}`);
    }
  }
  console.log(`\n${changedDays} of ${data?.length ?? 0} cached days ${apply ? 'repaired' : 'would change (dry run, pass --apply)'}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
