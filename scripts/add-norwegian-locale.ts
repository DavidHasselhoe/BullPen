/**
 * One-off script: adds Norwegian as a supported language.
 *  1. Translates "Norwegian" into the 5 existing non-English locales and
 *     patches languages.no into each of their JSON files.
 *  2. Translates the entire en.json object into Norwegian and writes
 *     lib/i18n/locales/no.json.
 *
 * Usage: npm run add-norwegian-locale
 * Run once, after adding "no": "Norwegian" to en.json's languages block.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { translateText } from '../lib/i18n/translate';

const LOCALES_DIR = join(process.cwd(), 'lib', 'i18n', 'locales');
const EXISTING_LANGS = ['es', 'fr', 'de', 'ja', 'zh'];

type LocaleTree = { [key: string]: string | LocaleTree };

async function translateTree(tree: LocaleTree, targetLang: string): Promise<LocaleTree> {
  const out: LocaleTree = {};
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value === 'string') {
      out[key] = await translateText(value, targetLang);
    } else {
      out[key] = await translateTree(value as LocaleTree, targetLang);
    }
  }
  return out;
}

async function main() {
  const enPath = join(LOCALES_DIR, 'en.json');
  const en = JSON.parse(readFileSync(enPath, 'utf-8')) as LocaleTree;
  const enLanguages = en.languages as LocaleTree;

  if (enLanguages?.no !== 'Norwegian') {
    console.error('Add "no": "Norwegian" to en.json\'s languages block before running this script.');
    process.exit(1);
  }

  console.log('1) Patching languages.no into the 5 existing locale files...');
  for (const lang of EXISTING_LANGS) {
    const filePath = join(LOCALES_DIR, `${lang}.json`);
    const locale = JSON.parse(readFileSync(filePath, 'utf-8')) as LocaleTree;
    const translatedLabel = await translateText('Norwegian', lang);
    (locale.languages as LocaleTree).no = translatedLabel;
    writeFileSync(filePath, JSON.stringify(locale, null, 2) + '\n', 'utf-8');
    console.log(`  [${lang}] languages.no = "${translatedLabel}"`);
  }

  console.log('\n2) Generating lib/i18n/locales/no.json from en.json...');
  const no = await translateTree(en, 'no');
  writeFileSync(join(LOCALES_DIR, 'no.json'), JSON.stringify(no, null, 2) + '\n', 'utf-8');
  console.log('  Wrote lib/i18n/locales/no.json');

  console.log('\n✅ Done. Review the diffs, then wire no.json into lib/i18n/config.ts and the Settings language selector.');
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
