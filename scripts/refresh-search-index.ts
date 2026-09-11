/**
 * Rebuild the search catalogue from TwelveData (`npm run refresh-search-index`).
 *
 * Same code path the weekly cron runs, called directly. Use this rather than
 * curling the route against a dev server, which can serve a stale compiled copy.
 *
 * Pass parts to rebuild one catalogue at a time, e.g.
 *   npm run refresh-search-index -- funds
 */

import { config } from 'dotenv';
import { refreshSearchIndex, ALL_PARTS, type RefreshPart } from '../lib/search/refresh-index';

config({ path: '.env.local' });

async function main() {
  const started = Date.now();
  const requested = process.argv.slice(2).filter((a): a is RefreshPart =>
    (ALL_PARTS as string[]).includes(a)
  );
  const result = await refreshSearchIndex(requested.length ? requested : ALL_PARTS);
  console.log(JSON.stringify(result, null, 2));
  console.log(`done in ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

void main();
