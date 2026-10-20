/**
 * BullPen Academy — daily challenge top-up.
 *
 * Keeps academy_daily_challenges filled from today (ET) through DAYS_AHEAD
 * days out. Called daily by /api/cron/top-up-daily-challenges, so in steady
 * state each run writes one new day; after an outage it backfills every gap.
 * Written straight to the table, no review gate (same as the Weekly Pick):
 * every question is Zod-validated and a failed day is simply retried by the
 * next run, never written broken.
 *
 * Topics rotate across every published course (academy_courses) and, within
 * a course, its lessons. The rotation is keyed off the challenge date, so a
 * re-run for the same day asks for the same topic.
 *
 * Correct answers come out B-biased; the player shuffles display order
 * (optionOrder), so stored order is left alone.
 *
 * Cost: Claude Haiku 5.5 at $0.10/$0.50 per MTok, ~300 input + ~600 output
 * tokens a question, about $0.0003 a day (~$0.005 for a full 15-day backfill).
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { todayInET } from '@/lib/academy/streak';
import { logAiCall } from '@/lib/billing/log-ai-call';

export const DAILY_CHALLENGE_MODEL = 'claude-haiku-5-5';
export const DAYS_AHEAD = 14;
const MAX_RETRIES = 3;

const ChallengeSchema = z.object({
  question: z.string().min(1),
  options: z.array(z.string().min(1)).min(3).max(4),
  correctIndex: z.number().int().min(0),
  explanation: z.string().min(1),
}).refine((c) => c.correctIndex < c.options.length, { message: 'correctIndex out of range' });
type Challenge = z.infer<typeof ChallengeSchema>;

const DASH = /[–—]/;
// The player shuffles options (optionOrder), so "option B" points at the wrong one.
export const POSITIONAL = /\b(?:option|answer|choice)\s+[A-D1-4]\b|\b(?:first|second|third|fourth|last)\s+(?:option|answer|choice)\b/i;

const SYSTEM_PROMPT =
  'You are a senior investing educator writing a single daily trivia question for a ' +
  'Duolingo-style investing app whose users are mostly beginners. Tone: warm, plain-English, ' +
  'concrete, no jargon without explaining it in the explanation. Return ONLY raw JSON, no ' +
  'markdown, no code fences, no prose around it. ' +
  'Shape: {"question":string,"options":string[3 or 4],"correctIndex":int,"explanation":string}. ' +
  'Exactly one correct option. The explanation teaches WHY in 1-2 sentences, referencing the correct answer. ' +
  'Options are shown in shuffled order, so never refer to an option by letter or position ' +
  '("option B", "the second answer"); name its content instead. Keep all options similar in length ' +
  'so the correct one does not stand out. ' +
  'Never use an em dash or en dash in any string field; use a period, comma, or colon instead.';

function stripFences(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

export interface Topic {
  course: string;
  lesson: string;
  difficulty: string;
}

/** Days since 1970-01-01 for a YYYY-MM-DD date: the rotation key. */
function dayNumber(isoDate: string): number {
  return Math.round(Date.parse(isoDate + 'T00:00:00Z') / 86_400_000);
}

