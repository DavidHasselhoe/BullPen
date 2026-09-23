/**
 * Behavioural probe for Ask Bull's routing. Live calls, costs a few cents.
 *   npm run test-bull-routing
 *
 * A prompt edit is a hypothesis, not a conclusion. This exercises the routing
 * decisions the system prompt is actually responsible for and prints which
 * tools got called, so a prompt change can be judged on behaviour rather than
 * on whether it reads nicely.
 *
 * Every case here is read-only or navigation. Nothing in this file may use a
 * prompt that could call addHolding, updateHolding, removeHolding or
 * createAlert: those mutate real data.
 *
 * Expectations are deliberately loose (a set of acceptable tools, not one
 * exact call), because there is usually more than one reasonable route and a
 * brittle assertion here would fail on a better answer.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import type { UIMessage } from 'ai';
import { runAgent } from '../lib/ai/agent';

interface Case {
  name: string;
  prompt: string;
  /** Any one of these being called counts as correct routing. */
  expectOneOf: string[];
  /** Calling any of these is wrong, and says what went wrong. */
  expectNone?: string[];
  /** Checked against the reply text, for cases where the answer is the point. */
  expectText?: RegExp;
  /**
   * navigateTo does seven jobs since the 2026-09-22 collapse, so asserting it
   * was called says almost nothing. This pins which destination it picked.
   */
  expectDestination?: string;
}

const CASES: Case[] = [
  {
    name: 'price question takes the 1-credit tool',
    prompt: 'What is NVDA trading at right now?',
    expectOneOf: ['getLiveQuote'],
    // A ~100-credit statement fetch or a ~250-credit health score for a price.
    expectNone: ['getCompanyFinancials', 'getHealthScore', 'getKeyStatistics'],
  },
  {
    name: 'comparison opens the comparison page, not the screener',
    prompt: 'Compare NVDA and AMD for me',
    expectOneOf: ['navigateTo'],
    expectDestination: 'compare',
    expectNone: ['openScreener'],
  },
  {
    name: 'screening applies the filters it was given',
    prompt: 'Show me large-cap technology stocks with strong fundamentals',
    expectOneOf: ['openScreener'],
  },
  {
    name: 'financial health uses the computed score',
    prompt: "How is Microsoft's financial health?",
    expectOneOf: ['getHealthScore'],
  },
  {
    name: 'building dividend income goes to the calculator, not the screener',
    prompt: 'Build me a high yield dividend portfolio',
    expectOneOf: ['openDividendCalculator'],
    expectNone: ['openScreener'],
  },
  {
    name: 'opening a company goes to its stock page',
    prompt: 'Take me to the Apple stock page',
    expectOneOf: ['navigateTo'],
    expectDestination: 'stock',
  },
  {
    name: 'a page request picks the right fixed destination',
    prompt: 'Take me to my watchlist',
    expectOneOf: ['navigateTo'],
    expectDestination: 'watchlist',
  },
  {
    name: 'an account question is answered, not guessed at',
    prompt: 'When was my account created and what tier am I on?',
    // No tool can answer this. The prompt tells Bull to say so plainly.
    expectOneOf: [],
    expectNone: ['getPortfolioContext', 'getCompanyProfile'],
    // Matches the meaning, not one phrasing. The first version of this only
    // accepted "can't see" and "don't have access", and failed on the equally
    // correct "I don't have visibility into your account details".
    expectText: /(can['’]?t|cannot|don['’]?t|do not|unable|no)[^.]{0,40}(see|access|visibility|view)/i,
  },
];

function ask(text: string): UIMessage[] {
  return [{ id: '1', role: 'user', parts: [{ type: 'text', text }] }] as UIMessage[];
}

async function run(c: Case) {
  const result = await runAgent(ask(c.prompt), null, 'intermediate', 'en', null, null, null, null, false);

  let text = '';
  for await (const chunk of result.textStream) text += chunk;
  const steps = await result.steps;
  const calls = steps.flatMap((s) => s.toolCalls);
  const called = calls.map((t) => t.toolName);

  const problems: string[] = [];
  if (c.expectOneOf.length > 0 && !c.expectOneOf.some((t) => called.includes(t))) {
    problems.push(`expected one of [${c.expectOneOf.join(', ')}]`);
  }
  for (const banned of c.expectNone ?? []) {
    if (called.includes(banned)) problems.push(`called ${banned}, which it should not`);
  }
  if (c.expectText && !c.expectText.test(text)) {
    problems.push(`reply did not match ${c.expectText}`);
  }
  if (c.expectDestination) {
    const nav = calls.find((t) => t.toolName === 'navigateTo');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const got = (nav?.input as any)?.destination;
    if (got !== c.expectDestination) {
      problems.push(`destination was ${got ?? '(none)'}, expected ${c.expectDestination}`);
    }
  }

  const mark = problems.length === 0 ? 'ok  ' : 'FAIL';
  console.log(`\n${mark} ${c.name}`);
  console.log(`     asked  : ${c.prompt}`);
  console.log(
    `     tools  : ${calls.length ? calls.map((t) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = (t.input as any)?.destination;
      return d ? `${t.toolName}(${d})` : t.toolName;
    }).join(', ') : '(none)'}`,
  );
  console.log(`     reply  : ${text.slice(0, 100).replace(/\s+/g, ' ')}${text.length > 100 ? '…' : ''}`);
  for (const p of problems) console.log(`     -> ${p}`);

  return problems.length === 0;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('no ANTHROPIC_API_KEY in .env.local');

  let passed = 0;
  for (const c of CASES) {
    // Sequential on purpose: parallel turns would race on the prompt cache and
    // make the token numbers in test-chat-provider meaningless.
    if (await run(c)) passed++;
  }

  console.log(`\n${passed}/${CASES.length} routing cases passed`);
  if (passed < CASES.length) process.exit(1);
}

main().catch((err) => {
  console.error('\nfailed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
