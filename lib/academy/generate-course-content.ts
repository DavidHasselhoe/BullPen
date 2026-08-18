// lib/academy/generate-course-content.ts
//
// AI course-content generation: drafts every lesson in a CourseOutline via
// Claude, validates against the Zod schemas in types/academy.ts, and prefers
// canonical glossary definitions for highlighted terms. Extracted from
// scripts/generate-academy-course.ts so both that manual CLI script and
// app/api/cron/generate-academy-course/route.ts call the same code — a
// future prompt or retry tweak only has to happen in one place.

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import {
  ReadContentSchema,
  QuizContentSchema,
  MatchContentSchema,
  ScenarioContentSchema,
} from '@/types/academy';
import { GLOSSARY, getGlossaryEntry } from '@/lib/finance/glossary';
import type { CourseOutline, LessonSpec, GeneratableLessonType } from './course-outline-types';

const MODEL = 'claude-opus-4-8';
const MAX_RETRIES = 3;

// Lazily constructed, not a module-level const: ESM import statements are
// hoisted above all other top-level code, so a module-level client here
// would read process.env.ANTHROPIC_API_KEY before scripts/generate-academy-course.ts's
// own dotenv config() call has run (config() is a plain statement, not an
// import, so it only runs after every imported module has already
// initialized) — the client would permanently bake in an undefined key.
// Deferring construction to first actual use sidesteps import-order
// entirely; the Next.js cron route (which loads env vars before any user
// code runs anyway) is unaffected either way.
let anthropicClient: Anthropic | null = null;
function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

const SCHEMA_BY_TYPE: Record<GeneratableLessonType, z.ZodTypeAny> = {
  read: ReadContentSchema,
  quiz: QuizContentSchema,
  match: MatchContentSchema,
  scenario: ScenarioContentSchema,
};

const GLOSSARY_TERMS = Object.keys(GLOSSARY);

function systemPromptFor(type: GeneratableLessonType): string {
  const base =
    'You are a senior investing educator writing for absolute beginners in a Duolingo-style app. ' +
    'Tone: warm, plain-English, concrete, no jargon without explaining it. ' +
    'Return ONLY raw JSON — no markdown, no code fences, no prose around it. ' +
    'Never use an em dash (—) or en dash (–) to connect clauses in any string field; use a period, comma, or colon instead.';

  const shapes: Record<GeneratableLessonType, string> = {
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

    const msg = await getAnthropicClient().messages.create({
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
    console.error(`  ↻ ${lesson.slug}: attempt ${attempt} failed (${lastError.slice(0, 120)})`);
  }

  throw new Error(`Lesson "${lesson.slug}" failed validation after ${MAX_RETRIES} attempts. Last error: ${lastError}`);
}

/** For read lessons, replace term definitions with canonical glossary copy where it exists. */
function applyGlossary(type: GeneratableLessonType, data: unknown): unknown {
  if (type !== 'read') return data;
  const content = data as { sections: { highlightedTerms: { term: string; definition: string }[] }[] };
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

/** Generates + validates every lesson in an outline, in order. Throws on the first lesson that exhausts its retries. */
export async function generateCourseLessons(outline: CourseOutline): Promise<unknown[]> {
  const contents: unknown[] = [];
  for (const lesson of outline.lessons) {
    console.error(`  • ${lesson.slug} (${lesson.type})…`);
    contents.push(await generateLessonContent(lesson));
  }
  return contents;
}
