/**
 * "Where the US economy stands", the short version on /tools/economy.
 *
 * One summary per set of numbers per language, cached in Redis and shared by
 * everyone. It is written from the numbers on the page and nothing else (no
 * web search, no consensus, no forecasts), so it only changes when a release
 * lands, a release date passes, or FRED revises the history: roughly twice per
 * release. A generation is ~2.5k input and ~500 output tokens on Sonnet 5.5,
 * about $0.01.
 *
 * The cache key is a hash of the facts the server built itself. The client
 * passes that hash back only to find the cached answer: on a miss the server
 * rebuilds the facts, so nobody can get a summary written from numbers they
 * made up.
 */

import { createHash } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { languageName } from '@/lib/i18n/language-names';
import { rget, rset, rsetnx, rdel } from '@/lib/cache/redis-cache';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { checkAnthropicDailySpend } from '@/lib/billing/anthropic-spend-guard';
import { anthropicUsage, logAiCall } from '@/lib/billing/log-ai-call';
import { ECONOMIC_KINDS } from '@/lib/market-data/economic-kinds';
import { getEconomyPage, RESULT_KINDS, type EconomyPageData, type MetricKey } from '@/lib/market-data/economic-results';
import { fmtMetric, fmtPeriod, fmtRange } from '@/components/economy/format';
import type { EconomySummary, EconomySummaryResponse } from './economy-summary-shared';

export const ECONOMY_SUMMARY_MODEL = 'claude-sonnet-5-5';

const TTL_SECONDS = 45 * 86_400;
/** Ceiling on generations per day across every visitor and language. Hits are free. */
const DAILY_GENERATIONS = 40;

const key = (hash: string, lang: string) => `economy-summary:v2:${hash}:${lang}`;
/** The newest summary per language, shown while the next one is written. */
const latestKey = (lang: string) => `economy-summary:v2:latest:${lang}`;

const LABEL: Record<MetricKey, string> = {
  rate_upper: 'top of range', rate_lower: 'bottom of range',
  cpi_yoy: 'CPI inflation, past 12 months', cpi_mom: 'CPI, past month',
  core_cpi_yoy: 'core CPI, past 12 months', core_cpi_mom: 'core CPI, past month',
  pce_yoy: 'PCE inflation, past 12 months', pce_mom: 'PCE, past month',
  core_pce_yoy: 'core PCE, past 12 months', core_pce_mom: 'core PCE, past month',
  payrolls: 'jobs added that month', unemployment: 'unemployment rate',
  gdp: 'real GDP growth, annual rate',
  claims: 'new jobless claims that week', claims_4wk: '4-week average of claims',
};

const en = 'en-US';

/** Plain-text facts the summary is written from. Every number here was measured. */
export function economyFacts(pages: EconomyPageData[]): string {
  const lines: string[] = [];
  for (const p of pages) {
    const name = ECONOMIC_KINDS[p.kind].name;
    const next = p.nextRelease ? `Next ${p.kind === 'fomc' ? 'decision' : 'release'}: ${p.nextRelease.date}.` : '';
    if (!p.latest) continue;
    if (p.kind === 'fomc') {
      const upper = p.latest.metrics.find((m) => m.key === 'rate_upper');
      const lower = p.latest.metrics.find((m) => m.key === 'rate_lower');
      if (!upper || !lower) continue;
      const last = p.lastRelease?.verdict ? ` Last meeting ${p.lastRelease.date}: ${p.lastRelease.verdict}.` : '';
      // Worded as a move in points away from a named range: "from 3.50% to 3.75%" read as the move itself.
      const pts = upper.previous == null ? 0 : Math.round((upper.actual - upper.previous) * 100) / 100;
      const change = !pts ? ''
        : ` Last change took effect ${p.latest.period}: ${pts > 0 ? 'raised' : 'lowered'} by ${Math.abs(pts)} percentage points, from the ${fmtRange(lower.previous ?? lower.actual, upper.previous!, en, 'to')} range.`;
      const proj = p.projections.length
        ? ` Fed officials' median projection for year-end rate: ${p.projections.map((x) => `${x.year} ${x.value}%`).join(', ')}.`
        : '';
      lines.push(`${name}: target range ${fmtRange(lower.actual, upper.actual, en, 'to')}.${last}${change}${proj} ${next}`.trim());
      continue;
    }
    const metrics = p.latest.metrics
      .map((m) => `${LABEL[m.key]} ${fmtMetric(m.key, m.actual, en)}${m.previous == null ? '' : ` (period before: ${fmtMetric(m.key, m.previous, en)})`}`)
      .join('; ');
    const head = p.latest.metrics[0]?.key;
    const trend = head
      ? p.history.slice(-13).map((r) => r.values[head] == null ? null : `${fmtPeriod(p.kind, r.period, en, true)} ${fmtMetric(head, r.values[head]!, en)}`).filter(Boolean).join(', ')
      : '';
    lines.push(`${name}, ${fmtPeriod(p.kind, p.latest.period, en)}: ${metrics}. Recent ${LABEL[head!]}: ${trend}. ${next}`.trim());
  }
  return lines.join('\n');
}

