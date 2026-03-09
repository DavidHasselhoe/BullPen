#!/usr/bin/env npx tsx
/**
 * Print BullPen Cursor rules for copy-paste into Rules UI.
 * Run: npx tsx scripts/print-cursor-rules.ts
 *
 * Or use the .cursor/rules/*.mdc files directly — Cursor reads them automatically.
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const RULES_DIR = join(process.cwd(), '.cursor', 'rules');

function main() {
  console.log('# BullPen Cursor Rules\n');
  console.log('Copy the content below into the Rules UI, or rely on .cursor/rules/*.mdc files.\n');
  console.log('---\n');

  try {
    const files = readdirSync(RULES_DIR).filter((f) => f.endsWith('.mdc'));
    for (const file of files) {
      const path = join(RULES_DIR, file);
      const content = readFileSync(path, 'utf-8');
      console.log(`## From ${file}\n`);
      // Strip YAML frontmatter for plain-text output
      const body = content.replace(/^---\n[\s\S]*?\n---\n/, '');
      console.log(body);
      console.log('\n---\n');
    }
  } catch (err) {
    console.error('Failed to read rules:', err);
    process.exit(1);
  }
}

main();
