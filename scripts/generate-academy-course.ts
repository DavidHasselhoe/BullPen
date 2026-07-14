/**
 * BullPen Academy — AI-assisted course generator.
 *
 * Drafts lesson content with Claude, validates EVERY lesson against the Zod
 * schemas in types/academy.ts, prefers canonical glossary definitions for
 * highlighted terms, and emits a reviewable .sql seed to stdout. Writes NOTHING
 * to the database — a human reviews the SQL before it is applied.
 *
 * Usage:
 *   1. Edit the OUTLINE constant below (or pass an outline JSON path as argv[2]).
 *   2. npm run generate-course > supabase/seeds/00N_academy_<slug>.sql
 *   3. Review the generated SQL for accuracy + tone.
 *   4. Apply via Supabase MCP apply_migration (or run the seed).
 *
 * Quality gate: invalid model output is re-prompted up to MAX_RETRIES with the
 * Zod error; if still invalid the script aborts (never emits broken SQL).
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';
config({ path: resolve(process.cwd(), '.env.local') });

import Anthropic from '@anthropic-ai/sdk';
import {
  ReadContentSchema,
  QuizContentSchema,
  MatchContentSchema,
  ScenarioContentSchema,
  type LessonType,
} from '../types/academy';
import { GLOSSARY, getGlossaryEntry } from '../lib/finance/glossary';
import { z } from 'zod';

// ─── Model + retries ──────────────────────────────────────────────────────────
// Use a strong model for content quality (per CLAUDE.md). Override with argv flag if needed.
const MODEL = 'claude-opus-4-8';
const MAX_RETRIES = 3;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Outline types ──────────────────────────────────────────────────────────

interface LessonSpec {
  slug: string;
  title: string;
  type: LessonType;
  topic: string;        // what this lesson should teach — the prompt seed
  xpReward: number;
}

interface CourseOutline {
  slug: string;
  title: string;
  description: string;
  icon: string;         // lucide icon name, e.g. 'TrendingUp'
  color: string;        // theme color token, e.g. 'emerald'
  orderIndex: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  /** Gate behind a Pro subscription. Defaults to false (beginner courses are free). */
  requiresPro?: boolean;
  lessons: LessonSpec[];
}

// ─── Default outline (edit me, or pass a JSON path as argv[2]) ─────────────────
// Example: course #2 in the roadmap. Replace freely.

const DEFAULT_OUTLINE: CourseOutline = {
  slug: 'dividends-income',
  title: 'Dividends & Passive Income',
  description:
    'Some stocks pay you to hold them. Learn how dividend yield, payout ratio, and ex-dividend dates actually work.',
  icon: 'Wallet',
  color: 'blue',
  orderIndex: 6,
  difficulty: 'beginner',
  lessons: [
    { slug: 'what-is-a-dividend', title: 'What is a Dividend?', type: 'read', topic: 'What a dividend is (a cash payment to shareholders), how dividend yield is calculated, and why not every company pays one (e.g. growth companies reinvesting profit instead).', xpReward: 10 },
    { slug: 'payout-ratio-and-sustainability', title: 'Payout Ratio & Sustainability', type: 'read', topic: 'What the payout ratio is (dividends paid ÷ net income) and how to use it to judge whether a dividend looks safe or is at risk of being cut.', xpReward: 10 },
    { slug: 'dividends-quiz', title: 'Quick Check: Dividends', type: 'quiz', topic: 'Test understanding of dividend yield, payout ratio, and ex-dividend date. 3 questions.', xpReward: 20 },
    { slug: 'dividend-terms-match', title: 'Match the Dividend Terms', type: 'match', topic: 'Match dividend terms (Dividend Yield, Payout Ratio, Ex-Dividend Date, Dividend Aristocrat) to their plain-English definitions.', xpReward: 15 },
    { slug: 'too-good-to-be-true', title: 'Too Good to Be True?', type: 'scenario', topic: 'A beginner finds a stock with an unusually high dividend yield (e.g. 15%) and is excited about the income. They must investigate the payout ratio and recent price decline before deciding whether it\'s a genuine opportunity or a yield trap. Reward checking payout ratio and business health over chasing yield alone.', xpReward: 25 },
  ],
};