export const factsHash = (facts: string) => createHash('sha1').update(facts).digest('hex').slice(0, 16);

/** Structured output: Sonnet 5.5 refuses a forced tool_choice. The caps are repeated in the prompt. */
const SUMMARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    headline: { type: 'string', description: 'One sentence, at most 25 words: where the US economy stands right now.' },
    rates: { type: 'string', description: 'One or two sentences, at most 40 words: what the Fed is doing with interest rates.' },
    inflation: { type: 'string', description: 'One or two sentences, at most 40 words: how fast prices are rising, against the 2% goal.' },
    jobs: { type: 'string', description: 'One or two sentences, at most 40 words: the job market, from the jobs report and jobless claims.' },
    growth: { type: 'string', description: 'One or two sentences, at most 40 words: how fast the economy is growing.' },
    watch: { type: 'string', description: 'One sentence, at most 30 words: the next release worth watching, its date, and the question it answers.' },
  },
  required: ['headline', 'rates', 'inflation', 'jobs', 'growth', 'watch'],
};

let anthropic: Anthropic | null = null;

/** What every economy text is held to, the page summary and the per-release takeaway alike. */
const RULES =
  'You explain the US economy to beginner investors who have never read an economic release. ' +
  'Write only from the numbers you are given: never add a number, forecast, expectation, consensus or market reaction that is not in them, and never guess why a number moved. ' +
  'Say what each number means in everyday words and whether it is getting better, worse or holding steady, using the recent history given. ' +
  "The Fed's inflation goal is 2% a year, measured with PCE: only compare a past-year number with it, never a past-month one. Higher rates make borrowing more expensive and tend to weigh on stocks; lower rates do the opposite. " +
  'No jargon without a plain explanation in the same sentence. No investment advice, no telling anyone to buy or sell. ' +
  "Write the Fed's range as 'the 3.75% to 4.00% range' and describe a change in percentage points. " +
  'Never say which month or quarter an upcoming release covers: a release can revise an earlier period, so name it only by its date. ' +
  'Write dates as month and day. Never use an em dash or en dash to connect clauses; use a period or comma. ';

const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/ [—–] /g, ', ').trim() : '');

const todayET = () => new Date().toLocaleDateString(en, { timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric' });

async function generate(facts: string, lang: string, today: string) {
  anthropic ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await anthropic.messages.create({
    model: ECONOMY_SUMMARY_MODEL,
    max_tokens: 1200,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SUMMARY_SCHEMA } },
    system: RULES +
      'The reader sees each headline number and the one before it right below your text, so do not repeat those numbers: say what they mean and which way they have been heading. ' +
      'Mention only measures named in the numbers you are given; a core measure only in words, never with its own number. ' +
      'Fields: headline is one sentence of at most 25 words; rates, inflation, jobs and growth are one or two sentences of at most 40 words each; watch is one sentence of at most 30 words naming the next release worth watching, its date and the question it answers. ' +
      `Write in ${languageName(lang)}.`,
    messages: [{ role: 'user', content: `Today is ${today}. The latest US economic numbers:\n\n${facts}` }],
  });
  const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  let input: Partial<Record<keyof EconomySummary, unknown>> | null = null;
  try { input = JSON.parse(text); } catch { /* logged as an error below */ }
  const summary: EconomySummary | null = input && clean(input.headline)
    ? {
        headline: clean(input.headline), rates: clean(input.rates), inflation: clean(input.inflation),
        jobs: clean(input.jobs), growth: clean(input.growth), watch: clean(input.watch),
      }
    : null;
  return { summary, usage: res.usage };
}

