/**
 * Bull's Weekly Pick: the generation pipeline (v2, from 2026-Q4).
 *
 *   1. Screen     Deterministic value/quality/momentum/low-risk ranking within
 *                 sector. Chooses the 25-name shortlist. No LLM, ~0 credits.
 *   2. Ground     Our own numbers per name (peer medians, Health Score, live
 *                 quote). 25 credits for the batched quote.
 *   3. Diligence  Opus 5.5 with web search: does recent news confirm or
 *                 contradict the numbers? Rejects value traps and red flags.
 *   4. Commit ×3  Opus 5.5, no web, three independent runs in parallel. Each
 *                 argues bull and bear for every finalist, then picks one.
 *                 Two or more agreeing wins; otherwise a tie-break call.
 *
 * Why this shape: the evidence for LLMs in stock selection puts the model on
 * top of a systematic signal, not in place of one, and independent judgments
 * aggregated beat a single one. Details and sources in
 * lib/picks/factor-screen.ts and lib/ai/picks/system-prompt.ts.
 *
 * Nothing here writes to the database. The cron route persists the returned
 * row; the dry-run script (scripts/test-weekly-pick.ts) prints it.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/supabase/client';
import { logAiCall } from '@/lib/billing/log-ai-call';
import { getLogoUrl } from '@/lib/twelvedata/twelvedata-client';
import { runFactorScreen, describeScreen, type ScreenResult } from '@/lib/picks/factor-screen';
import { quarterOf, quarterRange, quarterLabel } from '@/lib/picks/quarters';
import {
  DILIGENCE_SYSTEM_PROMPT, buildDiligencePrompt,
  COMMIT_SYSTEM_PROMPT, buildCommitPrompt,
  TIEBREAK_SYSTEM_PROMPT, buildTiebreakPrompt,
} from './system-prompt';
import {
  parseDiligence, parseModelPick, parseTiebreak,
  type DiligenceReview, type ModelPick, type StoredThesis,
} from './schema';
import { groundCandidates, formatScorecards, toMetricsSnapshot, type GroundedCandidate } from './ground-candidates';

export const PICK_MODEL = 'claude-opus-5-5';

/** Picks this recent are never re-screened. 26 weekly picks ≈ half a year. */
const EXCLUDE_WINDOW = 26;
/** A sector with this many picks already in the quarter is left out of the screen. */
const SECTOR_CAP_PER_QUARTER = 3;
const MAX_FINALISTS = 8;
const COMMIT_RUNS = 3;
/** Roughly one search per screened name, per the diligence prompt. */
const DILIGENCE_MAX_SEARCHES = 25;

export type PipelineStage = 'screen' | 'ground' | 'diligence' | 'commit' | 'validate';

export interface PipelineTrace {
  screen?: ScreenResult;
  groundingRejected?: Record<string, string>;
  diligence?: DiligenceReview[];
  finalists?: string[];
  votes?: Array<string | null>;
  tiebreak?: { symbol: string; reason: string };
  costTokens: { input: number; output: number };
  /** Wall-clock ms at the end of each stage, from pipeline start. The route has 300s. */
  timingsMs: Partial<Record<PipelineStage, number>>;
}

export type PipelineResult =
  | { ok: true; row: Record<string, unknown>; chosen: GroundedCandidate; pick: ModelPick; trace: PipelineTrace }
  | { ok: false; stage: PipelineStage; error: string; trace: PipelineTrace };

interface PriorPick {
  symbol: string;
  pick_date: string;
  sector: string | null;
  headline: string;
  thesis: StoredThesis | null;
}

