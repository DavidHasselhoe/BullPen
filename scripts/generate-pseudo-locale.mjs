/**
 * Generates lib/i18n/locales/qa/<ns>.json from the English source — the
 * dev-only pseudo-locale used to find un-extracted strings (see
 * lib/i18n/language-names.ts's PSEUDO_LOCALE doc comment for the full
 * rationale: ignoreBuildErrors: true means neither the build nor a type
 * error catches a literal a codemod missed, but "?bp_lang=qa still shows
 * plain English" does, at a glance, for every route).
 *
 * Every string value gets wrapped in «»  and has its vowels doubled — long
 * enough to double as an early layout-breakage check too (a pseudo-localized
 * string is deliberately ~40% longer than the source).
 *
 * Run after any change to an en/<ns>.json file:
 *   npm run i18n:pseudo
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const LOCALES_DIR = join(process.cwd(), 'lib', 'i18n', 'locales');
const EN_DIR = join(LOCALES_DIR, 'en');
const QA_DIR = join(LOCALES_DIR, 'qa');

function pseudoize(value) {
  if (typeof value !== 'string') return value;
  // Double vowels (case-preserving) to inflate length, but never touch
  // {{interpolation}} placeholders — a codemod-extracted string with a
  // variable must still round-trip through i18next correctly under this
  // locale, or every interpolated string looks like a false "miss".
  const parts = value.split(/(\{\{[^}]+\}\})/g);
  const inflated = parts
    .map((part, i) =>
      i % 2 === 1 ? part : part.replace(/[aeiouAEIOU]/g, (v) => v + v)
    )
    .join('');
  return `«${inflated}»`;
}

function pseudoizeTree(node) {
  if (typeof node === 'string') return pseudoize(node);
  if (node && typeof node === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = pseudoizeTree(v);
    return out;
  }
  return node;
}

mkdirSync(QA_DIR, { recursive: true });

const namespaceFiles = readdirSync(EN_DIR).filter((f) => f.endsWith('.json'));
for (const file of namespaceFiles) {
  const en = JSON.parse(readFileSync(join(EN_DIR, file), 'utf-8'));
  const qa = pseudoizeTree(en);
  writeFileSync(join(QA_DIR, file), JSON.stringify(qa, null, 2) + '\n', 'utf-8');
}

console.log(`Wrote ${namespaceFiles.length} pseudo-locale namespace file(s) to ${QA_DIR}`);