// ─── Per-type schema + prompt ──────────────────────────────────────────────────

const SCHEMA_BY_TYPE: Record<LessonType, z.ZodTypeAny> = {
  read: ReadContentSchema,
  quiz: QuizContentSchema,
  match: MatchContentSchema,
  scenario: ScenarioContentSchema,
};

const GLOSSARY_TERMS = Object.keys(GLOSSARY);

function systemPromptFor(type: LessonType): string {
  const base =
    'You are a senior investing educator writing for absolute beginners in a Duolingo-style app. ' +
    'Tone: warm, plain-English, concrete, no jargon without explaining it. ' +
    'Return ONLY raw JSON — no markdown, no code fences, no prose around it.';

  const shapes: Record<LessonType, string> = {
    read:
      'Shape: {"sections":[{"text":string,"highlightedTerms":[{"term":string,"definition":string}]}],"funFact"?:string}. ' +
      '2–4 sections, each 2–4 sentences. Highlight 1–3 key terms per section. ' +
      `Prefer these exact glossary terms where they fit: ${GLOSSARY_TERMS.join(', ')}. ` +
      'Optionally end with one surprising funFact.',
    quiz:
      'Shape: {"questions":[{"question":string,"options":string[2..5],"correctIndex":int,"explanation":string}]}. ' +
      'Write the number of questions implied by the topic (default 3). Exactly one correct option each. ' +
      'Explanations teach WHY, in 1–2 sentences.',
    match:
      'Shape: {"pairs":[{"term":string,"definition":string}]}. 4–6 pairs. ' +
      'Definitions short (one line), unambiguous, each clearly matching exactly one term.',
    scenario:
      'Shape: {"setup":string,"choices":[{"label":string,"feedback":string,"isCorrect":boolean}]}. ' +
      'A realistic first-person investing dilemma. 3 choices, exactly one isCorrect:true. ' +
      'Feedback is supportive and explains the reasoning for every choice (right or wrong).',
  };

  return `${base}\n\n${shapes[type]}`;
}

function stripFences(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

/** Generate + validate one lesson's content, retrying on schema failure. */
async function generateLessonContent(lesson: LessonSpec): Promise<unknown> {
  const schema = SCHEMA_BY_TYPE[lesson.type];
  let lastError = '';

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const retryNote = lastError
      ? `\n\nYour previous attempt FAILED schema validation with: ${lastError}\nFix it and return valid JSON only.`
      : '';
    const userPrompt =
      `Lesson title: "${lesson.title}"\nLesson type: ${lesson.type}\nTeach this: ${lesson.topic}${retryNote}`;

    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: systemPromptFor(lesson.type),
      messages: [{ role: 'user', content: userPrompt }],
    });

    const raw = msg.content.find((b) => b.type === 'text');
    const text = raw && raw.type === 'text' ? stripFences(raw.text) : '';

    try {
      const parsed = JSON.parse(text);
      const result = schema.safeParse(parsed);
      if (result.success) {
        return applyGlossary(lesson.type, result.data);
      }
      lastError = JSON.stringify(result.error.issues.slice(0, 4));
    } catch (e) {
      lastError = `JSON parse error: ${(e as Error).message}`;
    }
    process.stderr.write(`  ↻ ${lesson.slug}: attempt ${attempt} failed (${lastError.slice(0, 120)})\n`);
  }

  throw new Error(`Lesson "${lesson.slug}" failed validation after ${MAX_RETRIES} attempts. Last error: ${lastError}`);
}

/** For read lessons, replace term definitions with canonical glossary copy where it exists. */
function applyGlossary(type: LessonType, data: unknown): unknown {
  if (type !== 'read') return data;
  const content = data as z.infer<typeof ReadContentSchema>;
  for (const section of content.sections) {
    for (const ht of section.highlightedTerms) {
      const entry = getGlossaryEntry(ht.term) ?? glossaryByLooseMatch(ht.term);
      if (entry) ht.definition = entry.description;
    }
  }
  return content;
}

