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
  lessons: LessonSpec[];
}

// ─── Default outline (edit me, or pass a JSON path as argv[2]) ─────────────────
// Example: course #2 in the roadmap. Replace freely.

const DEFAULT_OUTLINE: CourseOutline = {
  slug: 'reading-a-stock-quote',
  title: 'Reading a Stock Quote',
  description:
    'Decode everything on a stock quote — price, bid/ask, volume, market cap, and the day range — so the numbers stop being noise.',
  icon: 'LineChart',
  color: 'emerald',
  orderIndex: 1,
  difficulty: 'beginner',
  lessons: [
    { slug: 'anatomy-of-a-quote', title: 'Anatomy of a Quote', type: 'read', topic: 'The core fields on any stock quote: last price, change, % change, previous close, day range. Explain what each means in plain English.', xpReward: 10 },
    { slug: 'bid-ask-spread', title: 'Bid, Ask & Spread', type: 'read', topic: 'What the bid and ask prices are, why there is a gap (the spread), and what a tight vs wide spread tells you about liquidity.', xpReward: 10 },
    { slug: 'quote-quiz', title: 'Quick Check: Quote Fields', type: 'quiz', topic: 'Test understanding of price, change %, bid/ask, spread, and volume from the previous two lessons. 3 questions.', xpReward: 20 },
    { slug: 'quote-vocab-match', title: 'Match the Quote Terms', type: 'match', topic: 'Match quote-related terms (Bid, Ask, Spread, Volume, Market Cap, Day Range) to their plain-English definitions.', xpReward: 15 },
    { slug: 'reading-volume', title: 'What Volume Tells You', type: 'read', topic: 'Trading volume and average volume — why a volume spike matters and how it signals unusual interest in a stock.', xpReward: 10 },
    { slug: 'quote-scenario', title: 'Make the Call', type: 'scenario', topic: 'A beginner sees a stock down 3% on huge volume after earnings and must decide how to interpret the quote before acting. Reward reading the full picture over reacting to the red number.', xpReward: 25 },
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
  lines.push(`INSERT INTO academy_courses (slug, title, description, icon, color, order_index, difficulty, is_published) VALUES`);
  lines.push(
    `  (${sqlStr(outline.slug)}, ${sqlStr(outline.title)}, ${sqlStr(outline.description)}, ` +
    `${sqlStr(outline.icon)}, ${sqlStr(outline.color)}, ${outline.orderIndex}, ${sqlStr(outline.difficulty)}, TRUE)`
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
