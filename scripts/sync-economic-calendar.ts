/**
 * Manual run of the economic-calendar sync the weekly cron performs
 * (/api/cron/sync-economic-calendar). Writes to the Supabase project in
 * .env.local.
 *
 *   npm run sync-economic-calendar
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

(async () => {
  // Imported after dotenv so the Supabase client sees the env.
  const { syncEconomicCalendar } = await import('../lib/market-data/economic-calendar');
  console.log(JSON.stringify(await syncEconomicCalendar(), null, 2));
})();