function glossaryByLooseMatch(term: string): { description: string } | undefined {
  const lower = term.trim().toLowerCase();
  const key = GLOSSARY_TERMS.find((k) => k.toLowerCase() === lower);
  return key ? GLOSSARY[key] : undefined;
}

// ─── SQL emission ───────────────────────────────────────────────────────────

/** Escape a JS value as a single-quoted SQL string literal (doubling quotes). */
function sqlStr(v: string): string {
  return `'${v.replace(/'/g, "''")}'`;
}

/** Escape a validated content object as a '{...}'::jsonb literal. */
function sqlJsonb(content: unknown): string {
  return `${sqlStr(JSON.stringify(content))}::jsonb`;
}

function emitSql(outline: CourseOutline, contents: unknown[]): string {
  const lines: string[] = [];
  lines.push(`-- BullPen Academy — generated course: "${outline.title}" (${outline.difficulty})`);
  lines.push(`-- Generated by scripts/generate-academy-course.ts. Review before applying.`);
  lines.push(`-- Re-runnable: ON CONFLICT DO NOTHING.`);
  lines.push('');
  lines.push(`INSERT INTO academy_courses (slug, title, description, icon, color, order_index, difficulty, requires_pro, is_published) VALUES`);
  lines.push(
    `  (${sqlStr(outline.slug)}, ${sqlStr(outline.title)}, ${sqlStr(outline.description)}, ` +
    `${sqlStr(outline.icon)}, ${sqlStr(outline.color)}, ${outline.orderIndex}, ${sqlStr(outline.difficulty)}, ` +
    `${outline.requiresPro ? 'TRUE' : 'FALSE'}, TRUE)`
  );
  lines.push(`ON CONFLICT (slug) DO NOTHING;`);
  lines.push('');
  lines.push(`INSERT INTO academy_lessons (course_id, slug, title, type, order_index, xp_reward, content)`);
  lines.push(`SELECT`);
  lines.push(`  (SELECT id FROM academy_courses WHERE slug = ${sqlStr(outline.slug)}),`);
  lines.push(`  v.slug, v.title, v.type, v.order_index, v.xp_reward, v.content`);
  lines.push(`FROM (VALUES`);

  const rows = outline.lessons.map((lesson, i) => {
    return `  (${sqlStr(lesson.slug)}, ${sqlStr(lesson.title)}, ${sqlStr(lesson.type)}, ${i}, ${lesson.xpReward}, ${sqlJsonb(contents[i])})`;
  });
  lines.push(rows.join(',\n'));

  lines.push(`) AS v(slug, title, type, order_index, xp_reward, content)`);
  lines.push(`ON CONFLICT (course_id, slug) DO NOTHING;`);
  lines.push('');
  return lines.join('\n');
}

// ─── Main ───────────────────────────────────────────────────────────────────

function loadOutline(): CourseOutline {
  const path = process.argv[2];
  if (path) {
    const json = JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8'));
    return json as CourseOutline;
  }
  return DEFAULT_OUTLINE;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    process.stderr.write('❌ ANTHROPIC_API_KEY not set in .env.local\n');
    process.exit(1);
  }

  const outline = loadOutline();
  process.stderr.write(`\n📚 Generating "${outline.title}" — ${outline.lessons.length} lessons (${MODEL})\n`);

  const contents: unknown[] = [];
  for (const lesson of outline.lessons) {
    process.stderr.write(`  • ${lesson.slug} (${lesson.type})…\n`);
    contents.push(await generateLessonContent(lesson));
  }

  process.stderr.write(`✅ All ${outline.lessons.length} lessons validated. Emitting SQL to stdout.\n\n`);
  process.stdout.write(emitSql(outline, contents));
}

main().catch((err) => {
  process.stderr.write(`\n❌ ${err.message}\n`);
  process.exit(1);
});
