/**
 * Refreshes lib/market-data/sp500.ts, nasdaq100.ts and dow30.ts against real, current
 * index membership (see lib/market-data/index-sync.ts for the sources).
 *
 * Usage: npm run sync-index-constituents
 * Run weekly by .github/workflows/cron-sync-index-constituents.yml, which
 * commits any resulting file changes straight to preview — the two source
 * feeds are official/fund-mandated daily disclosures, not a scrape that
 * needs a human sanity check before landing.
 *
 * Ensure DISCORD_INDEX_SYNC_WEBHOOK_URL is set in .env.local (optional —
 * skipped with a log line if unset; only used to announce real changes).
 *
 * With INDEX_CHANGES_FILE set, it also writes every membership change and the
 * fresh fund weights to that file as JSON. The workflow POSTs it to
 * /api/cron/record-index-changes, which stores them and notifies watchers and
 * holders. This script never touches the database itself.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fetchSP500Tickers, fetchNasdaq100Tickers, fetchDow30Tickers, diffTickers, type IndexHoldings } from '../lib/market-data/index-sync';
import type { IndexChangesPayload } from '../lib/market-data/index-events';
import type { IndexId } from '../lib/market-data/index-membership';
import { postToDiscord, type DiscordEmbed } from '../lib/discord/post-message';

interface IndexTarget {
  id: IndexId;
  label: string;
  file: string;
  exportName: string;
  sourceNote: string;
  fetch: () => Promise<IndexHoldings>;
}

const TARGETS: IndexTarget[] = [
  {
    id: 'sp500',
    label: 'S&P 500',
    file: join(process.cwd(), 'lib', 'market-data', 'sp500.ts'),
    exportName: 'SP500_TICKERS',
    sourceNote: "State Street's SPY ETF daily holdings disclosure (full-replication S&P 500 tracker).",
    fetch: fetchSP500Tickers,
  },
  {
    id: 'nasdaq100',
    label: 'Nasdaq 100',
    file: join(process.cwd(), 'lib', 'market-data', 'nasdaq100.ts'),
    exportName: 'NASDAQ100_TICKERS',
    sourceNote: "Nasdaq's own official Nasdaq-100 constituents API.",
    fetch: fetchNasdaq100Tickers,
  },
  {
    id: 'dow30',
    label: 'Dow 30',
    file: join(process.cwd(), 'lib', 'market-data', 'dow30.ts'),
    exportName: 'DOW30_TICKERS',
    sourceNote: "State Street's DIA ETF daily holdings disclosure (it holds all 30 Dow Jones Industrial Average stocks).",
    fetch: fetchDow30Tickers,
  },
];

function extractCurrentTickers(source: string, exportName: string): string[] {
  const match = source.match(new RegExp(`export const ${exportName}: string\\[\\] = \\[([\\s\\S]*?)\\];`));
  if (!match) throw new Error(`Could not find ${exportName} array in file`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function formatFile(exportName: string, label: string, sourceNote: string, tickers: string[]): string {
  const rows: string[] = [];
  for (let i = 0; i < tickers.length; i += 10) {
    rows.push('  ' + tickers.slice(i, i + 10).map((t) => `'${t}'`).join(', ') + ',');
  }
  const today = new Date().toISOString().slice(0, 10);
  return `/**
 * ${label} constituent tickers.
 * Source: ${sourceNote}
 * Auto-synced weekly by scripts/sync-index-constituents.ts — do not hand-edit,
 * changes will be overwritten on the next sync run.
 * Last synced: ${today}
 */
export const ${exportName}: string[] = [
${rows.join('\n')}
];
`;
}

async function main() {
  const webhookUrl = process.env.DISCORD_INDEX_SYNC_WEBHOOK_URL;
  const changeSummaries: string[] = [];
  const payload: IndexChangesPayload = { detectedOn: new Date().toISOString().slice(0, 10), events: [], weights: [] };

  for (const target of TARGETS) {
    console.log(`\nSyncing ${target.label}...`);
    const source = readFileSync(target.file, 'utf-8');
    const current = extractCurrentTickers(source, target.exportName);
    const { tickers: fresh, weights } = await target.fetch();
    if (weights) payload.weights.push({ indexId: target.id, asOf: weights.asOf, pct: weights.pct });

    const { added, removed } = diffTickers(current, fresh);
    payload.events.push(
      ...added.map((ticker) => ({ ticker, indexId: target.id, change: 'added' as const })),
      ...removed.map((ticker) => ({ ticker, indexId: target.id, change: 'removed' as const })),
    );
    if (added.length === 0 && removed.length === 0) {
      console.log(`  Up to date (${current.length} tickers).`);
      continue;
    }

    console.log(`  ${current.length} -> ${fresh.length} tickers.`);
    if (added.length > 0) console.log(`  Added: ${added.join(', ')}`);
    if (removed.length > 0) console.log(`  Removed: ${removed.join(', ')}`);

    writeFileSync(target.file, formatFile(target.exportName, target.label, target.sourceNote, fresh));

    const parts: string[] = [];
    if (added.length > 0) parts.push(`**Added:** ${added.join(', ')}`);
    if (removed.length > 0) parts.push(`**Removed:** ${removed.join(', ')}`);
    changeSummaries.push(`**${target.label}** (${current.length} → ${fresh.length})\n${parts.join('\n')}`);
  }

  // Written every run, not only on a change: the weights are refreshed weekly too.
  const outFile = process.env.INDEX_CHANGES_FILE;
  if (outFile) {
    writeFileSync(outFile, JSON.stringify(payload));
    console.log(`\nWrote ${payload.events.length} change(s) and ${payload.weights.length} weight set(s) to ${outFile}.`);
  }

  if (changeSummaries.length === 0) {
    console.log('\nNo index membership changes this week.');
    return;
  }

  console.log('\nChanges written to lib/market-data/. Commit handled by the calling workflow.');

  if (!webhookUrl) {
    console.log('DISCORD_INDEX_SYNC_WEBHOOK_URL not set — skipping Discord notification.');
    return;
  }

  const embed: DiscordEmbed = {
    title: '📊 Index constituents updated',
    description: changeSummaries.join('\n\n'),
    color: 0x22c55e,
    timestamp: new Date().toISOString(),
  };
  await postToDiscord(webhookUrl, { embeds: [embed] });
  console.log('Posted change summary to Discord.');
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
