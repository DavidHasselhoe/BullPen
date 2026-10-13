/**
 * Drafts a short check after every Academy read lesson that is followed by
 * another read, so no course makes a learner read twice in a row.
 *
 *   npx tsx scripts/academy-interleave-checks.ts --dry-run   # free: lists what it would write
 *   npx tsx scripts/academy-interleave-checks.ts             # Claude calls, ~$1-2 for the whole Academy
 *
 * Writes content/academy-staging/interleave-checks.json and nothing else: the
 * live lessons are untouched until the staged file is reviewed and applied
 * (scripts/academy-apply-staging.ts). Each check is grounded in the read
 * lesson's actual text, not its title, so it tests what was just taught.
 *
 * Why: 21 of 24 courses had two or three read lessons back to back (about
 * 6,000 characters before the first tap in the Pro courses), which is the
 * "here, read this" pattern the Academy is meant to avoid.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import fs from 'node:fs';
import path from 'node:path';
import { createServerClient } from '../lib/supabase/client';
import { generateCourseLessons } from '../lib/academy/generate-course-content';
import type { CourseOutline } from '../lib/academy/course-outline-types';

const OUT = path.join('content', 'academy-staging', 'interleave-checks.json');
const CHECK_XP = 10;

interface Row {
  id: string;
  slug: string;
  title: string;
  type: string;
  order_index: number;
  content: { sections?: { text: string }[] } | null;
  academy_courses: { slug: string; order_index: number };
}

export interface StagedCheck {
  courseSlug: string;
  afterLessonSlug: string;
  slug: string;
  title: string;
  xpReward: number;
  content: unknown;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const { data, error } = await createServerClient()
    .from('academy_lessons')
    .select('id, slug, title, type, order_index, content, academy_courses!inner(slug, order_index, is_published)')
    .eq('academy_courses.is_published', true)
    .order('order_index');
  if (error) throw error;

  const byCourse = new Map<string, Row[]>();
  for (const r of (data ?? []) as unknown as Row[]) {
    const list = byCourse.get(r.academy_courses.slug) ?? [];
    list.push(r);
    byCourse.set(r.academy_courses.slug, list);
  }

  const targets: { courseSlug: string; read: Row }[] = [];
  for (const [courseSlug, lessons] of byCourse) {
    lessons.sort((a, b) => a.order_index - b.order_index);
    lessons.forEach((l, i) => {
      if (l.type === 'read' && lessons[i + 1]?.type === 'read') targets.push({ courseSlug, read: l });
    });
  }

  console.error(`${targets.length} checks to draft across ${new Set(targets.map((t) => t.courseSlug)).size} courses.`);
  if (dryRun) {
    for (const t of targets) console.log(`${t.courseSlug}: after "${t.read.title}"`);
    return;
  }

  const existing: StagedCheck[] = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : [];
  const done = new Set(existing.map((c) => `${c.courseSlug}/${c.afterLessonSlug}`));
  const staged = [...existing];

  for (const { courseSlug, read } of targets) {
    if (done.has(`${courseSlug}/${read.slug}`)) continue; // resumable
    const text = (read.content?.sections ?? []).map((s) => s.text).join('\n\n');
    const spec = {
      slug: `${read.slug}-check`,
      title: `Check: ${read.title}`,
      type: 'quiz' as const,
      xpReward: CHECK_XP,
      topic:
        `A 2-question check on the lesson the learner just read, and nothing else. Every question must be answerable ` +
        `from the lesson text below and test whether they understood it (apply it to a small example, spot the right ` +
        `reading of a number), not whether they remember a phrase. Plausible wrong options, no trick wording.\n\n` +
        `Lesson "${read.title}":\n${text}`,
    };
    const [content] = await generateCourseLessons({ lessons: [spec] } as unknown as CourseOutline, console.error);
    staged.push({ courseSlug, afterLessonSlug: read.slug, slug: spec.slug, title: spec.title, xpReward: CHECK_XP, content });
    // Written after every lesson so a failure halfway keeps what was paid for.
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(staged, null, 2) + '\n');
  }
  console.error(`Staged ${staged.length} checks in ${OUT}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
