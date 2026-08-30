/**
 * Trigger the Instagram earnings-results publish cron locally for testing.
 * Loads CRON_SECRET from .env.local and calls /api/cron/instagram-earnings-results-publish.
 *
 * Usage: npm run trigger-instagram-earnings-results-publish
 * (Ensure the dev server is running: npm run dev)
 */

import { config } from 'dotenv';

config({ path: '.env.local' });

async function main() {
  const secret = process.env.CRON_SECRET;
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (!secret) {
    console.error('CRON_SECRET not found in .env.local');
    process.exit(1);
  }

  const url = `${base}/api/cron/instagram-earnings-results-publish`;
  console.log('Calling', url, '...\n');

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${secret}` },
  });

  const body = await res.json();
  console.log('Status:', res.status);
  console.log('Response:', JSON.stringify(body, null, 2));
}

main();
