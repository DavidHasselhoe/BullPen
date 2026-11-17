// Live check of the watchlist theme picker (lib/watchlist/ai-picks.ts).
// Each theme is two Haiku 5.5 calls, about half a cent. Logged with no user.
//   npm run test-ai-picks -- "AI power infrastructure" "GLP-1 weight loss drugs"
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import assert from 'assert';
import { pickStocksForTheme, parseJsonArray } from '../lib/watchlist/ai-picks';

// Free checks first: a self-corrected answer must yield its final array (seen live on "GLP-1").
assert.deepStrictEqual(parseJsonArray('["A","B"]'), ['A', 'B']);
assert.deepStrictEqual(parseJsonArray('["A","X"]\n\nWait, X is not listed:\n\n["A"]\n\nFinal answer:\n\n["A","B"]'), ['A', 'B']);
assert.deepStrictEqual(parseJsonArray('[{"ticker":"A","reason":"r"}]'), [{ ticker: 'A', reason: 'r' }]);
assert.deepStrictEqual(parseJsonArray('no array here'), []);
assert.deepStrictEqual(parseJsonArray('[broken'), []);
console.log('parseJsonArray ok');

async function main() {
  const themes = process.argv.slice(2);
  if (!themes.length) return;
  for (const theme of themes) {
    const t0 = Date.now();
    const picks = await pickStocksForTheme(null, theme, 'en');
    console.log(`\n${theme}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    if (picks.length > 5) throw new Error('more than 5 picks');
    for (const p of picks) console.log(`  ${p.ticker.padEnd(6)} ${p.name}\n         ${p.reason}`);
    if (!picks.length) console.log('  (no match)');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