/** Course = day mod #courses, lesson = (day div #courses) mod #lessons. */
export function topicForDate(isoDate: string, courses: { title: string; difficulty: string; lessons: string[] }[]): Topic {
  const n = dayNumber(isoDate);
  const c = courses[n % courses.length];
  const lesson = c.lessons.length ? c.lessons[Math.floor(n / courses.length) % c.lessons.length] : c.title;
  return { course: c.title, lesson, difficulty: c.difficulty };
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function generateChallenge(
  anthropic: Anthropic,
  topic: Topic,
  usage: { input: number; output: number },
): Promise<Challenge | null> {
  let lastError = '';
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const retryNote = lastError
      ? `\n\nYour previous attempt FAILED validation with: ${lastError}\nFix it and return valid JSON only.`
      : '';
    const msg = await anthropic.messages.create({
      model: DAILY_CHALLENGE_MODEL,
      max_tokens: 4000,
      output_config: { effort: 'low' },
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content:
          `Write one question from the "${topic.course}" course, lesson "${topic.lesson}" ` +
          `(${topic.difficulty} level). Keep it answerable by someone who has taken that lesson.${retryNote}`,
      }],
    });
    usage.input += msg.usage.input_tokens;
    usage.output += msg.usage.output_tokens;
    const raw = msg.content.find((b) => b.type === 'text');
    const text = raw && raw.type === 'text' ? stripFences(raw.text) : '';
    try {
      const result = ChallengeSchema.safeParse(JSON.parse(text));
      if (!result.success) {
        lastError = JSON.stringify(result.error.issues.slice(0, 4));
      } else if (DASH.test(JSON.stringify(result.data))) {
        lastError = 'a string field contains an em dash or en dash';
      } else if (POSITIONAL.test(result.data.explanation)) {
        lastError = 'the explanation refers to an option by letter or position; options are shuffled, name its content';
      } else {
        return result.data;
      }
    } catch (e) {
      lastError = `JSON parse error: ${(e as Error).message}`;
    }
  }
  return null;
}

export interface TopUpResult {
  checked: number;
  missing: string[];
  written: string[];
  failed: string[];
  inputTokens: number;
  outputTokens: number;
}

/** Fill every empty day from today (ET) through DAYS_AHEAD days out. */
export async function topUpDailyChallenges(supabase: SupabaseClient): Promise<TopUpResult> {
  const today = todayInET();
  const dates = Array.from({ length: DAYS_AHEAD + 1 }, (_, i) => addDays(today, i));

  const { data: existing, error: existingErr } = await supabase
    .from('academy_daily_challenges')
    .select('challenge_date')
    .gte('challenge_date', dates[0])
    .lte('challenge_date', dates[dates.length - 1]);
  if (existingErr) throw new Error(`read challenges: ${existingErr.message}`);
  const have = new Set((existing ?? []).map((r: { challenge_date: string }) => r.challenge_date));
  const missing = dates.filter((d) => !have.has(d));

  const result: TopUpResult = { checked: dates.length, missing, written: [], failed: [], inputTokens: 0, outputTokens: 0 };
  if (!missing.length) return result;

  const { data: courseRows, error: courseErr } = await supabase
    .from('academy_courses')
    .select('title, difficulty, order_index, academy_lessons(title, order_index)')
    .eq('is_published', true)
    .order('order_index');
  if (courseErr || !courseRows?.length) throw new Error(`read courses: ${courseErr?.message ?? 'none published'}`);
  const courses = (courseRows as Array<{
    title: string; difficulty: string | null; academy_lessons: Array<{ title: string; order_index: number }>;
  }>).map((c) => ({
    title: c.title,
    difficulty: c.difficulty ?? 'beginner',
    lessons: [...(c.academy_lessons ?? [])].sort((a, b) => a.order_index - b.order_index).map((l) => l.title),
  }));

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const usage = { input: 0, output: 0 };

  for (const date of missing) {
    const topic = topicForDate(date, courses);
    let c: Challenge | null = null;
    try {
      c = await generateChallenge(anthropic, topic, usage);
    } catch (err) {
      console.error(`[daily-challenges] ${date} generation threw:`, err);
    }
    if (!c) { result.failed.push(date); continue; }

    // ignoreDuplicates: a concurrent run that already filled this day wins.
    const { error } = await supabase.from('academy_daily_challenges').upsert({
      challenge_date: date,
      question: c.question,
      options: c.options,
      correct_index: c.correctIndex,
      explanation: c.explanation,
      xp_reward: 15,
    }, { onConflict: 'challenge_date', ignoreDuplicates: true });
    if (error) { result.failed.push(date); console.error(`[daily-challenges] ${date} insert:`, error.message); continue; }
    result.written.push(date);
  }

  result.inputTokens = usage.input;
  result.outputTokens = usage.output;
  await logAiCall({
    userId: null,
    feature: 'daily_challenge',
    model: DAILY_CHALLENGE_MODEL,
    inputTokens: usage.input,
    outputTokens: usage.output,
    status: result.failed.length ? 'error' : 'success',
    metadata: { written: result.written, failed: result.failed },
  });
  return result;
}
