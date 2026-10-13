/**
 * Display order for a question's options, as original indexes.
 *
 * Every Academy question was model-written with the right answer usually in
 * second place: on 2026-10-13, option B was correct for 68% of lesson quiz
 * questions, 83% of scenarios and every final-quiz question, and the daily
 * challenge was A or B 96 times out of 97. "Always pick B" beat reading.
 *
 * Shuffled by a hash of the question text rather than Math.random, so the
 * order is stable across re-renders and server/client, and the same for
 * everyone. Players render options in this order but keep every pick in the
 * original index space, so grading (client and server) is untouched.
 */
export function optionOrder(count: number, seed: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const j = h % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
