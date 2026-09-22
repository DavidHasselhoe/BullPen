/**
 * Live smoke test for Ask Bull's provider. Costs a few cents.
 *   npm run test-chat-provider
 *
 * Runs runAgent() twice with the same prefix and reports the token split, which
 * is the only way to know three things actually work together:
 *
 *   1. the model swap (Sonnet 5 answers at all, with 23 tools attached),
 *   2. prompt caching (the second call reads the prefix instead of re-sending
 *      it), and
 *   3. the cost arithmetic, printed both ways so the saving is visible.
 *
 * Caching is a prefix match, so it only works while the volatile per-user
 * prefixes stay BEHIND the breakpoint. That is easy to undo by accident, and
 * the symptom is silent: nothing breaks, the bill just quintuples. This is the
 * check that catches it.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import type { UIMessage } from 'ai';
import { runAgent } from '../lib/ai/agent';
import { calcCost } from '../lib/billing/pricing';

const MODEL = 'claude-sonnet-5';

function ask(text: string): UIMessage[] {
  return [{ id: '1', role: 'user', parts: [{ type: 'text', text }] }] as UIMessage[];
}

async function turn(label: string, question: string) {
  const result = await runAgent(
    ask(question),
    null,
    'intermediate',
    'en',
    null,
    null,
    null,
    // A userId would add the conditional tools and change the cached prefix;
    // left null so both turns share one prefix.
    null,
    false,
  );

  let text = '';
  for await (const chunk of result.textStream) text += chunk;

  const usage = await result.usage;
  const details = usage.inputTokenDetails ?? {};
  const read = details.cacheReadTokens ?? 0;
  const write = details.cacheWriteTokens ?? 0;
  const fresh = details.noCacheTokens ?? Math.max(0, (usage.inputTokens ?? 0) - read - write);

  const realCost = calcCost(MODEL, usage.inputTokens ?? 0, usage.outputTokens ?? 0, {
    noCacheTokens: fresh,
    cacheReadTokens: read,
    cacheWriteTokens: write,
  });
  const naiveCost = calcCost(MODEL, usage.inputTokens ?? 0, usage.outputTokens ?? 0);

  console.log(`\n── ${label} ─────────────────────────────`);
  console.log(`  answer      : ${text.slice(0, 110).replace(/\s+/g, ' ')}${text.length > 110 ? '…' : ''}`);
  console.log(`  input       : ${usage.inputTokens} (fresh ${fresh}, cache read ${read}, cache write ${write})`);
  console.log(`  output      : ${usage.outputTokens}`);
  console.log(`  cost        : $${realCost.toFixed(6)}   (priced as all-fresh: $${naiveCost.toFixed(6)})`);

  return { text, read, write, fresh, realCost, naiveCost };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('no ANTHROPIC_API_KEY in .env.local');

  // First turn writes the prefix into the cache, second should read it.
  const first = await turn('turn 1 (cold)', 'In one sentence, what does BullPen do?');
  const second = await turn('turn 2 (warm)', 'In one sentence, what is a P/E ratio?');

  console.log('\n── verdict ─────────────────────────────');

  if (first.text.trim().length === 0 && second.text.trim().length === 0) {
    throw new Error('Sonnet 5 returned no text on either turn — the swap is not working');
  }
  console.log('  model       : answering');

  if (second.read > 0) {
    const saved = second.naiveCost - second.realCost;
    console.log(`  caching     : ${second.read} tokens read from cache, saving $${saved.toFixed(6)} on that turn`);
    console.log(`  free tier   : 15 turns/day ≈ $${(second.realCost * 15 * 30).toFixed(2)}/month, vs $${(second.naiveCost * 15 * 30).toFixed(2)} uncached`);
  } else {
    console.log('  caching     : NOT HIT on the warm turn.');
    console.log('                Check that the volatile prefixes in agent.ts still sit');
    console.log('                after the cache breakpoint, and that the tool set did');
    console.log('                not change between the two calls.');
  }
}

main().catch((err) => {
  console.error('\nfailed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
