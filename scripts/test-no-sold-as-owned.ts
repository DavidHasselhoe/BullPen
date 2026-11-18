/**
 * Guardrail: a fully sold position must never count as owned.
 *   npm run test-no-sold-as-owned
 *
 * Selling everything keeps the user_holdings row at quantity 0 (sale history,
 * undo, chart markers), so every plain read of that table returns stocks the
 * user no longer has. That leaked into Washington, Discover, the calendar,
 * Bull, the social feed and the morning email's "Your stocks", one caller at a
 * time, because each new read had to remember a filter.
 *
 * Every `.from('user_holdings').select(...)` must now either filter with
 * OPEN_POSITION_FILTER in the same chain, or carry a
 * `// closed-ok: <why>` comment within the 3 lines above it, which makes
 * "this read wants sold rows too" a decision someone wrote down.
 * Client code goes through useHoldings(), which is open-only by default.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['app', 'lib', 'hooks', 'components'];
/** The module that owns the table: getHoldings applies the filter itself, the rest are by-id writes. */
const OWNER = join('lib', 'holdings', 'holdings-db.ts');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const failures: string[] = [];
for (const file of ROOTS.flatMap(walk)) {
  if (file === OWNER) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (!/from\(\s*['"]user_holdings['"]\s*\)/.test(line)) return;
    // The query chain: from this line to the first one ending the statement.
    let end = i;
    while (end < lines.length - 1 && !/[;,]\s*$/.test(lines[end]) && end - i < 12) end++;
    const chain = lines.slice(i, end + 1).join('\n');
    if (!/\.select\(/.test(chain)) return; // writes and deletes
    if (chain.includes('OPEN_POSITION_FILTER')) return;
    if (lines.slice(Math.max(0, i - 3), i + 1).some((l) => l.includes('closed-ok:'))) return;
    failures.push(`${file}:${i + 1}  ${line.trim()}`);
  });
  // The table name passed on as a value (countBy(supabase, 'user_holdings', ...),
  // pagedRows('user_holdings')): the filter must be within a few lines either way.
  // ponytail: a nearby-lines window, not a data-flow trace; tighten if a helper hides the filter further away.
  lines.forEach((line, i) => {
    if (!/['"]user_holdings['"]/.test(line) || /from\(\s*['"]user_holdings['"]\s*\)/.test(line) || /^\s*(\/\/|\*)/.test(line)) return;
    const near = lines.slice(Math.max(0, i - 8), i + 9);
    if (near.some((l) => l.includes('OPEN_POSITION_FILTER') || l.includes('closed-ok:'))) return;
    failures.push(`${file}:${i + 1}  ${line.trim()}`);
  });
}

if (failures.length) {
  console.error(
    `✗ ${failures.length} user_holdings read(s) would treat sold positions as owned.\n` +
      `  Add .or(OPEN_POSITION_FILTER), or a "// closed-ok: <why>" comment above if sold rows are wanted.\n\n` +
      failures.map((f) => `  ${f}`).join('\n'),
  );
  process.exit(1);
}
console.log('✓ every user_holdings read filters out sold positions or says why not');
