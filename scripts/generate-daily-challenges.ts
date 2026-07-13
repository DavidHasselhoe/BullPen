/**
 * BullPen Academy — daily challenge pool generator.
 *
 * Drafts one quiz question per day for N days starting from a given date,
 * validates every question against a local Zod schema matching
 * academy_daily_challenges' columns, and emits a reviewable .sql seed to
 * stdout. Writes NOTHING to the database — a human reviews the SQL before
 * it is applied.
 *
 * Usage:
 *   npm run generate-daily-challenges -- 2026-07-14 90 > supabase/seeds/00N_academy_daily_challenges.sql
 *   (args: start date YYYY-MM-DD, count — both optional, default tomorrow / 90)
 *
 * Quality gate: invalid model output is re-prompted up to MAX_RETRIES with the
 * Zod error; if a question is still invalid after that it's skipped (never
 * emits broken SQL) and reported on stderr.
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

const MODEL = 'claude-opus-4-8';
const MAX_RETRIES = 3;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ChallengeSchema = z.object({
  question: z.string(),
  options: z.array(z.string()).min(3).max(4),
  correctIndex: z.number().int().min(0),
  explanation: z.string(),
});
type Challenge = z.infer<typeof ChallengeSchema>;

// Topics mirror the four live beginner courses so the daily pool reinforces
// material a beginner has actually seen, cycling for variety.
const TOPICS = [
  'What a share of stock represents — ownership in a company',
  'The difference between a stock and a bond at a basic level',
  'What a stock exchange does and how a trade gets matched',
  'Reading last price, change, and % change on a quote',
  'What market cap means and how it is calculated',
  'What the 52-week high and low tell you',
  'What trading volume is and what a volume spike signals',
  'Bid, ask, and the spread between them',
  'Why stock prices move — supply, demand, and catalysts',
  'What "priced in" means when a stock does not react to expected news',
  'Reading a candlestick — open, high, low, close',
  'The difference between a 1-day chart and a 1-year chart',
  'What a simple moving average (SMA) shows on a chart',
  'Why diversification reduces risk in a portfolio',
  'The difference between a single stock and an ETF',
  'What dollar-cost averaging means',
];

function systemPrompt(): string {
  return (
    'You are a senior investing educator writing a single daily trivia question for absolute beginners ' +
    'in a Duolingo-style app. Tone: warm, plain-English, concrete, no jargon without explaining it in the ' +
    'explanation. Return ONLY raw JSON — no markdown, no code fences, no prose around it. ' +
    'Shape: {"question":string,"options":string[3 or 4],"correctIndex":int,"explanation":string}. ' +
    'Exactly one correct option. The explanation teaches WHY in 1-2 sentences, referencing the correct answer.'
  );
}

function stripFences(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

async function generateChallenge(topic: string): Promise<Challenge | null> {
  let lastError = '';
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const retryNote = lastError
      ? `\n\nYour previous attempt FAILED schema validation with: ${lastError}\nFix it and return valid JSON only.`
      : '';
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 500,
      system: systemPrompt(),
      messages: [{ role: 'user', content: `Write one question testing this: ${topic}${retryNote}` }],
    });
    const raw = msg.content.find((b) => b.type === 'text');
    const text = raw && raw.type === 'text' ? stripFences(raw.text) : '';
    try {
      const parsed = JSON.parse(text);
      const result = ChallengeSchema.safeParse(parsed);
      if (result.success) return result.data;
      lastError = JSON.stringify(result.error.issues.slice(0, 4));
    } catch (e) {
      lastError = `JSON parse error: ${(e as Error).message}`;
    }
    process.stderr.write(`  ↻ attempt ${attempt} failed (${lastError.slice(0, 120)})\n`);
  }
  process.stderr.write(`  ✗ skipped after ${MAX_RETRIES} failed attempts: "${topic}"\n`);
  return null;
}

function sqlStr(v: string): string {
  return `'${v.replace(/'/g, "''")}'`;
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    process.stderr.write('❌ ANTHROPIC_API_KEY not set in .env.local\n');
    process.exit(1);
  }

  const startArg = process.argv[2];
  const countArg = process.argv[3];
  const tomorrow = addDays(new Date().toISOString().slice(0, 10), 1);
  const startDate = startArg ?? tomorrow;
  const count = countArg ? parseInt(countArg, 10) : 90;

  process.stderr.write(`\n📅 Generating ${count} daily challenges starting ${startDate} (${MODEL})\n`);

  const rows: string[] = [];
  for (let i = 0; i < count; i++) {
    const topic = TOPICS[i % TOPICS.length];
    const date = addDays(startDate, i);
    process.stderr.write(`  • ${date} — ${topic.slice(0, 50)}…\n`);
    const c = await generateChallenge(topic);
    if (!c) continue;
    rows.push(
      `  (${sqlStr(date)}, ${sqlStr(c.question)}, ${sqlStr(JSON.stringify(c.options))}::jsonb, ${c.correctIndex}, ${sqlStr(c.explanation)}, 15)`
    );
  }

  if (rows.length === 0) {
    process.stderr.write('❌ No challenges generated successfully.\n');
    process.exit(1);
  }

  process.stderr.write(`✅ ${rows.length}/${count} challenges validated. Emitting SQL to stdout.\n\n`);

  const lines: string[] = [];
  lines.push(`-- BullPen Academy — generated daily challenge pool (${rows.length} questions, from ${startDate})`);
  lines.push(`-- Generated by scripts/generate-daily-challenges.ts. Review before applying.`);
  lines.push(`-- Re-runnable: ON CONFLICT (challenge_date) DO NOTHING.`);
  lines.push('');
  lines.push(`INSERT INTO academy_daily_challenges (challenge_date, question, options, correct_index, explanation, xp_reward) VALUES`);
  lines.push(rows.join(',\n'));
  lines.push(`ON CONFLICT (challenge_date) DO NOTHING;`);
  lines.push('');

  process.stdout.write(lines.join('\n'));
}

main().catch((err) => {
  process.stderr.write(`\n❌ ${err.message}\n`);
  process.exit(1);
});
