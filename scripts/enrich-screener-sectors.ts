/**
 * One-off catch-up: /profile sector lookups for screener stocks no table knows
 * a sector for, largest market cap first. 10 TwelveData credits per ticker,
 * paced under the cron credit share.
 *
 *   npm run enrich-screener-sectors -- --dry-run          # count + cost, free
 *   npm run enrich-screener-sectors -- --limit=250        # the $2B+ names
 *
 * The weekly sync-institutional-holdings cron tops up 20 a week after this.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createServerClient } from '../lib/supabase/client';
import { enrichHoldingSectors } from '../lib/institutions/enrich-holding-sectors';

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 1000;
  const supabase = createServerClient();

  if (process.argv.includes('--dry-run')) {
    const { data, error } = await supabase.rpc('screener_symbols_missing_sector', { p_limit: limit });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { symbol: string; market_cap: number | null }[];
    console.log(`${rows.length} candidates, ~${rows.length * 10} credits`);
    console.log('largest:', rows.slice(0, 10).map((r) => r.symbol).join(', '));
    return;
  }

  const result = await enrichHoldingSectors(supabase, { limit, source: 'screener' });
  console.log(result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
