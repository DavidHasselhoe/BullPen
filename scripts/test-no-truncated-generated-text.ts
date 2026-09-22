/**
 * Guardrail: model-written prose must never be silently cut off.
 *   npm run test-no-truncated-text
 *
 * The rule (CLAUDE.md, "Never cut off generated text"): a sentence ending in
 * "…" with no way to read the rest is the app admitting there is more and
 * refusing to show it. In generated content the cut-off half is usually the
 * part carrying the number or the caveat — the risk hero shipped
 * "MU represents 35.3% of the total portfolio, a dangerously high single-stock
 * weig…" for exactly this reason.
 *
 * This scans the surfaces that render model-written content for raw `truncate`
 * / `line-clamp-N` classes. Use `<ClampedText>` instead, which clamps *and*
 * offers Show more.
 *
 * Short labels that genuinely cannot wrap (a ticker, a company name, a sector
 * in a dense row) are still fine. Mark those with a
 * `{/* clamp-ok: <why> *​/}` comment on the line above, which is the point:
 * truncation becomes a decision someone wrote down rather than a default.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Directories whose components render prose written by a model. */
const SCANNED = [
  'components/holdings/risk-analysis',
  'components/tools/portfolio-builder',
  'components/deep-dive',
  'components/ai/cards',
  'components/picks',
];

const TRUNCATING = /\btruncate\b|\bline-clamp-\d\b/;
const MARKER = 'clamp-ok';
/** The component that does this properly; its own source names the classes. */
const ALLOWED_FILES = new Set(['components/ui/ClampedText.tsx']);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

interface Finding {
  file: string;
  line: number;
  text: string;
}

function scan(): Finding[] {
  const findings: Finding[] = [];

  for (const dir of SCANNED) {
    for (const file of walk(dir)) {
      const rel = file.replace(/\\/g, '/');
      if (ALLOWED_FILES.has(rel)) continue;

      const lines = readFileSync(file, 'utf8').split(/\r?\n/);
      lines.forEach((line, i) => {
        if (!TRUNCATING.test(line)) return;
        // A comment about truncation is not truncation.
        if (/^\s*(\/\/|\*|\{\/\*)/.test(line) && !line.includes('className')) return;
        const previous = i > 0 ? lines[i - 1] : '';
        if (line.includes(MARKER) || previous.includes(MARKER)) return;
        findings.push({ file: rel, line: i + 1, text: line.trim() });
      });
    }
  }

  return findings;
}

const findings = scan();

if (findings.length > 0) {
  console.error(
    `\nGenerated content must not be truncated without a way to expand it.\n` +
      `${findings.length} unmarked truncation(s):\n`
  );
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}`);
    console.error(`    ${f.text.slice(0, 120)}`);
  }
  console.error(
    `\nFix one of two ways:\n` +
      `  - prose  -> wrap it in <ClampedText> (components/ui/ClampedText.tsx),\n` +
      `              which clamps and offers Show more\n` +
      `  - a short label that cannot wrap -> add {/* clamp-ok: why */} above it\n`
  );
  process.exit(1);
}

console.log(`ok - no unmarked truncation in ${SCANNED.length} generated-content directories`);
