/**
 * The correct answer must not sit in a predictable slot once options are
 * shuffled for display (lib/academy/option-order.ts). Reads every live quiz
 * question, scenario and daily challenge and fails if any one display slot
 * holds more than 45% of correct answers, or if an order isn't a permutation.
 *   npx tsx scripts/test-academy-option-order.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import assert from 'node:assert/strict';
import { createServerClient } from '../lib/supabase/client';
import { optionOrder } from '../lib/academy/option-order';
import type { QuizContent, ScenarioContent } from '../types/academy';

type LessonRow = { type: 'quiz'; content: QuizContent } | { type: 'scenario'; content: ScenarioContent };
type DailyRow = { question: string; options: string[]; correct_index: number };

(async () => {
  const db = createServerClient();
  const [{ data: lessons }, { data: daily }] = await Promise.all([
    db.from('academy_lessons').select('type, content').in('type', ['quiz', 'scenario']),
    db.from('academy_daily_challenges').select('question, options, correct_index'),
  ]);
  const items: { seed: string; count: number; correct: number }[] = [];
  for (const l of (lessons ?? []) as LessonRow[]) {
    if (l.type === 'quiz') for (const q of l.content.questions) items.push({ seed: q.question, count: q.options.length, correct: q.correctIndex });
    else items.push({ seed: l.content.setup, count: l.content.choices.length, correct: l.content.choices.findIndex((c) => c.isCorrect) });
  }
  for (const d of (daily ?? []) as DailyRow[]) items.push({ seed: d.question, count: d.options.length, correct: d.correct_index });

  const slots = new Map<number, number>();
  for (const it of items) {
    const order = optionOrder(it.count, it.seed);
    assert.deepEqual([...order].sort((a, b) => a - b), Array.from({ length: it.count }, (_, i) => i), 'not a permutation');
    assert.deepEqual(order, optionOrder(it.count, it.seed), 'not deterministic');
    const shown = order.indexOf(it.correct);
    slots.set(shown, (slots.get(shown) ?? 0) + 1);
  }
  const worst = Math.max(...slots.values()) / items.length;
  console.log(`${items.length} questions; correct answer by display slot:`, Object.fromEntries([...slots].sort()));
  assert.ok(worst <= 0.45, `one slot holds ${(worst * 100).toFixed(0)}% of correct answers`);
  console.log('ok');
})();