/**
 * The summary for these numbers in `lang`: cached, or written now when this
 * request wins the lock. Losers get the previous summary (or none) and poll.
 */
export async function resolveEconomySummary(clientHash: string | null, lang: string): Promise<EconomySummaryResponse> {
  if (clientHash) {
    const hit = await rget<EconomySummaryResponse & { status: 'ready' }>(key(clientHash, lang));
    if (hit) return hit;
  }

  // Rebuild the facts ourselves: the client's hash only ever finds, never writes.
  const pages = await Promise.all(RESULT_KINDS.map((k) => getEconomyPage(k)));
  const facts = economyFacts(pages);
  const hash = factsHash(facts);
  if (hash !== clientHash) {
    const hit = await rget<EconomySummaryResponse & { status: 'ready' }>(key(hash, lang));
    if (hit) return hit;
  }

  const previous = await rget<EconomySummaryResponse & { status: 'ready' }>(latestKey(lang));
  const pending: EconomySummaryResponse = { status: 'pending', previous: previous ?? null };
  const lock = `${key(hash, lang)}:lock`;
  if (!(await rsetnx(lock, 90))) return pending;
  try {
    const cap = await checkRateLimit('economy-summary-gen', { windowMs: 86_400_000, maxRequests: DAILY_GENERATIONS });
    const spend = await checkAnthropicDailySpend();
    if (!cap.allowed || !spend.allowed) return previous ?? { status: 'unavailable' };

    const { summary, usage } = await generate(facts, lang, todayET());
    void logAiCall({
      userId: null,
      feature: 'economy_summary',
      model: ECONOMY_SUMMARY_MODEL,
      ...anthropicUsage(usage),
      status: summary ? 'success' : 'error',
      metadata: { lang, hash },
    });
    if (!summary) return previous ?? { status: 'unavailable' };
    const ready: EconomySummaryResponse = { status: 'ready', summary, generatedAt: new Date().toISOString() };
    await Promise.all([rset(key(hash, lang), ready, TTL_SECONDS), rset(latestKey(lang), ready, TTL_SECONDS)]);
    return ready;
  } catch (err) {
    console.error('[economy-summary] generation failed:', err);
    return previous ?? { status: 'unavailable' };
  } finally {
    void rdel(lock);
  }
}

/**
 * One sentence on what a release that just landed means, for its result
 * notification and push. Written once per release from the release's own
 * page facts (about 1k tokens in, 60 out, ~$0.003), cached by event id so a
 * retried notify doesn't pay twice. English only: every account reads English.
 * Null on any failure: the notification goes out without it.
 * ponytail: one language; write per follower language once an account picks another.
 */
export async function releaseTakeaway(eventId: string, page: EconomyPageData, decision?: string): Promise<string | null> {
  const cacheKey = `economy-takeaway:v1:${eventId}`;
  const hit = await rget<string>(cacheKey);
  if (hit) return hit;
  try {
    if (!(await checkAnthropicDailySpend()).allowed) return null;
    anthropic ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const facts = [decision, economyFacts([page])].filter(Boolean).join('\n');
    const res = await anthropic.messages.create({
      model: ECONOMY_SUMMARY_MODEL,
      max_tokens: 300,
      output_config: { effort: 'low' },
      system: RULES +
        'Reply with one sentence of at most 30 words, nothing else: what this release, which came out today, says about the economy. ' +
        'Do not repeat the headline number; the reader already sees it. Write in English.',
      messages: [{ role: 'user', content: `Today is ${todayET()}. ${ECONOMIC_KINDS[page.kind].name} just came out:\n\n${facts}` }],
    });
    const text = clean(res.content.map((b) => (b.type === 'text' ? b.text : '')).join(''));
    void logAiCall({
      userId: null,
      feature: 'economy_takeaway',
      model: ECONOMY_SUMMARY_MODEL,
      ...anthropicUsage(res.usage),
      status: text ? 'success' : 'error',
      metadata: { kind: page.kind, eventId },
    });
    if (!text) return null;
    await rset(cacheKey, text, 7 * 86_400);
    return text;
  } catch (err) {
    console.error('[economy-takeaway] failed:', err);
    return null;
  }
}