/** Normalised for comparison: "AI Data-Center Capex" and "ai data center capex" match. */
const themeKey = (t: string | undefined | null) => (t ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * The model's final answer: the trailing run of text blocks. Web search
 * interleaves narration and tool blocks before it; thinking blocks can sit
 * anywhere and aren't output.
 */
function tailText(content: Anthropic.ContentBlock[]): string {
  const tail: string[] = [];
  for (let i = content.length - 1; i >= 0; i--) {
    const block = content[i];
    if (block.type === 'text') tail.unshift(block.text);
    else if (block.type === 'thinking' || block.type === 'redacted_thinking') continue;
    else break;
  }
  return tail.join('').trim();
}

async function callClaude(
  client: Anthropic,
  trace: PipelineTrace,
  opts: { feature: string; system: string; user: string; webSearch?: boolean; maxTokens: number; meta: Record<string, unknown> },
): Promise<string> {
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: opts.user }];
  let input = 0;
  let output = 0;

  // A server-tool turn can come back as pause_turn when its internal loop hits
  // its iteration limit; resending the partial turn lets it continue.
  for (let attempt = 0; attempt < 4; attempt++) {
    const final = await client.messages.stream({
      model: PICK_MODEL,
      max_tokens: opts.maxTokens,
      // Opus 5.5: thinking can't be disabled and sampling params are rejected.
      // Effort defaults to medium on this model, so it's set explicitly.
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
      system: [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }],
      // allowed_callers: ['direct'] keeps web search call-and-respond. The
      // default caller routes through code execution and ran away for 5+
      // minutes in lib/instagram/content/earnings-web-search.ts.
      ...(opts.webSearch && {
        tools: [{
          type: 'web_search_20260209' as const,
          name: 'web_search' as const,
          max_uses: DILIGENCE_MAX_SEARCHES,
          allowed_callers: ['direct' as const],
        }],
      }),
      messages,
    }).finalMessage();

    input += final.usage.input_tokens;
    output += final.usage.output_tokens;

    if (final.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: final.content });
      continue;
    }

    trace.costTokens.input += input;
    trace.costTokens.output += output;
    void logAiCall({
      userId: null, feature: opts.feature, model: PICK_MODEL,
      inputTokens: input, outputTokens: output, metadata: opts.meta,
    });

    if (final.stop_reason === 'refusal') throw new Error(`${opts.feature}: model refused`);
    if (final.stop_reason === 'max_tokens') throw new Error(`${opts.feature}: hit max_tokens`);
    return tailText(final.content);
  }
  throw new Error(`${opts.feature}: still paused after 4 turns`);
}

function formatQuarterPicks(picks: PriorPick[]): string {
  if (picks.length === 0) return '(none yet, this is the first pick of the quarter)';
  return picks
    .map((p) => `- ${p.pick_date}: ${p.symbol} (${p.sector ?? 'sector n/a'}; theme: ${p.thesis?.theme ?? 'not recorded'}) "${p.headline}"`)
    .join('\n');
}

function formatDiligence(reviews: DiligenceReview[]): string {
  return reviews
    .map((r) => [
      `### ${r.symbol}  (theme: ${r.theme})`,
      `News: ${r.news}`,
      `Red flags: ${r.redFlags.length ? r.redFlags.join('; ') : 'none found'}`,
      `Catalyst: ${r.catalyst ?? 'none identified'}`,
    ].join('\n'))
    .join('\n\n');
}

