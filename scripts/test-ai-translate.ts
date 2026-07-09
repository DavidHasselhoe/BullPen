/**
 * Verifies the AI translation engine end-to-end:
 *  1. Translates a sample string into all 6 non-English supported languages
 *     and prints the results for manual quality review.
 *  2. Confirms a repeated call for the same text+language hits the cache
 *     (fast) instead of calling the model again (slow).
 *
 * Usage: npm run test-ai-translate
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { translateText } from '../lib/i18n/translate';

const SAMPLE = 'Stocks will display in their exchange currency (e.g., NOK for Norway, USD for US)';
const LANGUAGES = ['es', 'fr', 'de', 'ja', 'zh', 'no'];

async function main() {
  let failed = false;

  for (const lang of LANGUAGES) {
    const start = Date.now();
    const translated = await translateText(SAMPLE, lang);
    const ms = Date.now() - start;
    console.log(`\n[${lang}] (${ms}ms):\n  ${translated}`);
    if (translated === SAMPLE) {
      console.error(`  ❌ FAIL — translation returned the original English text unchanged`);
      failed = true;
    }
  }

  console.log('\n--- Cache round-trip check ---');
  const cachedStart = Date.now();
  const cached = await translateText(SAMPLE, 'es');
  const cachedMs = Date.now() - cachedStart;
  console.log(`[es] second lookup took ${cachedMs}ms: ${cached}`);
  if (cachedMs > 800) {
    console.warn('  ⚠️  Took over 800ms — expected a fast cache hit, not a fresh model call. Check the cache write in translate.ts.');
  } else {
    console.log('  ✅ Fast — looks like a cache hit.');
  }

  if (failed) process.exit(1);
  console.log('\n✅ All languages produced translated (non-identical) output. Review the printed translations above for quality.');
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
