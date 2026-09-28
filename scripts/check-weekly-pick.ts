/**
 * Audit a published Weekly Pick: print the whole argument, stage by stage, and
 * check that every rule the pipeline promises actually held.
 *
 *   npm run check-weekly-pick                          # latest pick
 *   npm run check-weekly-pick -- --date=2026-10-05     # a specific week
 *   npm run check-weekly-pick -- --out=pick-audit.md   # also save the transcript
 *   npm run check-weekly-pick -- --file=weekly-pick-dryrun.json   # audit a dry run's row
 *
 * Read-only. If the latest week failed instead of publishing, it prints the
 * failure trace the cron stored in ai_usage (feature 'weekly_pick_failed').
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { readFileSync, writeFileSync } from 'node:fs';
import { createServerClient } from '../lib/supabase/client';
import { quarterOf, quarterRange } from '../lib/picks/quarters';
import { MAX_PER_SECTOR, SCREEN_SIZE } from '../lib/picks/factor-screen';

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

const lines: string[] = [];
const out = (s = '') => { lines.push(s); console.log(s); };
let failures = 0;
let warnings = 0;
const results: string[] = [];
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures++;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? `: ${detail}` : ''}`);
}
function warn(name: string, detail: string) {
  warnings++;
  results.push(`WARN  ${name}: ${detail}`);
}

/* eslint-disable @typescript-eslint/no-explicit-any -- jsonb columns, read-only audit */
async function main() {
  const supabase = createServerClient();
  const date = arg('date');

  // --file= reads the row a dry run saved (npm run test-weekly-pick -- --full),
  // so the audit can be checked before anything is published.
  const file = arg('file');
  let row: any;
  if (file) {
    row = { generated_at: new Date().toISOString(), entry_price: null, ...JSON.parse(readFileSync(file, 'utf8')) };
  } else {
    let q = supabase.from('ai_stock_picks').select('*').order('pick_date', { ascending: false }).limit(1);
    if (date) q = supabase.from('ai_stock_picks').select('*').eq('pick_date', date).limit(1);
    const { data: rows } = await q;
    row = rows?.[0];
  }

  // A failure newer than the latest pick means the latest week didn't publish.
  const { data: fails } = await supabase.from('ai_usage').select('created_at, metadata')
    .eq('feature', 'weekly_pick_failed').order('created_at', { ascending: false }).limit(1);
  const lastFail: any = fails?.[0];
  if (!file && lastFail && (!row ||(!date && lastFail.metadata?.date > row.pick_date) || lastFail.metadata?.date === date)) {
    out(`# Weekly Pick ${lastFail.metadata.date}: FAILED at ${lastFail.metadata.stage}`);
    out(`\nError: ${lastFail.metadata.error}\n`);
    out('```json\n' + JSON.stringify(lastFail.metadata, null, 2) + '\n```');
    process.exitCode = 1;
    return finish();
  }
  if (!row) { out('No pick found.'); process.exitCode = 1; return; }

  const snap = row.metrics_snapshot ?? {};
  const audit = snap.audit;
  out(`# Weekly Pick ${row.pick_date}: ${row.symbol} (${row.company_name ?? ''})`);
  out(`\nModel ${row.model} · pipeline ${snap.pipeline ?? 'v1'} · generated ${row.generated_at}`);

  if (!audit) {
    out('\nThis pick predates the v2 audit trail, so there is no argument to replay.');
    check('pick was made by the v2 pipeline', false, `pipeline=${snap.pipeline ?? 'v1'}, model=${row.model}`);
    return finish();
  }

  // ── Stage 1: screen ────────────────────────────────────────────────────────
  out(`\n## 1. Factor screen: ${snap.screen.length} of ${audit.universeSize} ranked stocks`);
  out(`Excluded before ranking: ${JSON.stringify(audit.screenExcluded)}. Blocked sectors: ${audit.blockedSectors.join(', ') || 'none'}.`);
  for (const s of snap.screen) {
    out(`- ${s.ticker} (${s.sector}) composite ${s.composite}: value ${s.scores.value}, quality ${s.scores.quality}, momentum ${s.scores.momentum}, low-risk ${s.scores.risk ?? 'n/a'}`);
  }
  if (Object.keys(audit.groundingRejected ?? {}).length) {
    out(`\nDropped in grounding: ${JSON.stringify(audit.groundingRejected)}`);
  }

  // ── Stage 2: diligence ─────────────────────────────────────────────────────
  const advanced = audit.diligence.filter((r: any) => r.verdict === 'advance');
  out(`\n## 2. Due diligence: ${advanced.length} advanced, ${audit.diligence.length - advanced.length} rejected`);
  for (const r of audit.diligence) {
    out(`\n### ${r.verdict === 'advance' ? 'ADVANCE' : 'REJECT'} ${r.symbol} [${r.theme}]`);
    out(r.news);
    if (r.redFlags?.length) out(`Red flags: ${r.redFlags.join('; ')}`);
    if (r.catalyst) out(`Catalyst: ${r.catalyst}`);
  }

  // ── Stage 3: commit runs ───────────────────────────────────────────────────
  out(`\n## 3. Finalists: ${audit.finalists.join(', ')}`);
  audit.runs.forEach((run: any, i: number) => {
    if (run.error) { out(`\n### Run ${i + 1}: FAILED\n${run.error}`); return; }
    out(`\n### Run ${i + 1} chose ${run.symbol} (conviction ${run.conviction}${run.valid ? '' : ', NOT A FINALIST'})`);
    out(`"${run.headline}"`);
    out(`Why this conviction: ${run.convictionReason}`);
    for (const d of run.debate) out(`- ${d.symbol}\n  Bull: ${d.bull}\n  Bear: ${d.bear}`);
  });
  if (audit.tiebreak) out(`\n### Tie-break chose ${audit.tiebreak.symbol}\n${audit.tiebreak.reason}`);

  // ── The pick ───────────────────────────────────────────────────────────────
  out(`\n## 4. Last one standing: ${row.symbol}, ${snap.vote.agreed} of ${snap.vote.of} runs${snap.vote.tiebreak ? ' + tie-break' : ''}`);
  out(`**${row.headline}**`);
  out(row.one_liner);
  out(`Theme: ${row.thesis?.theme} · Conviction ${row.conviction} · Horizon ${row.horizon} · ${row.catalyst_type}`);
  out(`End of quarter checkpoint: ${row.thesis?.quarterCheckpoint}`);
  out(`Invalidation: ${row.thesis?.invalidation}`);
  out(`\nTimings (ms from start): ${JSON.stringify(audit.timingsMs)}`);

  // ── Checks ─────────────────────────────────────────────────────────────────
  check('model is claude-opus-5-5', row.model === 'claude-opus-5-5', row.model);
  check(`screen has ${SCREEN_SIZE} names`, snap.screen.length === SCREEN_SIZE, String(snap.screen.length));
  const perSector = new Map<string, number>();
  for (const s of snap.screen) perSector.set(s.sector, (perSector.get(s.sector) ?? 0) + 1);
  check(`no sector over ${MAX_PER_SECTOR} in the screen`, [...perSector.values()].every((n) => n <= MAX_PER_SECTOR));

  const { data: prior } = await supabase.from('ai_stock_picks').select('symbol, pick_date, sector, thesis')
    .lt('pick_date', row.pick_date).order('pick_date', { ascending: false }).limit(26);
  const priorSymbols = new Set((prior ?? []).map((p: any) => p.symbol));
  const repeats = snap.screen.filter((s: any) => priorSymbols.has(s.ticker)).map((s: any) => s.ticker);
  check('no recently picked stock in the screen', repeats.length === 0, repeats.join(', '));

  const screened = new Set(snap.screen.map((s: any) => s.ticker));
  check('diligence only reviewed screened names', audit.diligence.every((r: any) => screened.has(r.symbol)));
  const advancedSet = new Set(advanced.map((r: any) => r.symbol));
  check('finalists all advanced in diligence', audit.finalists.every((f: string) => advancedSet.has(f)));
  check('2 to 8 finalists', audit.finalists.length >= 2 && audit.finalists.length <= 8, String(audit.finalists.length));
  check('winner is a finalist', audit.finalists.includes(row.symbol));

  const validRuns = audit.runs.filter((r: any) => !r.error && r.valid);
  const votesForWinner = validRuns.filter((r: any) => r.symbol === row.symbol).length;
  check('vote matches the stored runs', votesForWinner === snap.vote.agreed, `${votesForWinner} vs ${snap.vote.agreed}`);
  check('majority or tie-break', votesForWinner >= 2 || !!audit.tiebreak);
  if (validRuns.length < audit.runs.length) warn('commit runs', `${audit.runs.length - validRuns.length} run(s) failed or chose off-list`);
  for (const r of validRuns) {
    const covered = new Set(r.debate.map((d: any) => d.symbol));
    if (!audit.finalists.every((f: string) => covered.has(f))) warn('debate coverage', `a ${r.symbol} run skipped some finalists`);
  }

  const { start } = quarterRange(quarterOf(row.pick_date));
  const sameSector = (prior ?? []).filter((p: any) => p.pick_date >= start && p.sector === row.sector).length;
  check('sector within the quarter cap (3)', sameSector + 1 <= 3, `${sameSector + 1} ${row.sector} picks this quarter`);
  const key = (t?: string) => (t ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const lastTheme = (prior?.[0] as any)?.thesis?.theme;
  check("theme differs from last week's", !lastTheme || key(lastTheme) !== key(row.thesis?.theme), `${lastTheme}`);

  const copy = [row.headline, row.one_liner, row.thesis?.invalidation, row.thesis?.quarterCheckpoint,
    ...(row.thesis?.sections ?? []).flatMap((s: any) => [s.title, s.body]),
    ...(row.risks ?? []).flatMap((r: any) => [r.title, r.detail])].join('\n');
  check('no em or en dashes in the copy', !/[–—]/.test(copy));
  check('headline within 110 chars', row.headline.length <= 110, String(row.headline.length));

  const genET = new Date(row.generated_at).toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false });
  const [h, m] = genET.split(', ')[1].split(':').map(Number);
  check('published before the 9:30 ET open', h * 60 + m < 9 * 60 + 30, genET);
  const total = Math.max(...Object.values(audit.timingsMs as Record<string, number>));
  check('ran inside the 300s route limit', total < 300_000, `${Math.round(total / 1000)}s`);
  if (total > 240_000) warn('timing', `${Math.round(total / 1000)}s is close to the 300s limit`);
  if (row.entry_price == null) warn('entry price', 'not stamped yet (it is stamped after the first open, on the next /picks load)');
  else results.push(`INFO  entry $${row.entry_price} at the open, SPY $${row.benchmark_entry_price}`);

  const dayStart = `${row.pick_date}T00:00:00Z`;
  const { data: usage } = await supabase.from('ai_usage').select('feature, cost_usd, input_tokens, output_tokens')
    .like('feature', 'weekly_pick_%').neq('feature', 'weekly_pick_thesis')
    .gte('created_at', dayStart).lt('created_at', `${row.pick_date}T23:59:59Z`);
  const byFeature = new Map<string, number>();
  let cost = 0;
  for (const u of usage ?? []) {
    byFeature.set(u.feature, (byFeature.get(u.feature) ?? 0) + 1);
    cost += Number(u.cost_usd ?? 0);
  }
  check('one diligence call', byFeature.get('weekly_pick_diligence') === 1, String(byFeature.get('weekly_pick_diligence') ?? 0));
  check('three commit calls', byFeature.get('weekly_pick_commit') === 3, String(byFeature.get('weekly_pick_commit') ?? 0));
  results.push(`INFO  AI cost that day: $${cost.toFixed(2)} across ${usage?.length ?? 0} calls (no cache discount applied)`);

  return finish();
}

function finish() {
  out('\n## Checks');
  for (const r of results) out(r);
  out(`\n${failures} failed, ${warnings} warnings.`);
  const file = arg('out');
  if (file) { writeFileSync(file, lines.join('\n') + '\n'); console.log(`\nSaved to ${file}`); }
  if (failures) process.exitCode = 1;
}

main().catch((err) => { console.error(err); process.exit(1); });