export async function runWeeklyPickPipeline(params: { todayET: string }): Promise<PipelineResult> {
  const { todayET } = params;
  const trace: PipelineTrace = { costTokens: { input: 0, output: 0 }, timingsMs: {} };
  const started = Date.now();
  const mark = (stage: PipelineStage) => { trace.timingsMs[stage] = Date.now() - started; };
  const fail = (stage: PipelineStage, error: string): PipelineResult => ({ ok: false, stage, error, trace });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const supabase = createServerClient();

  const today = new Date(`${todayET}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
  const quarter = quarterOf(todayET);
  const { start: quarterStart } = quarterRange(quarter);

  // ── Prior picks: exclusions + this quarter's context ────────────────────────
  const { data: prior } = await supabase
    .from('ai_stock_picks')
    .select('symbol, pick_date, sector, headline, thesis')
    .order('pick_date', { ascending: false })
    .limit(EXCLUDE_WINDOW)
    .returns<PriorPick[]>();

  const priorPicks = prior ?? [];
  const quarterPicks = priorPicks.filter((p) => p.pick_date >= quarterStart);
  const sectorCounts = new Map<string, number>();
  for (const p of quarterPicks) if (p.sector) sectorCounts.set(p.sector, (sectorCounts.get(p.sector) ?? 0) + 1);
  const blockedSectors = new Set([...sectorCounts].filter(([, n]) => n >= SECTOR_CAP_PER_QUARTER).map(([s]) => s));
  const lastTheme = themeKey(priorPicks[0]?.thesis?.theme);

  // ── 1. Screen ──────────────────────────────────────────────────────────────
  let screen: ScreenResult;
  try {
    screen = await runFactorScreen({ exclude: new Set(priorPicks.map((p) => p.symbol)), blockedSectors });
  } catch (err) {
    return fail('screen', err instanceof Error ? err.message : 'screen failed');
  }
  trace.screen = screen;
  mark('screen');
  if (screen.shortlist.length < 5) return fail('screen', `only ${screen.shortlist.length} names passed the screen`);

  // ── 2. Ground ──────────────────────────────────────────────────────────────
  const sectorHint = new Map(screen.shortlist.map((s) => [s.ticker, s.sector]));
  const { survivors, rejected } = await groundCandidates(
    screen.shortlist.map((s) => ({ symbol: s.ticker, reason: describeScreen(s) })),
    sectorHint,
  );
  trace.groundingRejected = rejected;
  mark('ground');
  if (survivors.length < 3) return fail('ground', `only ${survivors.length} names survived grounding`);

  // ── 3. Diligence ───────────────────────────────────────────────────────────
  let reviews: DiligenceReview[];
  try {
    const text = await callClaude(client, trace, {
      feature: 'weekly_pick_diligence',
      system: DILIGENCE_SYSTEM_PROMPT,
      user: buildDiligencePrompt({ today, scorecards: formatScorecards(survivors) }),
      webSearch: true,
      maxTokens: 32000,
      meta: { date: todayET, names: survivors.length },
    });
    reviews = parseDiligence(text);
  } catch (err) {
    return fail('diligence', err instanceof Error ? err.message : 'diligence failed');
  }
  trace.diligence = reviews;
  mark('diligence');

  // Only names we actually sent, the model advanced, and that don't repeat
  // last week's theme. Kept in screen order, capped.
  const bySymbol = new Map(survivors.map((s) => [s.symbol, s]));
  const advanced = reviews.filter((r) =>
    r.verdict === 'advance' && bySymbol.has(r.symbol) && (!lastTheme || themeKey(r.theme) !== lastTheme));
  const advancedSet = new Set(advanced.map((r) => r.symbol));
  const finalists = survivors.filter((s) => advancedSet.has(s.symbol)).slice(0, MAX_FINALISTS);
  trace.finalists = finalists.map((f) => f.symbol);
  if (finalists.length < 2) return fail('diligence', `only ${finalists.length} names advanced`);

  const finalistReviews = finalists.map((f) => advanced.find((r) => r.symbol === f.symbol)!);
  const scorecards = formatScorecards(finalists);

  // ── 4. Commit ×3, independent, in parallel ────────────────────────────────
  const commitUser = buildCommitPrompt({
    today,
    quarterLabel: quarterLabel(quarter),
    scorecards,
    diligence: formatDiligence(finalistReviews),
    quarterPicks: formatQuarterPicks(quarterPicks),
  });
  const settled = await Promise.allSettled(
    Array.from({ length: COMMIT_RUNS }, (_, run) =>
      callClaude(client, trace, {
        feature: 'weekly_pick_commit',
        system: COMMIT_SYSTEM_PROMPT,
        user: commitUser,
        maxTokens: 32000,
        meta: { date: todayET, run, finalists: finalists.length },
      }).then(parseModelPick)),
  );

  const finalistSet = new Set(finalists.map((f) => f.symbol));
  const valid: ModelPick[] = [];
  for (const s of settled) {
    if (s.status === 'fulfilled' && finalistSet.has(s.value.symbol)) valid.push(s.value);
    else if (s.status === 'rejected') console.error('[weekly-pick] a commit run failed:', s.reason);
    else if (s.status === 'fulfilled') console.error(`[weekly-pick] a commit run chose ${s.value.symbol}, not a finalist`);
  }
  trace.votes = settled.map((s) => (s.status === 'fulfilled' ? s.value.symbol : null));
  mark('commit');
  // One valid run can't show agreement or be tie-broken: publish nothing.
  if (valid.length < 2) return fail('commit', `only ${valid.length} of ${COMMIT_RUNS} commit runs produced a valid pick`);

  const tally = new Map<string, number>();
  for (const p of valid) tally.set(p.symbol, (tally.get(p.symbol) ?? 0) + 1);
  const [leader, leaderVotes] = [...tally].sort((a, b) => b[1] - a[1])[0];
  let winner = leader;

  if (leaderVotes < 2) {
    // Every valid run chose differently. One more call decides between them.
    try {
      const text = await callClaude(client, trace, {
        feature: 'weekly_pick_tiebreak',
        system: TIEBREAK_SYSTEM_PROMPT,
        user: buildTiebreakPrompt({
          scorecards,
          arguments: valid.map((p, i) =>
            `### Analyst ${i + 1}: ${p.symbol} (conviction ${p.conviction})\n${p.headline}\n` +
            p.thesis.sections.map((s) => `${s.title}: ${s.body}`).join('\n') +
            `\nRisks: ${p.risks.map((r) => r.title).join('; ')}`).join('\n\n'),
        }),
        maxTokens: 16000,
        meta: { date: todayET, choices: valid.map((p) => p.symbol) },
      });
      const decision = parseTiebreak(text);
      if (!tally.has(decision.symbol)) return fail('commit', `tie-break chose ${decision.symbol}, not one of the three`);
      trace.tiebreak = decision;
      winner = decision.symbol;
    } catch (err) {
      return fail('commit', `tie-break failed: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  // The winner's thesis comes from its highest-conviction run.
  const pick = valid.filter((p) => p.symbol === winner).sort((a, b) => b.conviction - a.conviction)[0];
  const chosen = bySymbol.get(winner);
  if (!chosen) return fail('validate', `symbol ${winner} was not on the shortlist`);

  let logoUrl = chosen.logoUrl;
  if (!logoUrl) {
    try { logoUrl = await getLogoUrl(chosen.symbol); } catch { /* keep null */ }
  }

  const thesis: StoredThesis = {
    sections: pick.thesis.sections,
    evidence: pick.thesis.evidence,
    invalidation: pick.invalidation,
    theme: pick.theme,
    quarterCheckpoint: pick.quarterCheckpoint,
  };

  const row = {
    pick_date: todayET,
    symbol: chosen.symbol,
    company_name: chosen.name,
    logo_url: logoUrl,
    sector: chosen.sector,
    // entry_price / benchmark_entry_price stay NULL, stamped from the first
    // regular-session open once it exists. See lib/picks/performance.ts.
    headline: pick.headline,
    one_liner: pick.oneLiner,
    catalyst_type: pick.catalystType,
    conviction: pick.conviction,
    horizon: pick.horizon,
    thesis,
    risks: pick.risks,
    metrics_snapshot: {
      ...toMetricsSnapshot(chosen),
      pipeline: 'v2',
      convictionReason: pick.convictionReason,
      // How many of the independent runs landed on this name. An honest,
      // visible measure of how clear the call was.
      vote: { agreed: tally.get(winner) ?? 1, of: COMMIT_RUNS, tiebreak: trace.tiebreak ?? null },
      diligence: finalistReviews.find((r) => r.symbol === winner) ?? null,
      debate: pick.debate,
      // The whole screened basket, stored so the method can be judged later:
      // pick vs SPY, basket vs SPY (did the factors work?), pick vs basket
      // (did the LLM layer add anything?).
      screen: screen.shortlist.map((s) => ({ ticker: s.ticker, sector: s.sector, composite: s.composite, scores: s.scores })),
      // The full argument, stage by stage, so a run can be audited afterwards
      // (npm run check-weekly-pick): every diligence verdict, every commit
      // run's choice and debate, and what the pipeline cost.
      audit: {
        quarter,
        screenExcluded: screen.excluded,
        universeSize: screen.universeSize,
        blockedSectors: [...blockedSectors],
        lastTheme: priorPicks[0]?.thesis?.theme ?? null,
        groundingRejected: rejected,
        diligence: reviews,
        finalists: finalists.map((f) => f.symbol),
        runs: settled.map((s) => s.status === 'fulfilled'
          ? {
              symbol: s.value.symbol, valid: finalistSet.has(s.value.symbol), conviction: s.value.conviction,
              convictionReason: s.value.convictionReason, theme: s.value.theme, headline: s.value.headline,
              debate: s.value.debate,
            }
          : { error: String(s.reason).slice(0, 500) }),
        tiebreak: trace.tiebreak ?? null,
        timingsMs: trace.timingsMs,
        tokens: trace.costTokens,
      },
    },
    model: PICK_MODEL,
  };

  return { ok: true, row, chosen, pick, trace };
}
