/**
 * Phase 1 verification script for the AI-powered transaction importer.
 * Run against a real broker export to prove the parsing pipeline end to
 * end, independent of any UI:
 *
 *   npm run test-import -- "path/to/file.csv"
 *   npm run test-import -- "path/to/file.csv" --no-ai
 *
 * Exits non-zero on any assertion failure. The hard gate is step 4:
 * buys + sells + ignored + errors === dataRowCount. That single invariant
 * is the whole argument for schema-mapping over per-row AI extraction,
 * made executable.
 */
import { readFileSync } from 'fs';
import { basename } from 'path';
import { parseImportFile } from '../lib/import/parse-file';
import { resolveSecurity } from '../lib/import/resolve-security';
import { planReplay } from '../lib/import/plan-replay';

async function main() {
  const args = process.argv.slice(2);
  const filePath = args.find((a) => !a.startsWith('--'));
  const useAi = !args.includes('--no-ai');

  if (!filePath) {
    console.error('Usage: npm run test-import -- "path/to/file.csv" [--no-ai]');
    process.exit(1);
  }

  const bytes = readFileSync(filePath);
  let failed = false;
  const assert = (cond: boolean, label: string) => {
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}`);
    if (!cond) failed = true;
  };

  console.log(`Parsing ${filePath} (useAi=${useAi})...\n`);

  const result = await parseImportFile(new Uint8Array(bytes), basename(filePath), { useAi });

  console.log(`[1] encoding ${result.encoding}   delimiter ${JSON.stringify(result.delimiter)}`);
  console.log(`[2] grid  ${result.grid.rows.length} rows x ${result.grid.columnCount} cols   ragged ${result.grid.ragged.length}`);

  const dupHeaders = new Map<string, number[]>();
  result.grid.header.forEach((h, i) => {
    const list = dupHeaders.get(h) ?? [];
    list.push(i);
    dupHeaders.set(h, list);
  });
  for (const [h, idxs] of dupHeaders) {
    if (idxs.length > 1) console.log(`    duplicate header "${h}" @ [${idxs.join(',')}]`);
  }

  console.log(`\n[3] mapping spec  (source=${result.specSource}${result.model ? `, model=${result.model}` : ''}, ${result.inputTokens} in / ${result.outputTokens} out tokens)`);
  console.log('    columns:', JSON.stringify(result.spec.columns));
  console.log('    decimalSeparator:', result.spec.decimalSeparator, ' dateFormat:', result.spec.dateFormat, ' dateAmbiguous:', result.spec.dateAmbiguous);
  console.log('    transactionTypes:', result.spec.transactionTypes.map((t) => `${t.value}=${t.action}`).join(', '));
  console.log(`    consistency check: ${result.consistency.checked - result.consistency.failed}/${result.consistency.checked} within tolerance -> ${result.consistency.verdict}`);

  const buys = result.transactions.filter((t) => t.action === 'BUY').length;
  const sells = result.transactions.filter((t) => t.action === 'SELL').length;
  const total = result.transactions.length + result.ignored.length + result.rowErrors.length;

  console.log(`\n[4] applied  ${result.transactions.length} transactions (${buys} BUY, ${sells} SELL) + ${result.ignored.length} ignored + ${result.rowErrors.length} errors = ${total}`);
  const ignoredByType: Record<string, number> = {};
  for (const row of result.ignored) ignoredByType[row.typeValue] = (ignoredByType[row.typeValue] ?? 0) + 1;
  console.log('    ignored by type:', ignoredByType);
  if (result.rowErrors.length > 0) {
    console.log('    row errors:', result.rowErrors);
  }

  const distinctSecurities = new Set(result.transactions.map((t) => t.securityKey));
  console.log(`\n[5] securities  ${distinctSecurities.size} distinct`);
  const bySecurity = new Map<string, typeof result.transactions>();
  for (const t of result.transactions) {
    const list = bySecurity.get(t.securityKey) ?? [];
    list.push(t);
    bySecurity.set(t.securityKey, list);
  }
  const resolveFlag = args.includes('--resolve');
  let totalCredits = 0;
  let resolvedCount = 0;
  let proxyCount = 0;
  let unmatchedCount = 0;
  const bySecurityKeySymbol = new Map<string, { symbol: string; name: string | null }>();

  for (const [key, txns] of bySecurity) {
    const first = txns[0];
    const label = `${(first.isin ?? '(no isin)').padEnd(14)} ${(first.name ?? first.rawSymbol ?? '?').padEnd(38)} ${txns.length} txn(s), currency ${first.priceCurrency}`;

    if (!resolveFlag) {
      console.log(`    ${label}`);
      continue;
    }

    const resolution = await resolveSecurity({
      isin: first.isin,
      rawSymbol: first.rawSymbol,
      name: first.name,
      priceCurrency: first.priceCurrency,
    });
    totalCredits += resolution.creditsUsed;

    if (resolution.status === 'resolved') {
      resolvedCount++;
      bySecurityKeySymbol.set(key, { symbol: resolution.candidate.symbol, name: first.name });
      console.log(`    ${label}`);
      console.log(`        -> ${resolution.candidate.symbol}  ${resolution.candidate.mic_code}  ${resolution.candidate.currency}  quote=${resolution.quote.close}  credits=${resolution.creditsUsed}  RESOLVED`);
    } else if (resolution.status === 'proxy_suggested') {
      proxyCount++;
      console.log(`    ${label}`);
      console.log(`        -> PROXY ${resolution.suggestion.symbol}  ${resolution.suggestion.mic_code}  ${resolution.suggestion.currency}  quote=${resolution.quote.close}  credits=${resolution.creditsUsed}  (wanted ${resolution.wanted?.symbol ?? '?'} but it does not quote)`);
    } else {
      unmatchedCount++;
      console.log(`    ${label}`);
      console.log(`        -> UNMATCHED  credits=${resolution.creditsUsed}  best guesses: ${resolution.bestGuesses.map((g) => `${g.symbol}/${g.mic_code}/${g.currency}`).join(', ') || '(none found)'}`);
    }
  }

  if (resolveFlag) {
    console.log(`\n    resolution summary: ${resolvedCount} resolved, ${proxyCount} proxy, ${unmatchedCount} unmatched, ${totalCredits} TwelveData credits total`);

    const resolvedTxns = result.transactions.filter((t) => bySecurityKeySymbol.has(t.securityKey));
    const plan = planReplay(resolvedTxns, bySecurityKeySymbol, new Map());

    console.log(`\n[6] replay plan (dry run, ${resolvedTxns.length} resolved transactions)`);
    for (const p of plan.projections) {
      console.log(`    ${p.symbol.padEnd(8)} qty ${p.finalQuantity.toFixed(4).padStart(10)}   avg ${p.weightedAvgCost.toFixed(2).padStart(10)}   realized ${p.realizedPl >= 0 ? '+' : ''}${p.realizedPl.toFixed(2)}`);
    }
    console.log(`    flags: ${plan.flags.length}`, plan.flags);
  }

  console.log('\n--- assertions ---');
  assert(total === result.grid.rows.length, `transactions + ignored + errors (${total}) === data rows (${result.grid.rows.length})`);
  assert(result.rowErrors.length === 0, 'zero row errors');
  assert(result.consistency.verdict !== 'suspect', 'consistency check is not "suspect"');

  console.log(failed ? '\nFAILED' : '\nALL PASSED');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
