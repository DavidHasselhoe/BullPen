# Academy Weekly Course Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A weekly cron that drafts the next course from a pre-planned 10-week roadmap via Claude, stages it unpublished, and notifies Discord — going live only after explicit human approval, never on a timer.

**Architecture:** Extract the AI-generation-and-Zod-validation logic already in `scripts/generate-academy-course.ts` into a shared `lib/academy/` module so both the existing manual CLI script and the new cron route call the same code (one prompt tweak, one place). A new `lib/academy/academy-roadmap.ts` holds the 10 planned course outlines as data. The weekly cron (`app/api/cron/generate-academy-course/route.ts`) finds the next roadmap entry not yet in the database, generates its lessons, and inserts the course with `is_published: false` — reusing the existing column that already gates course visibility everywhere, so no migration is needed. A new admin surface (`/admin/academy-roadmap`, following the exact `/admin/feedback` gate pattern) lists unpublished drafts with a readable per-lesson-type preview and Approve/Reject actions. This deliberately does **not** copy the Instagram pipeline's auto-publish-after-a-preview-window behavior — per the explicit decision this plan implements, financial-education content that's quiz-gated for real users needs a harder gate than a social caption.

**Tech Stack:** Next.js App Router API routes, Anthropic SDK (Claude Opus, matching the existing script's model choice), Supabase, Zod, TanStack Query, GitHub Actions (time-tolerant scheduler, matching the existing non-Vercel cron convention).

**Spec:** This plan's Design Decisions section below — the content strategy (course list, country-neutrality pass, overlap check against the live catalog) and the review-gate decision were worked out directly in conversation; there is no separate spec file.

## Design Decisions (spec)

1. **No database migration.** `academy_courses.is_published` already exists and already gates every read path (`app/api/academy/courses/route.ts` filters `.eq('is_published', true)`; the single-course route does the same). A drafted, unapproved course is automatically invisible everywhere a real user looks — no new column, no new table.
2. **Explicit approval, not a timer.** Unlike the Instagram earnings pipeline (stage → Discord preview → a *second* cron auto-publishes whatever's still `'ready'` the next day), this plan has no second cron. A course only goes live when an admin clicks Approve on `/admin/academy-roadmap`. This was an explicit user decision: a wrong answer in an auto-generated, quiz-gated course teaches someone the wrong thing about their own money, which is a materially higher cost of error than a stale Instagram caption.
3. **Reject deletes and re-queues, it doesn't blacklist.** Rejecting a draft deletes the course row (lessons cascade-delete via the existing FK). Since the cron picks "the first roadmap entry whose slug isn't in the database yet," a rejected course's slot is automatically regenerated on the next run. There's no separate "permanently skip this topic" state — if a topic should be dropped entirely, that's a follow-up edit to `academy-roadmap.ts`, not a runtime action.
4. **The roadmap is a static, git-reviewable data file** (`lib/academy/academy-roadmap.ts`), not a database table. Editing next month's plan is a normal code change with a normal diff, not an admin-UI feature that doesn't exist yet.
5. **Cron-generated courses are text-only** (`read`/`quiz`/`match`/`scenario`) — no `demo` or `chart-tour` lessons. This is an existing, explicit constraint already documented in `generate-academy-course.ts` (interactive lesson types are hand-authored), not new scope for this plan. All 10 roadmap outlines below respect it.
6. **Country-neutral content, verified against the live catalog for overlap.** The 10-course list was checked against the actual live `academy_courses`/`academy_lessons` data (not stale memory) to avoid re-teaching something already covered — see the inline notes on courses 5, 8, 9, 10 below, each of which deliberately builds *beyond* an existing lesson rather than repeating it. Courses 1-2 teach tax/retirement-account *concepts* (the general mechanisms, e.g. "tax-deferred now vs. tax-free later") rather than any single country's named programs, with an explicit "check your own country's rules" beat rather than defaulting to US specifics.
7. **Unit labels must stay contiguous.** `groupIntoChapters` (`lib/academy/path-chapters.ts`) groups consecutive `order_index` rows sharing the same `unit_label` into one chapter banner on the `/academy` path. Reusing an existing unit label (e.g. "Advanced Strategy") for a *non-adjacent* new course would render a second, duplicate-looking chapter banner far down the path instead of extending the first one. Every new unit below is therefore a fresh label, contiguous within itself.

## Global Constraints

- Follow the existing "cast at the write site only" pattern (`const db = supabase as any`) for `academy_courses`/`academy_lessons` writes, matching every other academy route.
- Every new admin route uses the exact `/admin/feedback` gate: `getSessionForApiRoute()` / `withAuth`, `isAdmin(await getTier(...))`, and a **404** (not 403) on denial so the route is indistinguishable from nonexistent.
- No em dash/en dash in any generated lesson copy — the existing system prompt in `generate-course-content.ts` already enforces this; do not weaken it.
- `npm run lint` and `npm run test-cron-coverage` both need to pass — the latter fails the build if a cron route has no scheduler or a workflow references a route that doesn't exist.
- Per `CLAUDE.md`, update the GitHub Actions crons table when the new workflow lands.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/academy/course-outline-types.ts` | Shared `CourseOutline`/`LessonSpec` types (create) |
| `lib/academy/generate-course-content.ts` | Extracted Claude generation + Zod validation + glossary substitution (create) |
| `lib/academy/academy-roadmap.ts` | The 10 planned course outlines, real lesson topics (create) |
| `scripts/generate-academy-course.ts` | Refactored to import the two modules above; CLI/stdout behavior unchanged (modify) |
| `app/api/cron/generate-academy-course/route.ts` | Weekly cron: generate next roadmap entry, stage unpublished, Discord notify (create) |
| `app/api/admin/academy-roadmap/route.ts` | GET: list unpublished draft courses + lessons (create) |
| `app/api/admin/academy-roadmap/[courseId]/route.ts` | POST approve / DELETE reject (create) |
| `app/admin/academy-roadmap/page.tsx` | Server-rendered admin gate (create) |
| `app/admin/academy-roadmap/AdminAcademyRoadmapClient.tsx` | Draft list, per-lesson-type preview, approve/reject (create) |
| `.github/workflows/cron-academy-course-weekly.yml` | Weekly scheduler (create) |
| `CLAUDE.md` | Document the new cron in the GitHub Actions crons table (modify) |

---

### Task 1: Shared outline types

**Files:**
- Create: `lib/academy/course-outline-types.ts`

**Interfaces:**
- Consumes: `LessonType` (`types/academy.ts`).
- Produces: `GeneratableLessonType`, `LessonSpec`, `CourseOutline` — the single shared shape every later task imports.

- [ ] **Step 1: Write the file**

```ts
// lib/academy/course-outline-types.ts
// Shared between scripts/generate-academy-course.ts (manual CLI use) and
// app/api/cron/generate-academy-course/route.ts (automated weekly cron) —
// moved out of the script so both callers use one definition.

import type { LessonType } from '@/types/academy';

// Interactive lesson types (chart-tour, demo) are hand-authored in their own
// migrations, never AI-drafted — see generate-course-content.ts.
export type GeneratableLessonType = Extract<LessonType, 'read' | 'quiz' | 'match' | 'scenario'>;

export interface LessonSpec {
  slug: string;
  title: string;
  type: GeneratableLessonType;
  /** What this lesson should teach — the prompt seed handed to Claude. */
  topic: string;
  xpReward: number;
}

export interface CourseOutline {
  slug: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  orderIndex: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  /** Gate behind a Pro subscription. Defaults to false. */
  requiresPro?: boolean;
  /**
   * Chapter grouping label for the /academy path view (academy_courses.unit_label).
   * groupIntoChapters (lib/academy/path-chapters.ts) merges consecutive
   * order_index rows sharing this label into one banner — reusing a label
   * non-adjacently creates a second, duplicate-looking banner instead of
   * extending the first one, so every new unit needs its own label unless
   * it's genuinely adjacent to an existing run of the same label.
   */
  unitLabel: string | null;
  lessons: LessonSpec[];
}
```

- [ ] **Step 2: Verify**

Run: `npx eslint lib/academy/course-outline-types.ts` — expect no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/academy/course-outline-types.ts
git commit -m "feat: extract shared CourseOutline types for academy content generation"
```

---

### Task 2: Extracted generation logic

**Files:**
- Create: `lib/academy/generate-course-content.ts`

**Interfaces:**
- Consumes: `CourseOutline`/`LessonSpec`/`GeneratableLessonType` (Task 1), `ReadContentSchema`/`QuizContentSchema`/`MatchContentSchema`/`ScenarioContentSchema` (`types/academy.ts`), `GLOSSARY`/`getGlossaryEntry` (`lib/finance/glossary.ts`).
- Produces: `generateCourseLessons(outline: CourseOutline): Promise<unknown[]>` — validated content per lesson, in outline order. Throws on the first lesson that fails Zod validation after 3 retries (same failure behavior as the original script, just as a thrown error instead of a `process.exit(1)`, since a route can't exit the process).

- [ ] **Step 1: Write the file — this is the generation logic already in `scripts/generate-academy-course.ts` lines 91-190, unchanged except for the module boundary**

```ts
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

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
```

- [ ] **Step 2: Verify**

Run: `npx eslint lib/academy/generate-course-content.ts` — expect no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/academy/generate-course-content.ts
git commit -m "feat: extract shared course-content generation logic"
```

---

### Task 3: Refactor the existing CLI script to use the shared modules

**Files:**
- Modify: `scripts/generate-academy-course.ts`

**Interfaces:**
- Consumes: `CourseOutline`/`LessonSpec` (Task 1), `generateCourseLessons` (Task 2).
- Produces: identical CLI behavior (stdout SQL emission) — this task must not change what the script outputs for `DEFAULT_OUTLINE`, only where the generation logic lives. Also adds `unit_label` to the emitted SQL, since Task 1's `CourseOutline` now requires it and the existing `emitSql` never set that column.

- [ ] **Step 1: Replace the type definitions and generation logic with imports**

Remove lines 24-43 (`GeneratableLessonType` through `MAX_RETRIES`/`anthropic` client) and lines 91-190 (`SCHEMA_BY_TYPE` through `glossaryByLooseMatch`) from `scripts/generate-academy-course.ts`. Replace the import block at the top:

```ts
import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';
config({ path: resolve(process.cwd(), '.env.local') });

import type { CourseOutline } from '../lib/academy/course-outline-types';
import { generateCourseLessons } from '../lib/academy/generate-course-content';
```

- [ ] **Step 2: Add `unitLabel` to `DEFAULT_OUTLINE`**

```ts
const DEFAULT_OUTLINE: CourseOutline = {
  slug: 'etfs-and-crypto',
  title: 'Beyond Stocks: ETFs & Crypto',
  description:
    'Stocks aren\'t the only asset on BullPen. Learn what ETFs are, how they differ from picking individual stocks, and the basics of crypto and commodities.',
  icon: 'Layers',
  color: 'emerald',
  orderIndex: 7,
  difficulty: 'beginner',
  unitLabel: 'Foundations',
  lessons: [
    // ... unchanged, existing 5 lesson entries stay exactly as they are
  ],
};
```

(This course already exists live via `ON CONFLICT (slug) DO NOTHING` in `emitSql`, so this change is inert for `DEFAULT_OUTLINE` specifically — it only matters for type-correctness and for any *new* outline JSON a future manual run passes in.)

- [ ] **Step 3: Add `unit_label` to the SQL emission**

In `emitSql`, update the INSERT column list and values:

```ts
function emitSql(outline: CourseOutline, contents: unknown[]): string {
  const lines: string[] = [];
  lines.push(`-- BullPen Academy — generated course: "${outline.title}" (${outline.difficulty})`);
  lines.push(`-- Generated by scripts/generate-academy-course.ts. Review before applying.`);
  lines.push(`-- Re-runnable: ON CONFLICT DO NOTHING.`);
  lines.push('');
  lines.push(`INSERT INTO academy_courses (slug, title, description, icon, color, order_index, difficulty, requires_pro, unit_label, is_published) VALUES`);
  lines.push(
    `  (${sqlStr(outline.slug)}, ${sqlStr(outline.title)}, ${sqlStr(outline.description)}, ` +
    `${sqlStr(outline.icon)}, ${sqlStr(outline.color)}, ${outline.orderIndex}, ${sqlStr(outline.difficulty)}, ` +
    `${outline.requiresPro ? 'TRUE' : 'FALSE'}, ${outline.unitLabel ? sqlStr(outline.unitLabel) : 'NULL'}, TRUE)`
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
```

(This script's own emitted SQL still hardcodes `TRUE` for `is_published` — the manual CLI path stays "generate and immediately publish once a human has reviewed the SQL," matching its existing "a human reviews the SQL before it is applied" design. Only the new cron path, Task 5, inserts with `is_published: false`.)

- [ ] **Step 4: Replace the generation call in `main()`**

```ts
async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    process.stderr.write('❌ ANTHROPIC_API_KEY not set in .env.local\n');
    process.exit(1);
  }

  const outline = loadOutline();
  process.stderr.write(`\n📚 Generating "${outline.title}" — ${outline.lessons.length} lessons\n`);

  const contents = await generateCourseLessons(outline);

  process.stderr.write(`✅ All ${outline.lessons.length} lessons validated. Emitting SQL to stdout.\n\n`);
  process.stdout.write(emitSql(outline, contents));
}

main().catch((err) => {
  process.stderr.write(`\n❌ ${err.message}\n`);
  process.exit(1);
});
```

- [ ] **Step 5: Verify**

Run: `npx eslint scripts/generate-academy-course.ts` — expect no errors.
Run: `npm run generate-course > /tmp/test-output.sql 2>&1; head -c 500 /tmp/test-output.sql` (or the Windows equivalent — redirect stdout to a file and inspect the first lines). Expected: real generated SQL for `etfs-and-crypto`, structurally identical in shape to before (now including a `unit_label` value of `'Foundations'` in the INSERT), no thrown errors. This costs real Anthropic credits (5 lessons via Claude Opus) — acceptable as a one-time refactor verification, matching how this script has always been run.

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-academy-course.ts
git commit -m "refactor: use shared generation modules in generate-academy-course.ts, add unit_label"
```

---

### Task 4: The 10-week roadmap data

**Files:**
- Create: `lib/academy/academy-roadmap.ts`

**Interfaces:**
- Consumes: `CourseOutline` (Task 1).
- Produces: `ACADEMY_ROADMAP: CourseOutline[]` — consumed by the cron (Task 5).

- [ ] **Step 1: Write the file**

```ts
// lib/academy/academy-roadmap.ts
//
// The planned next 10 weeks of Academy courses. app/api/cron/generate-academy-course
// works through this list in order, one course per run, finding the first
// entry whose slug doesn't exist in academy_courses yet. Editing next
// month's plan is a normal code change to this array — a real, reviewable
// diff — not a database/admin-UI feature.
//
// Content notes (see the 2026-08-18 planning conversation for full context):
//  - Courses 1-2 teach tax/retirement-account CONCEPTS, not any one
//    country's named programs — no 401(k)/Roth IRA as the headline example.
//  - Course 5 replaces an earlier "Position Sizing" draft, which was cut
//    after checking the live catalog: portfolio-diversification already has
//    a "Position Sizing & Risk" lesson and portfolio-risk already has
//    "Concentration & Position Sizing" — a third pass would repeat, not add.
//  - Courses 8, 9, 10 deliberately build BEYOND existing beginner lessons
//    (payout ratio, SMA trend-following, crypto basics) rather than
//    re-teaching them — see each course's comment below.
//  - order_index continues from 13 (macro-mechanics, the current highest
//    live course) starting at 14.

import type { CourseOutline } from './course-outline-types';

export const ACADEMY_ROADMAP: CourseOutline[] = [
  // ─── Money Matters (free, beginner) ──────────────────────────────────────
  {
    slug: 'taxes-on-investing',
    title: 'Taxes on Investing',
    description: 'How investment gains actually get taxed, why holding period can matter, and what tax-loss harvesting means, no matter which country you invest from.',
    icon: 'Receipt',
    color: 'emerald',
    orderIndex: 14,
    difficulty: 'beginner',
    unitLabel: 'Money Matters',
    lessons: [
      { slug: 'how-gains-get-taxed', title: 'How Investment Gains Get Taxed', type: 'read', topic: 'The general concept that most countries tax investment gains differently from ordinary income (often called capital gains treatment), and that WHEN you sell (realize the gain) is what usually triggers tax, not just paper gains. Keep this at the concept level, no specific country\'s rates or thresholds.', xpReward: 10 },
      { slug: 'why-holding-period-matters', title: 'Why Holding Period Can Matter', type: 'read', topic: 'Many countries give more favorable tax treatment to investments held longer before selling (often called long-term vs short-term treatment). Explain this as a broadly common pattern to check for, using no specific numbers or one country\'s rules as the example.', xpReward: 10 },
      { slug: 'taxes-quiz', title: 'Quick Check: Taxes', type: 'quiz', topic: 'Test understanding of realized vs unrealized gains and why holding period is often relevant, from the previous two lessons. 3 questions.', xpReward: 20 },
      { slug: 'tax-terms-match', title: 'Match the Tax Terms', type: 'match', topic: 'Match universal tax vocabulary (Capital Gain, Capital Loss, Realized Gain, Unrealized Gain, Cost Basis, Tax-Loss Harvesting) to plain-English definitions, none tied to a specific country\'s tax code.', xpReward: 15 },
      { slug: 'sell-now-or-wait', title: 'Sell Now or Wait?', type: 'scenario', topic: 'An investor is deciding whether to sell a losing position before their tax year ends. Reward reasoning about tax-loss harvesting as a general strategy while the feedback explicitly reinforces checking your own country\'s specific tax rules before acting, not presenting one system as universal.', xpReward: 25 },
    ],
  },
  {
    slug: 'tax-advantaged-accounts',
    title: 'Understanding Tax-Advantaged Accounts',
    description: 'Nearly every country has some version of a tax-advantaged investment account. Learn the pattern so you can recognize and use yours.',
    icon: 'PiggyBank',
    color: 'emerald',
    orderIndex: 15,
    difficulty: 'beginner',
    unitLabel: 'Money Matters',
    lessons: [
      { slug: 'what-makes-it-tax-advantaged', title: 'What Makes an Account Tax-Advantaged', type: 'read', topic: 'The two common mechanisms across countries: contributions reduce taxable income now but withdrawals are taxed later, OR contributions are after-tax but growth/withdrawals are tax-free. Also explain employer matching (where it exists) as "free money." Do not center this on one country\'s named program.', xpReward: 10 },
      { slug: 'finding-your-countrys-version', title: 'Finding Your Country\'s Version', type: 'read', topic: 'A brief, evenhanded world tour purely as pattern-recognition: US 401(k)/IRA, UK ISA/SIPP, Canada RRSP/TFSA, Australia Superannuation. Frame explicitly as "here is what to search for in your own country," not a deep dive into any single one, and note many other countries have their own equivalents not listed here.', xpReward: 10 },
      { slug: 'tax-advantaged-quiz', title: 'Quick Check: Tax-Advantaged Accounts', type: 'quiz', topic: 'Test understanding of the two general mechanisms (tax-deferred vs tax-free growth) and why starting early matters for compounding inside these accounts. 3 questions.', xpReward: 20 },
      { slug: 'account-concepts-match', title: 'Match the Account Concepts', type: 'match', topic: 'Match general concepts (Tax-Deferred, Tax-Free Growth, Employer Match, Contribution Limit) to plain-English meanings, framed generically rather than tied to one country\'s named accounts.', xpReward: 15 },
      { slug: 'where-should-the-contribution-go', title: 'Where Should the Next Contribution Go?', type: 'scenario', topic: 'An investor is deciding between a normal brokerage account and their country\'s tax-advantaged account (referred to generically) for a long-term goal. Reward reasoning about the tradeoff between tax benefit and flexibility/access, in general terms.', xpReward: 25 },
    ],
  },
  {
    slug: 'bonds-fixed-income',
    title: 'Bonds & Fixed Income Basics',
    description: 'What a bond actually is, how yield and price relate, and why bonds can balance a stock-heavy portfolio.',
    icon: 'Landmark',
    color: 'emerald',
    orderIndex: 16,
    difficulty: 'beginner',
    unitLabel: 'Money Matters',
    lessons: [
      { slug: 'what-is-a-bond', title: 'What is a Bond?', type: 'read', topic: 'A bond as a loan an investor makes to a government or company in exchange for regular interest payments and return of principal at maturity. Contrast with owning a stock: lending vs ownership.', xpReward: 10 },
      { slug: 'yield-price-and-rates', title: 'Yield, Price & Interest Rates', type: 'read', topic: 'The inverse relationship between bond prices and interest rates in plain English, and why a bond\'s yield is not the same as its stated interest rate once its price changes. No formulas.', xpReward: 10 },
      { slug: 'bonds-quiz', title: 'Quick Check: Bonds', type: 'quiz', topic: 'Test understanding of what a bond is and the price/yield/interest-rate relationship. 3 questions.', xpReward: 20 },
      { slug: 'bond-terms-match', title: 'Match the Bond Terms', type: 'match', topic: 'Match bond vocabulary (Bond, Yield, Maturity, Coupon, Principal, Credit Rating) to plain-English definitions.', xpReward: 15 },
      { slug: 'balancing-stocks-and-bonds', title: 'Balancing Stocks and Bonds', type: 'scenario', topic: 'An investor with an all-stock portfolio is deciding whether adding bonds would help smooth out returns ahead of a goal a few years away. Reward reasoning about bonds\' role as a diversifier/stabilizer, not framing bonds as universally better or worse than stocks.', xpReward: 25 },
    ],
  },

  // ─── Investor Mindset (free, beginner) ───────────────────────────────────
  {
    slug: 'investing-psychology',
    title: 'Behavioral Finance: Investing Psychology',
    description: 'Why your brain works against you as an investor, and how to recognize the biases that lead to costly decisions.',
    icon: 'Brain',
    color: 'emerald',
    orderIndex: 17,
    difficulty: 'beginner',
    unitLabel: 'Investor Mindset',
    lessons: [
      { slug: 'why-your-brain-fights-you', title: 'Why Your Brain Fights You', type: 'read', topic: 'Loss aversion: losses feel worse than equivalent gains feel good, and why this leads investors to sell winners too early and hold losers too long.', xpReward: 10 },
      { slug: 'fomo-herding-recency-bias', title: 'FOMO, Herding & Recency Bias', type: 'read', topic: 'Why investors chase what has already gone up (recency bias) and follow the crowd (herd behavior/FOMO), and why "everyone is buying it" is not itself a reason to buy.', xpReward: 10 },
      { slug: 'psychology-quiz', title: 'Quick Check: Investing Psychology', type: 'quiz', topic: 'Test understanding of loss aversion, recency bias, and herd behavior from the previous two lessons. 3 questions.', xpReward: 20 },
      { slug: 'biases-match', title: 'Match the Biases', type: 'match', topic: 'Match behavioral finance terms (Loss Aversion, FOMO, Recency Bias, Herd Behavior, Confirmation Bias, Overconfidence) to real investor behaviors that illustrate each.', xpReward: 15 },
      { slug: 'everyone-is-talking-about-it', title: 'Everyone\'s Talking About It', type: 'scenario', topic: 'A stock the investor owns is up 40% in a week and social media is buzzing about it going higher. Reward recognizing the emotional pull (FOMO/herd behavior) and reasoning through the decision calmly rather than reactively.', xpReward: 25 },
    ],
  },

  // ─── Company Research (Pro, intermediate) ────────────────────────────────
  {
    slug: 'research-routine-watchlist',
    title: 'Building a Research Routine & Watchlist Strategy',
    description: 'A repeatable process for researching a company before you buy, and how to use a watchlist as a research tool, not just a wishlist.',
    icon: 'ListChecks',
    color: 'blue',
    orderIndex: 18,
    difficulty: 'intermediate',
    requiresPro: true,
    unitLabel: 'Company Research',
    lessons: [
      { slug: 'watchlist-vs-impulse', title: 'Why a Watchlist Beats Impulse Buying', type: 'read', topic: 'The difference between researching a company BEFORE you are emotionally invested vs after you already own it. A watchlist as a research staging area, not just a wishlist.', xpReward: 10 },
      { slug: 'what-to-check-before-buying', title: 'What to Check Before You Buy', type: 'read', topic: 'A repeatable pre-purchase checklist: valuation context, recent news/earnings, and how the new position\'s sector exposure compares to what you already hold. Reference position sizing and diversification as concepts already covered elsewhere without re-explaining their mechanics in depth.', xpReward: 10 },
      { slug: 'alerts-as-research-tool', title: 'Alerts as a Research Tool', type: 'read', topic: 'Using price alerts and earnings alerts not just as fear-of-missing-a-drop tools, but as reminders to revisit your original thesis when something meaningfully changes.', xpReward: 10 },
      { slug: 'research-routine-quiz', title: 'Quick Check: Research Routine', type: 'quiz', topic: 'Test understanding of the pre-purchase checklist and how alerts fit into ongoing research. 3 questions.', xpReward: 20 },
      { slug: 'watchlist-or-buy-now', title: 'Add It to the Watchlist, or Buy Now?', type: 'scenario', topic: 'An investor discovers an interesting company through a friend\'s tip and feels the urge to buy immediately. Reward choosing to add it to a watchlist and run it through the research checklist first.', xpReward: 25 },
    ],
  },
  {
    slug: 'earnings-reports-calls',
    title: 'Reading Earnings Reports & Calls',
    description: 'What is actually inside a quarterly earnings report, why a "good" report can still tank a stock, and why you do not need to dig through the filing yourself.',
    icon: 'FileText',
    color: 'blue',
    orderIndex: 19,
    difficulty: 'intermediate',
    requiresPro: true,
    unitLabel: 'Company Research',
    lessons: [
      // NOTE: EPS itself is already covered in company-fundamentals ("EPS &
      // the P/E Ratio") — this lesson is about report STRUCTURE (results vs
      // guidance vs management commentary) and the regulatory-filing context
      // behind it, not re-explaining what EPS is.
      { slug: 'whats-in-an-earnings-report', title: 'What\'s Actually in an Earnings Report', type: 'read', topic: 'The structure of a quarterly earnings report: results (what happened) vs guidance (what is expected next) vs management commentary. Mention that public companies are legally required to publish these on a regular schedule with their market\'s regulator (SEC filings as the US example), and note other countries have their own equivalent regulators, without going deep into filing types.', xpReward: 10 },
      { slug: 'we-already-read-it-for-you', title: 'You Don\'t Have to Read the Filing Yourself', type: 'read', topic: 'The product-education payoff: reading a raw regulatory filing is a real struggle even for experienced investors. BullPen already parses these filings and surfaces the key fundamentals and Why Today explanations directly on the stock page, so the investor gets the insight without wading through a filing themselves. Point them to check a stock\'s page next time a company they hold reports earnings.', xpReward: 10 },
      { slug: 'good-report-bad-reaction', title: 'Why a "Good" Report Can Still Tank the Stock', type: 'read', topic: 'The gap between results (backward-looking) and guidance (forward-looking), and why the market reacts more strongly to guidance than to the quarter that already happened.', xpReward: 10 },
      { slug: 'earnings-reports-quiz', title: 'Quick Check: Earnings Reports', type: 'quiz', topic: 'Test understanding of results vs guidance, and why a beat can still cause a stock to fall. 3 questions.', xpReward: 20 },
      { slug: 'beat-but-dropped', title: 'The Report Beat, But the Stock Dropped', type: 'scenario', topic: 'A company beats EPS estimates but the stock falls 8% the next day. Reward correctly identifying soft guidance as the likely explanation rather than concluding "the market is irrational."', xpReward: 25 },
    ],
  },

  // ─── Advanced Instruments (Pro, advanced) ────────────────────────────────
  {
    slug: 'options-basics',
    title: 'Options Basics: Calls & Puts',
    description: 'What options actually are, why their risk is asymmetric, and how a covered call works, taught as education, not a trading pitch.',
    icon: 'GitBranch',
    color: 'amber',
    orderIndex: 20,
    difficulty: 'advanced',
    requiresPro: true,
    unitLabel: 'Advanced Instruments',
    lessons: [
      { slug: 'what-options-are', title: 'What Options Actually Are', type: 'read', topic: 'An option as a contract giving the RIGHT, not the obligation, to buy (call) or sell (put) a stock at a set price by a set date. Plain-English framing, define the term before using it.', xpReward: 10 },
      { slug: 'asymmetric-risk', title: 'Why Options Risk Is Asymmetric', type: 'read', topic: 'Buying an option risks only the premium paid but can expire worthless, while selling (writing) an option can carry much larger risk. Explicitly frame this course as education about how options work, not encouragement to trade them.', xpReward: 10 },
      { slug: 'covered-call-example', title: 'A Covered Call in Plain English', type: 'read', topic: 'The most common beginner-safe options strategy, selling a call against shares you already own, as a concrete worked example of how the pieces (premium, strike, expiration) fit together.', xpReward: 10 },
      { slug: 'options-basics-quiz', title: 'Quick Check: Options Basics', type: 'quiz', topic: 'Test understanding of calls vs puts, premium, and asymmetric risk. 3 questions.', xpReward: 20 },
      { slug: 'options-terms-match', title: 'Match the Options Terms', type: 'match', topic: 'Match vocabulary (Call, Put, Strike Price, Premium, Expiration, In the Money) to plain-English definitions.', xpReward: 15 },
      { slug: 'too-good-to-be-true-options', title: 'Is This Options Trade as Safe as It Sounds?', type: 'scenario', topic: 'An investor is offered an options strategy online described as "can\'t lose." Reward correctly identifying the hidden risk being glossed over.', xpReward: 25 },
    ],
  },

  // ─── Income Investing (Pro, intermediate) ────────────────────────────────
  {
    slug: 'dividend-investing-deep-dive',
    title: 'Dividend Investing Deep Dive',
    description: 'Beyond payout ratio: dividend growth investing, reinvestment strategy, and building an income portfolio that survives a dividend cut.',
    icon: 'TrendingUp',
    color: 'emerald',
    orderIndex: 21,
    difficulty: 'intermediate',
    requiresPro: true,
    unitLabel: 'Income Investing',
    lessons: [
      // NOTE: dividends-income (free, beginner) already covers what a
      // dividend is and payout ratio & sustainability — these lessons build
      // beyond that, not re-teach it.
      { slug: 'growth-vs-high-yield', title: 'Dividend Growth vs. High Yield', type: 'read', topic: 'The difference between chasing the highest current yield and investing in companies with a track record of steadily increasing their dividend over time. Assume the reader already knows what payout ratio is; do not re-explain it.', xpReward: 10 },
      { slug: 'reinvest-or-take-cash', title: 'Reinvesting vs. Taking the Cash', type: 'read', topic: 'How dividend reinvestment compounds over time vs taking dividends as cash income, and when each makes sense depending on whether the investor is in a growth phase or an income phase.', xpReward: 10 },
      { slug: 'resilient-income-portfolio', title: 'Building a Resilient Income Portfolio', type: 'read', topic: 'Diversifying dividend income across sectors so a single company\'s dividend cut does not wreck the whole income stream. Reference diversification as a concept already covered without re-teaching its basics.', xpReward: 10 },
      { slug: 'dividend-investing-quiz', title: 'Quick Check: Dividend Investing', type: 'quiz', topic: 'Test understanding of dividend growth vs yield-chasing and reinvestment vs cash. 3 questions.', xpReward: 20 },
      { slug: 'the-yield-looks-amazing', title: 'The Yield Looks Amazing', type: 'scenario', topic: 'An investor finds a stock with an unusually high dividend yield compared to its sector peers. Reward recognizing this as a potential warning sign (the yield-trap pattern), building on but not repeating the beginner course\'s "Too Good to Be True?" scenario.', xpReward: 25 },
    ],
  },

  // ─── Market Analysis (Pro, intermediate) ─────────────────────────────────
  {
    slug: 'technical-analysis-basics',
    title: 'Technical Analysis Basics',
    description: 'Support and resistance, RSI and MACD, and common chart patterns, going beyond the moving averages already covered in Reading Charts.',
    icon: 'LineChart',
    color: 'blue',
    orderIndex: 22,
    difficulty: 'intermediate',
    requiresPro: true,
    unitLabel: 'Market Analysis',
    lessons: [
      // NOTE: reading-charts (free, beginner) already has an SMA
      // trend-following lesson — this course explicitly goes beyond it.
      { slug: 'support-and-resistance', title: 'Support and Resistance', type: 'read', topic: 'Price levels where a stock has repeatedly stopped falling (support) or stopped rising (resistance), and why other traders watching the same levels can turn them into a self-fulfilling pattern.', xpReward: 10 },
      { slug: 'beyond-moving-average', title: 'Beyond the Moving Average: RSI & MACD', type: 'read', topic: 'Explicitly build beyond simple moving averages, which are already covered elsewhere. Introduce RSI (overbought/oversold) and MACD (momentum shifts) in plain English, no formulas.', xpReward: 10 },
      { slug: 'common-chart-patterns', title: 'Common Chart Patterns', type: 'read', topic: 'A few widely-referenced patterns (double top, head and shoulders, breakout) explained as visual stories about what buyers and sellers are doing, explicitly not as guarantees of future price movement.', xpReward: 10 },
      { slug: 'technical-analysis-quiz', title: 'Quick Check: Technical Analysis', type: 'quiz', topic: 'Test understanding of support/resistance, RSI/MACD, and chart patterns. 3 questions.', xpReward: 20 },
      { slug: 'technical-terms-match', title: 'Match the Technical Terms', type: 'match', topic: 'Match vocabulary (Support, Resistance, RSI, MACD, Breakout, Overbought) to plain-English definitions.', xpReward: 15 },
      { slug: 'signal-or-noise', title: 'Signal or Noise?', type: 'scenario', topic: 'A stock\'s RSI suggests it is "overbought" right as strong fundamental news comes out. Reward reasoning about technical signals as ONE input among several, not an override of fundamentals.', xpReward: 25 },
    ],
  },

  // ─── Global Markets (Pro, advanced) ──────────────────────────────────────
  {
    slug: 'international-crypto-deep-dive',
    title: 'International & Crypto Investing Deep Dive',
    description: 'Home-country bias, currency exposure, and crypto risk beyond the basics, for investors ready to look past their own market.',
    icon: 'Globe',
    color: 'amber',
    orderIndex: 23,
    difficulty: 'advanced',
    requiresPro: true,
    unitLabel: 'Global Markets',
    lessons: [
      { slug: 'home-country-bias', title: 'Home-Country Bias', type: 'read', topic: 'Why investors tend to over-concentrate in companies from their own country, and why that is a real diversification risk even when it does not feel like one.', xpReward: 10 },
      { slug: 'currency-exposure-adrs', title: 'Currency Exposure & ADRs', type: 'read', topic: 'What happens to returns when investing in a foreign company: currency movement adds a second variable beyond the stock price itself. Explain ADRs as one way US investors access foreign companies, noting similar cross-listing mechanisms exist in other markets too.', xpReward: 10 },
      // NOTE: etfs-and-crypto (free, beginner) already has an intro
      // crypto/commodities lesson — this builds explicitly beyond it.
      { slug: 'crypto-beyond-basics', title: 'Crypto Beyond the Basics', type: 'read', topic: 'Explicitly build beyond a beginner crypto intro. Explain stablecoins (what backs them, why they are not "safe" in the traditional sense) and why crypto\'s correlation to other holdings can spike during market stress, meaning its diversification benefit is not guaranteed.', xpReward: 10 },
      { slug: 'global-crypto-quiz', title: 'Quick Check: Global & Crypto Investing', type: 'quiz', topic: 'Test understanding of home-country bias, currency exposure, and crypto-specific risk. 3 questions.', xpReward: 20 },
      { slug: 'diversified-or-just-foreign', title: 'Diversified, or Just Foreign?', type: 'scenario', topic: 'An investor buys a foreign stock believing it diversifies their portfolio, but the company is in the exact same industry as their existing holdings. Reward recognizing that geographic diversification and sector diversification are different things.', xpReward: 25 },
    ],
  },
];
```

- [ ] **Step 2: Verify**

Run: `npx eslint lib/academy/academy-roadmap.ts` — expect no errors.
Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "academy-roadmap"` — expect no output (confirms every `CourseOutline`/`LessonSpec` field is present and correctly typed across all 10 entries).

- [ ] **Step 3: Commit**

```bash
git add lib/academy/academy-roadmap.ts
git commit -m "feat: add the 10-week Academy course roadmap"
```

---

### Task 5: Weekly generation cron

**Files:**
- Create: `app/api/cron/generate-academy-course/route.ts`

**Interfaces:**
- Consumes: `generateCourseLessons` (Task 2), `ACADEMY_ROADMAP` (Task 4), `postToDiscord` (`lib/discord/post-message.ts`).
- Produces: `GET /api/cron/generate-academy-course` → `{ success: true, skipped: true, reason: 'roadmap_exhausted' } | { success: true, courseId, slug, title, lessonCount } | { success: false, error, detail? }`.

- [ ] **Step 1: Write the route**

```ts
/**
 * Academy Weekly Course Generation Cron
 * GET /api/cron/generate-academy-course
 *
 * Works through ACADEMY_ROADMAP (lib/academy/academy-roadmap.ts) one course
 * per run: finds the first roadmap entry whose slug doesn't exist yet in
 * academy_courses, drafts every lesson via Claude (generateCourseLessons —
 * the same generation+validation logic scripts/generate-academy-course.ts
 * uses), and inserts it with is_published: false. A human must explicitly
 * approve it at /admin/academy-roadmap before it becomes visible to real
 * users — unlike the Instagram pipeline, there is no second cron that
 * auto-publishes on a timer. Posts a Discord notification either way
 * (staged for review, or generation failed) so a bad run is never silent.
 *
 * Idempotent: re-running finds the same "next" entry until it exists in the
 * database, then moves to the following one. No-ops once all 10 roadmap
 * entries exist (published or still pending review).
 */

import { NextRequest, NextResponse } from 'next/server';
import { logSecurityEvent } from '@/lib/security/security-events';
import { createServerClient } from '@/lib/supabase/client';
import { generateCourseLessons } from '@/lib/academy/generate-course-content';
import { ACADEMY_ROADMAP } from '@/lib/academy/academy-roadmap';
import { postToDiscord } from '@/lib/discord/post-message';

export const maxDuration = 300;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/generate-academy-course' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  // academy_courses/academy_lessons writes aren't fully covered by generated
  // types — cast at the write site only, same pattern as the other academy routes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: existingCourses } = await supabase.from('academy_courses').select('slug');
  const existingSlugs = new Set((existingCourses ?? []).map((c: { slug: string }) => c.slug));

  const nextOutline = ACADEMY_ROADMAP.find((o) => !existingSlugs.has(o.slug));

  if (!nextOutline) {
    return NextResponse.json({ success: true, skipped: true, reason: 'roadmap_exhausted' });
  }

  const webhookUrl = process.env.DISCORD_ACADEMY_WEBHOOK_URL;

  let contents: unknown[];
  try {
    contents = await generateCourseLessons(nextOutline);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[generate-academy-course] generation failed for "${nextOutline.slug}":`, err);
    if (webhookUrl) {
      await postToDiscord(webhookUrl, {
        embeds: [{
          title: `Academy course generation FAILED — ${nextOutline.title}`,
          description: detail.slice(0, 500),
          color: 0xef4444,
          timestamp: new Date().toISOString(),
        }],
      }).catch((e) => console.error('[generate-academy-course] Discord failure notification failed:', e));
    }
    return NextResponse.json({ success: false, error: 'generation_failed', detail }, { status: 500 });
  }

  const { data: courseRow, error: courseError } = await db
    .from('academy_courses')
    .insert({
      slug: nextOutline.slug,
      title: nextOutline.title,
      description: nextOutline.description,
      icon: nextOutline.icon,
      color: nextOutline.color,
      order_index: nextOutline.orderIndex,
      difficulty: nextOutline.difficulty,
      requires_pro: nextOutline.requiresPro ?? false,
      unit_label: nextOutline.unitLabel,
      is_published: false,
    })
    .select('id')
    .single();

  if (courseError || !courseRow) {
    console.error('[generate-academy-course] course insert failed:', courseError);
    return NextResponse.json({ success: false, error: courseError?.message ?? 'course_insert_failed' }, { status: 500 });
  }

  const lessonRows = nextOutline.lessons.map((lesson, i) => ({
    course_id: courseRow.id,
    slug: lesson.slug,
    title: lesson.title,
    type: lesson.type,
    order_index: i,
    xp_reward: lesson.xpReward,
    content: contents[i],
  }));

  const { error: lessonsError } = await db.from('academy_lessons').insert(lessonRows);

  if (lessonsError) {
    console.error('[generate-academy-course] lesson insert failed:', lessonsError);
    // Best-effort cleanup so a half-written course doesn't linger as an
    // un-reviewable, lesson-less draft on the admin page.
    await db.from('academy_courses').delete().eq('id', courseRow.id);
    return NextResponse.json({ success: false, error: lessonsError.message }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bullpen.no';
  if (webhookUrl) {
    await postToDiscord(webhookUrl, {
      embeds: [{
        title: `Academy course staged for review — ${nextOutline.title}`,
        description:
          `${nextOutline.lessons.length} lessons, ${nextOutline.difficulty}${nextOutline.requiresPro ? ' · Pro' : ' · Free'}.\n\n` +
          nextOutline.lessons.map((l, i) => `${i + 1}. ${l.title} (${l.type})`).join('\n') +
          `\n\nReview and approve: ${appUrl}/admin/academy-roadmap`,
        color: 0x34d399,
        timestamp: new Date().toISOString(),
      }],
    }).catch((e) => console.error('[generate-academy-course] Discord notification failed:', e));
  } else {
    console.warn('[generate-academy-course] DISCORD_ACADEMY_WEBHOOK_URL not set, skipping review notification');
  }

  return NextResponse.json({
    success: true,
    courseId: courseRow.id,
    slug: nextOutline.slug,
    title: nextOutline.title,
    lessonCount: nextOutline.lessons.length,
  });
}
```

- [ ] **Step 2: Verify**

Run: `npx eslint "app/api/academy/../cron/generate-academy-course/route.ts"` (or simply `npx eslint "app/api/cron/generate-academy-course/route.ts"`) — expect no errors. Live verification (actually generating a course) happens in Task 10, after the admin review UI exists to inspect the result.

- [ ] **Step 3: Commit**

```bash
git add "app/api/cron/generate-academy-course/route.ts"
git commit -m "feat: add weekly Academy course generation cron"
```

---

### Task 6: Admin API — list drafts, approve, reject

**Files:**
- Create: `app/api/admin/academy-roadmap/route.ts`
- Create: `app/api/admin/academy-roadmap/[courseId]/route.ts`

**Interfaces:**
- Consumes: `withAuth`/`addSecurityHeaders` (`lib/security/api-security.ts`), `getTier`/`isAdmin` (`lib/billing/tier.ts`).
- Produces: `DraftLessonRow`, `DraftCourseRow`, `AcademyRoadmapListResponse` types (consumed by Task 8's client component); `GET /api/admin/academy-roadmap`, `POST /api/admin/academy-roadmap/[courseId]` (approve), `DELETE /api/admin/academy-roadmap/[courseId]` (reject).

- [ ] **Step 1: Write the list route**

```ts
// app/api/admin/academy-roadmap/route.ts
import { NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { getTier, isAdmin } from '@/lib/billing/tier';
import { logSecurityEvent } from '@/lib/security/security-events';

export interface DraftLessonRow {
  id: string;
  slug: string;
  title: string;
  type: string;
  orderIndex: number;
  xpReward: number;
  content: unknown;
}

export interface DraftCourseRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  difficulty: string | null;
  requiresPro: boolean;
  unitLabel: string | null;
  orderIndex: number;
  createdAt: string;
  lessons: DraftLessonRow[];
}

export interface AcademyRoadmapListResponse {
  drafts: DraftCourseRow[];
}

async function handler(
  _req: unknown,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  // Admin-only. 404, not 403 — same UX as /admin/feedback's page-level guard.
  if (!isAdmin(await getTier(session.userId))) {
    logSecurityEvent('admin_access_denied', { userId: session.userId, path: '/api/admin/academy-roadmap' });
    return addSecurityHeaders(NextResponse.json({ error: 'not_found' }, { status: 404 }));
  }

  const supabase = createServerClient();

  const { data: courses, error } = await supabase
    .from('academy_courses')
    .select('id, slug, title, description, difficulty, requires_pro, unit_label, order_index, created_at')
    .eq('is_published', false)
    .order('order_index');

  if (error) {
    return addSecurityHeaders(NextResponse.json({ error: error.message }, { status: 500 }));
  }

  const courseRows = (courses ?? []) as Array<{
    id: string; slug: string; title: string; description: string | null;
    difficulty: string | null; requires_pro: boolean; unit_label: string | null;
    order_index: number; created_at: string;
  }>;

  if (courseRows.length === 0) {
    return addSecurityHeaders(NextResponse.json({ drafts: [] }));
  }

  const { data: lessons } = await supabase
    .from('academy_lessons')
    .select('id, course_id, slug, title, type, order_index, xp_reward, content')
    .in('course_id', courseRows.map((c) => c.id))
    .order('order_index');

  const lessonsByCourse = new Map<string, DraftLessonRow[]>();
  for (const l of (lessons ?? []) as Array<{
    id: string; course_id: string; slug: string; title: string; type: string;
    order_index: number; xp_reward: number; content: unknown;
  }>) {
    const arr = lessonsByCourse.get(l.course_id) ?? [];
    arr.push({ id: l.id, slug: l.slug, title: l.title, type: l.type, orderIndex: l.order_index, xpReward: l.xp_reward, content: l.content });
    lessonsByCourse.set(l.course_id, arr);
  }

  const drafts: DraftCourseRow[] = courseRows.map((c) => ({
    id: c.id,
    slug: c.slug,
    title: c.title,
    description: c.description ?? '',
    difficulty: c.difficulty,
    requiresPro: c.requires_pro,
    unitLabel: c.unit_label,
    orderIndex: c.order_index,
    createdAt: c.created_at,
    lessons: lessonsByCourse.get(c.id) ?? [],
  }));

  return addSecurityHeaders(NextResponse.json({ drafts }));
}

export const GET = withAuth(handler);
```

- [ ] **Step 2: Write the approve/reject route**

```ts
// app/api/admin/academy-roadmap/[courseId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { getTier, isAdmin } from '@/lib/billing/tier';
import { logSecurityEvent } from '@/lib/security/security-events';

async function approveHandler(
  _req: NextRequest,
  context: { params: Promise<{ courseId: string }> },
  session: { userId: string }
): Promise<NextResponse> {
  if (!isAdmin(await getTier(session.userId))) {
    logSecurityEvent('admin_access_denied', { userId: session.userId, path: '/api/admin/academy-roadmap/[courseId]' });
    return addSecurityHeaders(NextResponse.json({ error: 'not_found' }, { status: 404 }));
  }

  const { courseId } = await context.params;
  const supabase = createServerClient();

  const { error } = await supabase
    .from('academy_courses')
    .update({ is_published: true })
    .eq('id', courseId)
    .eq('is_published', false); // only ever publish a draft — never re-touch an already-live course

  if (error) {
    return addSecurityHeaders(NextResponse.json({ error: error.message }, { status: 500 }));
  }

  return addSecurityHeaders(NextResponse.json({ success: true }));
}

async function rejectHandler(
  _req: NextRequest,
  context: { params: Promise<{ courseId: string }> },
  session: { userId: string }
): Promise<NextResponse> {
  if (!isAdmin(await getTier(session.userId))) {
    logSecurityEvent('admin_access_denied', { userId: session.userId, path: '/api/admin/academy-roadmap/[courseId]' });
    return addSecurityHeaders(NextResponse.json({ error: 'not_found' }, { status: 404 }));
  }

  const { courseId } = await context.params;
  const supabase = createServerClient();

  // Lessons cascade-delete via their course_id FK (ON DELETE CASCADE,
  // 058_academy.sql). The is_published: false filter means this can only
  // ever remove a draft, never an already-published course. Deleting the
  // row (rather than just leaving it) frees the slug, so the next cron run
  // regenerates this same roadmap entry instead of skipping it forever.
  const { error } = await supabase
    .from('academy_courses')
    .delete()
    .eq('id', courseId)
    .eq('is_published', false);

  if (error) {
    return addSecurityHeaders(NextResponse.json({ error: error.message }, { status: 500 }));
  }

  return addSecurityHeaders(NextResponse.json({ success: true }));
}

export const POST = withAuth(approveHandler);
export const DELETE = withAuth(rejectHandler);
```

- [ ] **Step 3: Verify**

Run: `npx eslint "app/api/admin/academy-roadmap/route.ts" "app/api/admin/academy-roadmap/[courseId]/route.ts"` — expect no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/api/admin/academy-roadmap/route.ts" "app/api/admin/academy-roadmap/[courseId]/route.ts"
git commit -m "feat: add admin API to list, approve, and reject draft Academy courses"
```

---

### Task 7: Admin page

**Files:**
- Create: `app/admin/academy-roadmap/page.tsx`
- Create: `app/admin/academy-roadmap/AdminAcademyRoadmapClient.tsx`

**Interfaces:**
- Consumes: `getSessionForApiRoute` (`lib/security/api-security.ts`), `getTier`/`isAdmin`, `AcademyRoadmapListResponse`/`DraftCourseRow`/`DraftLessonRow` (Task 6).

- [ ] **Step 1: Write the server page**

```tsx
// app/admin/academy-roadmap/page.tsx
import { notFound } from 'next/navigation';
import { getSessionForApiRoute } from '@/lib/security/api-security';
import { getTier, isAdmin } from '@/lib/billing/tier';
import { AdminAcademyRoadmapClient } from './AdminAcademyRoadmapClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin · Academy Roadmap' };

/**
 * Server-rendered admin gate. Same pattern as /admin/feedback and
 * /admin/costs: any non-admin gets a real 404, the client bundle is only
 * delivered to admins.
 */
export default async function AdminAcademyRoadmapPage() {
  const session = await getSessionForApiRoute();
  if (!session) notFound();

  const tier = await getTier(session.userId);
  if (!isAdmin(tier)) notFound();

  return <AdminAcademyRoadmapClient />;
}
```

- [ ] **Step 2: Write the client component**

```tsx
// app/admin/academy-roadmap/AdminAcademyRoadmapClient.tsx
'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AcademyRoadmapListResponse, DraftCourseRow, DraftLessonRow } from '@/app/api/admin/academy-roadmap/route';

const QUERY_KEY = ['academy-roadmap-drafts'];

/** Light, readable per-type render — not the full interactive lesson
 * player, just enough for a human to catch a factual or schema error
 * before approving. */
function LessonPreview({ lesson }: { lesson: DraftLessonRow }) {
  if (lesson.type === 'read') {
    const c = lesson.content as { sections: { text: string; highlightedTerms: { term: string; definition: string }[] }[]; funFact?: string };
    return (
      <div className="space-y-2 text-sm text-muted-foreground">
        {c.sections?.map((s, i) => (
          <div key={i}>
            <p>{s.text}</p>
            {s.highlightedTerms?.length > 0 && (
              <ul className="ml-4 mt-1 list-disc text-xs">
                {s.highlightedTerms.map((t, j) => (
                  <li key={j}><strong className="text-foreground">{t.term}:</strong> {t.definition}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {c.funFact && <p className="italic">Fun fact: {c.funFact}</p>}
      </div>
    );
  }
  if (lesson.type === 'quiz') {
    const c = lesson.content as { questions: { question: string; options: string[]; correctIndex: number; explanation: string }[] };
    return (
      <div className="space-y-3 text-sm">
        {c.questions?.map((q, i) => (
          <div key={i}>
            <p className="font-medium text-foreground">{i + 1}. {q.question}</p>
            <ul className="ml-4 list-disc text-muted-foreground">
              {q.options.map((o, j) => (
                <li key={j} className={j === q.correctIndex ? 'font-semibold text-emerald-500' : undefined}>{o}</li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground/80">{q.explanation}</p>
          </div>
        ))}
      </div>
    );
  }
  if (lesson.type === 'match') {
    const c = lesson.content as { pairs: { term: string; definition: string }[] };
    return (
      <ul className="ml-4 list-disc text-sm text-muted-foreground">
        {c.pairs?.map((p, i) => <li key={i}><strong className="text-foreground">{p.term}:</strong> {p.definition}</li>)}
      </ul>
    );
  }
  if (lesson.type === 'scenario') {
    const c = lesson.content as { setup: string; choices: { label: string; feedback: string; isCorrect: boolean }[] };
    return (
      <div className="space-y-2 text-sm">
        <p className="text-muted-foreground">{c.setup}</p>
        <ul className="ml-4 list-disc">
          {c.choices?.map((ch, i) => (
            <li key={i} className={ch.isCorrect ? 'text-emerald-500' : 'text-muted-foreground'}>
              <strong>{ch.label}</strong> — {ch.feedback}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return <pre className="overflow-x-auto text-xs text-muted-foreground">{JSON.stringify(lesson.content, null, 2)}</pre>;
}

function DraftCard({ course }: { course: DraftCourseRow }) {
  const queryClient = useQueryClient();
  const [expandedLesson, setExpandedLesson] = useState<string | null>(null);

  const approve = useMutation({
    mutationFn: () => fetch(`/api/admin/academy-roadmap/${course.id}`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
  const reject = useMutation({
    mutationFn: () => fetch(`/api/admin/academy-roadmap/${course.id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">{course.title}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {course.unitLabel ?? 'Uncategorized'} · {course.difficulty ?? 'unset'} · {course.requiresPro ? 'Pro' : 'Free'} · {course.lessons.length} lessons
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" disabled={reject.isPending} onClick={() => reject.mutate()}>
              <X className="h-3.5 w-3.5" /> Reject
            </Button>
            <Button size="sm" className="gap-1.5 bg-emerald-500 text-white hover:bg-emerald-600" disabled={approve.isPending} onClick={() => approve.mutate()}>
              <Check className="h-3.5 w-3.5" /> Approve & Publish
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">{course.description}</p>
        {course.lessons.map((lesson) => (
          <div key={lesson.id} className="rounded-lg border border-border/40">
            <button
              onClick={() => setExpandedLesson(expandedLesson === lesson.id ? null : lesson.id)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm"
              aria-expanded={expandedLesson === lesson.id}
            >
              <span>{lesson.orderIndex + 1}. {lesson.title} <span className="text-muted-foreground">({lesson.type})</span></span>
              {expandedLesson === lesson.id ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
            </button>
            {expandedLesson === lesson.id && (
              <div className={cn('border-t border-border/40 px-3 py-2.5')}>
                <LessonPreview lesson={lesson} />
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function AdminAcademyRoadmapClient() {
  const { data, isLoading } = useQuery<AcademyRoadmapListResponse>({
    queryKey: QUERY_KEY,
    queryFn: () => fetch('/api/admin/academy-roadmap').then((r) => r.json()),
    staleTime: 10_000,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-bold">Academy Roadmap — Pending Review</h1>
        <p className="text-sm text-muted-foreground">
          Courses generated by the weekly cron, staged unpublished until approved.
        </p>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && (data?.drafts.length ?? 0) === 0 && (
        <p className="text-sm text-muted-foreground">Nothing pending review.</p>
      )}
      {data?.drafts.map((course) => <DraftCard key={course.id} course={course} />)}
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npx eslint app/admin/academy-roadmap/page.tsx app/admin/academy-roadmap/AdminAcademyRoadmapClient.tsx` — expect no errors.

- [ ] **Step 4: Commit**

```bash
git add app/admin/academy-roadmap/page.tsx app/admin/academy-roadmap/AdminAcademyRoadmapClient.tsx
git commit -m "feat: add admin Academy roadmap review page"
```

---

### Task 8: Scheduler + docs

**Files:**
- Create: `.github/workflows/cron-academy-course-weekly.yml`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `/api/cron/generate-academy-course` (Task 5).

- [ ] **Step 1: Write the workflow**

```yaml
name: Cron — Academy Weekly Course Generation

# Monday 06:00 UTC. Drafts the next course in the 10-week roadmap
# (lib/academy/academy-roadmap.ts) via Claude and stages it unpublished.
# Time-tolerant (a weekly content drop, not market-hours-sensitive), same
# reasoning as the other non-Vercel crons in this repo. Requires explicit
# human approval at /admin/academy-roadmap before a course goes live — there
# is no auto-publish step, unlike the Instagram earnings pipeline.
on:
  schedule:
    - cron: '0 6 * * 1'
  workflow_dispatch:

jobs:
  trigger:
    runs-on: ubuntu-latest
    timeout-minutes: 6
    steps:
      - name: POST /api/cron/generate-academy-course
        env:
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
          APP_URL: ${{ vars.APP_URL || 'https://bullpen.no' }}
        run: |
          if [ -z "$CRON_SECRET" ]; then
            echo "::error::CRON_SECRET secret is not configured in repo settings"
            exit 1
          fi
          curl -fsS -X GET \
            -H "Authorization: Bearer ${CRON_SECRET}" \
            "${APP_URL}/api/cron/generate-academy-course"
```

- [ ] **Step 2: Update `CLAUDE.md`'s GitHub Actions crons table**

Add a row to the existing table (the one listing `check-user-alerts`, `check-earnings-upcoming`, etc.):

```markdown
| `/api/cron/generate-academy-course` | `0 6 * * 1` | Draft the next course in the 10-week Academy roadmap (`lib/academy/academy-roadmap.ts`) via Claude and stage it unpublished for review at `/admin/academy-roadmap`. No auto-publish — requires explicit approval. |
```

Insert it as a new row anywhere in that table (row order in the existing table isn't semantically significant beyond grouping by rough theme).

- [ ] **Step 3: Verify**

Run: `npm run test-cron-coverage` — expect `All cron-coverage invariants hold.` with no failures, confirming the new route has a real scheduler and the workflow references a route file that actually exists.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/cron-academy-course-weekly.yml CLAUDE.md
git commit -m "feat: schedule weekly Academy course generation, document in CLAUDE.md"
```

---

### Task 9: Environment variable

**Files:** None — this is a manual, out-of-band step, not a code change.

- [ ] **Step 1: Note the required environment variable**

`DISCORD_ACADEMY_WEBHOOK_URL` needs to be set (in Vercel's environment variables and `.env.local` for local testing) before the cron's review notification will actually post anywhere. The route already degrades gracefully without it (logs a warning, still stages the course), so this isn't a hard blocker for Task 10's verification — but the review workflow isn't real until it's set. This step has no code to write; flag it to the user in the final report (Task 10, Step 5) as a manual action item, matching how other Discord webhook env vars were rolled out per `CLAUDE.md`'s "Optional but used in production" list.

---

### Task 10: End-to-end verification

**Files:** None — verification only.

- [ ] **Step 1: Full project lint and cron-coverage check**

Run: `npm run lint` — expect 0 errors.
Run: `npm run test-cron-coverage` — expect all checks to pass (also covered in Task 8, re-confirm here as part of the full pass).

- [ ] **Step 2: Live-trigger the cron against the dev server**

With the dev server running and `CRON_SECRET` set in `.env.local`, run:

```bash
curl -s -X GET -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/generate-academy-course
```

Expected: a `{"success":true,"courseId":"...","slug":"taxes-on-investing","title":"Taxes on Investing","lessonCount":5}` response (the first roadmap entry, since none exist in the database yet). This is a real Claude Opus generation run across 5 lessons — a genuine cost, not a throwaway test, since "Taxes on Investing" is real roadmap content that's worth actually shipping if it reads well.

- [ ] **Step 3: Confirm the draft is invisible to regular users but visible to admins**

Browser: as a non-admin user, load `/academy` — confirm "Taxes on Investing" does **not** appear anywhere (still `is_published: false`). As an admin (or via direct Supabase query), confirm the course and its 5 lessons exist in `academy_courses`/`academy_lessons` with `is_published = false`.

- [ ] **Step 4: Review and act on the draft via the admin page**

Browser, logged in as an admin: navigate to `/admin/academy-roadmap`. Confirm the "Taxes on Investing" card renders with the correct metadata (Money Matters · beginner · Free · 5 lessons) and that expanding each lesson shows a readable preview matching its type (read sections with highlighted terms, quiz options with the correct one visually marked, the scenario's choices with feedback). Read the actual generated content for accuracy and tone — this is the real point of the admin page. If it reads well, click **Approve & Publish**; confirm the card disappears from the pending list and the course now appears on `/academy` for a regular user, in the "Money Matters" chapter, positioned correctly relative to existing chapters. If anything reads badly, click **Reject** instead, confirm the card disappears, then re-run Step 2's curl command and confirm the cron regenerates the same `taxes-on-investing` slot (proving the reject-and-requeue behavior from Design Decision 3) rather than skipping to the next roadmap entry.

- [ ] **Step 5: Report back**

Summarize what shipped, and explicitly flag: (a) `DISCORD_ACADEMY_WEBHOOK_URL` still needs to be set for the review notification to actually post (Task 9); (b) whether "Taxes on Investing" was approved for real during Step 4, since that's a real, permanent content addition, not a test fixture to clean up.

---

## Self-Review

**Spec coverage:**
1. No migration, reuses `is_published` — Task 5 (insert), verified no migration task exists anywhere in this plan. ✓
2. Explicit approval, no auto-publish timer — Task 6/7 (approve/reject actions), explicitly no second cron anywhere in this plan (Design Decision 2 contrasted against the Instagram pipeline by name). ✓
3. Reject deletes and re-queues — Task 6 Step 2 (`DELETE .eq('is_published', false)`), verified end-to-end in Task 10 Step 4. ✓
4. Roadmap as git-reviewable data, not a table — Task 4 (`lib/academy/academy-roadmap.ts`, a plain exported array). ✓
5. Text-only lesson types — every lesson across all 10 outlines in Task 4 is `read`/`quiz`/`match`/`scenario`; none is `demo`/`chart-tour`. ✓
6. Country-neutral, overlap-checked content — Task 4's inline comments cite the specific existing lessons each course was checked against (position sizing, payout ratio, SMA, crypto intro) and explain what each new course does differently. ✓
7. Contiguous unit labels — every new unit (Money Matters, Investor Mindset, Company Research, Advanced Instruments, Income Investing, Market Analysis, Global Markets) is a fresh label used only within its own contiguous `order_index` run (14-16, 17, 18-19, 20, 21, 22, 23 respectively); none reuses an existing catalog label. ✓

**Placeholder scan:** No `TBD`/`TODO` found. Task 9 (env var) is deliberately a no-code manual-action task, not a placeholder for skipped work — it's called out explicitly as such, with the reasoning for why it doesn't block Task 10's verification.

**Type consistency:** `CourseOutline`/`LessonSpec` (Task 1) is the single type imported by Tasks 2, 3, 4, 5 with no redefinition. `DraftCourseRow`/`DraftLessonRow`/`AcademyRoadmapListResponse` (Task 6) are the types Task 7's client component imports verbatim (`from '@/app/api/admin/academy-roadmap/route'`), including the `content: unknown` field the list route added specifically so the admin preview has something to render. The approve/reject route's URL shape (`/api/admin/academy-roadmap/${course.id}`, `POST`/`DELETE`) matches exactly between Task 6's route definition and Task 7's `useMutation` calls.
