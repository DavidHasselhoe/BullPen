/**
 * Trigger the Instagram market-movers generation cron locally for testing.
 * Loads CRON_SECRET from .env.local and calls /api/cron/market-movers-daily.
 *
 * Usage: npm run trigger-market-movers
 *        npm run trigger-market-movers -- --preMarket --context="$NVDA reported earnings after yesterday's close"
 * (Ensure the dev server is running: npm run dev)
 */

import { config } from 'dotenv';

config({ path: '.env.local' });

function argValue(flag: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${flag}=`));
  return arg?.slice(flag.length + 3);
}

async function main() {
  const secret = process.env.CRON_SECRET;
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (!secret) {
    console.error('CRON_SECRET not found in .env.local');
    process.exit(1);
  }

  const preMarket = process.argv.includes('--preMarket');
  const context = argValue('context');

  const params = new URLSearchParams();
  if (preMarket) params.set('preMarket', 'true');
  if (context) params.set('contextNote', context);
  const qs = params.toString();

  const url = `${base}/api/cron/market-movers-daily${qs ? `?${qs}` : ''}`;
  console.log('Calling', url, '...\n');

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${secret}` },
  });

  const body = await res.json();
  console.log('Status:', res.status);
  console.log('Response:', JSON.stringify(body, null, 2));
}

main();
