// Fills company_descriptions (migration 199) for every screener stock of $1B+
// that has no description yet. TwelveData /profile is 10 credits a call, so
// batches reserve against the shared cron budget. Safe to re-run: it only
// fetches tickers that are still missing.
//   npm run backfill-company-descriptions            (all missing)
//   npm run backfill-company-descriptions -- --limit 50
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';
import { getCompanyProfile } from '../lib/twelvedata/twelvedata-client';
import { waitForCronCreditBudget } from '../lib/twelvedata/credit-budget';
import { AI_PICK_MIN_MARKET_CAP } from '../lib/watchlist/ai-picks';

const BATCH = 20; // 200 credits, under the 400 cron share
const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Infinity;

async function pageAll<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await fetchPage(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

async function main() {
  const supabase = createServerClient();
  const stocks = await pageAll<{ ticker: string }>((a, b) =>
    supabase.from('screener_stats').select('ticker').gte('market_cap', AI_PICK_MIN_MARKET_CAP).order('ticker').range(a, b));
  const have = new Set((await pageAll<{ ticker: string }>((a, b) =>
    supabase.from('company_descriptions').select('ticker').order('ticker').range(a, b))).map((r) => r.ticker));
  const missing = stocks.map((s) => s.ticker).filter((t) => !have.has(t)).slice(0, LIMIT);
  console.log(`${stocks.length} stocks >= $1B, ${have.size} described, fetching ${missing.length} (~${missing.length * 10} credits)`);

  let saved = 0, empty = 0, failed = 0;
  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    await waitForCronCreditBudget(batch.length * 10);
    const rows = await Promise.all(batch.map(async (ticker) => {
      try {
        const p = await getCompanyProfile(ticker);
        if (!p.description || p.description.length < 40) { empty++; return null; }
        return { ticker, description: p.description, updated_at: new Date().toISOString() };
      } catch (err) {
        failed++;
        console.error(`  ${ticker}: ${err instanceof Error ? err.message : err}`);
        return null;
      }
    }));
    const good = rows.filter((r): r is NonNullable<typeof r> => r !== null);
    if (good.length) {
      const { error } = await supabase.from('company_descriptions').upsert(good);
      if (error) throw error;
      saved += good.length;
    }
    console.log(`${Math.min(i + BATCH, missing.length)}/${missing.length}  saved=${saved} empty=${empty} failed=${failed}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
