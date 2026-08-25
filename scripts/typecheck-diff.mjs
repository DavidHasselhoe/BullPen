/**
 * Typecheck gate that works on a codebase with pre-existing type debt.
 *
 * WHY THIS EXISTS: `next.config.ts` sets `typescript.ignoreBuildErrors: true`
 * (the Supabase `Database` type is degraded, which produces hundreds of
 * "Property does not exist on type 'never'" errors), so `tsc --noEmit` fails
 * out of the box and is useless as a plain pass/fail gate. But the i18n
 * codemod touches ~465 files, and "the build still succeeds" is not evidence
 * that it didn't break anything.
 *
 * So instead of pass/fail, this compares against a committed baseline and
 * fails only on errors that are NEW. Pre-existing debt is tolerated; newly
 * introduced breakage is not.
 *
 * The baseline key is `file|TScode|message` with the line/column deliberately
 * dropped — a codemod shifts every line in a file it edits, and keying on
 * line number would report the entire file as "new" errors on any edit.
 *
 * Usage:
 *   npm run typecheck          compare against the baseline, exit 1 on new errors
 *   npm run typecheck:update   regenerate the baseline (review the diff!)
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const BASELINE_PATH = 'typecheck-baseline.txt';
const ERROR_RE = /^(.+?)\((\d+),(\d+)\): (error TS\d+): (.*)$/;

/** `file(12,34): error TS2339: msg` -> `file|error TS2339|msg` (line/col dropped). */
function toKey(line) {
  const m = ERROR_RE.exec(line);
  if (!m) return null;
  const [, file, , , code, message] = m;
  return `${file.replace(/\\/g, '/')}|${code}|${message}`;
}

function collectErrors() {
  let out = '';
  try {
    out = execSync('npx tsc --noEmit', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    // tsc exits non-zero when there are errors; that's the normal path here.
    out = `${err.stdout ?? ''}${err.stderr ?? ''}`;
  }
  const keys = [];
  for (const line of out.split(/\r?\n/)) {
    const key = toKey(line.trim());
    if (key) keys.push(key);
  }
  return keys;
}

const update = process.argv.includes('--update');
const keys = collectErrors();

if (update) {
  // Sorted but NOT deduped: the same (file, code, message) can legitimately
  // occur several times in one file at different lines, and the comparison
  // below is count-based. Deduping here would make every 2nd+ occurrence look
  // like a new error on the next run.
  const sorted = [...keys].sort();
  writeFileSync(BASELINE_PATH, sorted.join('\n') + '\n', 'utf8');
  console.log(`Wrote ${sorted.length} baseline entries to ${BASELINE_PATH}`);
  process.exit(0);
}

if (!existsSync(BASELINE_PATH)) {
  console.error(`No ${BASELINE_PATH} found. Run: npm run typecheck:update`);
  process.exit(1);
}

const baselineList = readFileSync(BASELINE_PATH, 'utf8').split(/\r?\n/).filter(Boolean);

// Count occurrences so a second copy of an already-known error in the same
// file still registers as new (the codemod duplicating a broken call, say).
const baselineCounts = new Map();
for (const k of baselineList) baselineCounts.set(k, (baselineCounts.get(k) ?? 0) + 1);
const baseline = new Set(baselineList);

const seen = new Map();
const newErrors = [];
for (const k of keys) {
  const n = (seen.get(k) ?? 0) + 1;
  seen.set(k, n);
  if (n > (baselineCounts.get(k) ?? 0)) newErrors.push(k);
}

const fixed = [...baseline].filter((k) => !seen.has(k));

console.log(`Total errors: ${keys.length} (baseline: ${baseline.size})`);
if (fixed.length > 0) {
  console.log(`\n${fixed.length} baseline error(s) no longer present. Consider: npm run typecheck:update`);
}

if (newErrors.length === 0) {
  console.log('\nNo new type errors.');
  process.exit(0);
}

console.error(`\n${newErrors.length} NEW type error(s):\n`);
for (const k of newErrors) {
  const [file, code, message] = k.split('|');
  console.error(`  ${file}\n    ${code}: ${message}\n`);
}
process.exit(1);
