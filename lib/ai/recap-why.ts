/**
 * Why Today answers for the close recap (check-price-moves at 16:05 ET): Pro
 * readers get their top mover explained in the recap notification, its push
 * and the next morning's email.
 *
 * Spend is shared and bounded: one answer per stock per session through the
 * same cache and lock as Home (resolveWhyToday), most of them already written
 * during the day, at most RECAP_WHY_MAX stocks a run, biggest moves first,
 * and nothing new starts once the run's deadline is near. Worst case about
 * 20 x $0.05 = $1 a day, whatever the number of Pro readers.
 */

import { resolveWhyToday, WHY_TODAY_DAILY_GENERATIONS } from './why-today';

export const RECAP_WHY_MAX = 20;
const CONCURRENCY = 5;

export interface RecapWhyAsk {
  /** A Pro reader whose top mover this is: the generation is logged to them. */
  userId: string;
  symbol: string;
  quote: { c: number; d: number; dp: number };
}

/** Distinct stocks, biggest move first, capped. Pure. */
export function pickRecapAsks(asks: RecapWhyAsk[], max = RECAP_WHY_MAX): RecapWhyAsk[] {
  const bySymbol = new Map<string, RecapWhyAsk>();
  for (const a of asks) if (!bySymbol.has(a.symbol)) bySymbol.set(a.symbol, a);
  return [...bySymbol.values()].sort((a, b) => Math.abs(b.quote.dp) - Math.abs(a.quote.dp)).slice(0, max);
}

/** "Oracle ($ORCL)" is a chip in the app; a push or an email reads better with the bare ticker, on one line. */
export const plainWhy = (text: string) => text.replace(/\$([A-Z]{1,6})\b/g, '$1').replace(/\s*\n+\s*/g, ' ').trim();

/** symbol -> plain answer, for the stocks that got one before `deadline` (ms epoch). */
export async function recapWhys(asks: RecapWhyAsk[], deadline: number): Promise<Map<string, string>> {
  const queue = pickRecapAsks(asks);
  const out = new Map<string, string>();
  const worker = async () => {
    for (let a = queue.shift(); a && Date.now() < deadline; a = queue.shift()) {
      const why = await resolveWhyToday({
        userId: a.userId,
        ticker: a.symbol,
        quote: a.quote,
        language: 'en', // ponytail: push and email are English; add per-reader language when they are not
        mayGenerate: true,
        dailyCap: WHY_TODAY_DAILY_GENERATIONS.pro,
        source: 'recap',
      }).catch(() => null);
      if (why?.status === 'ready' && why.text.trim()) out.set(a.symbol, plainWhy(why.text));
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return out;
}

// Self-check: npx tsx lib/ai/recap-why.ts
if (process.argv[1]?.endsWith('recap-why.ts')) {
  const q = (dp: number) => ({ c: 100, d: dp, dp });
  const picked = pickRecapAsks([
    { userId: 'a', symbol: 'NVDA', quote: q(-3) },
    { userId: 'b', symbol: 'NVDA', quote: q(-3) },
    { userId: 'a', symbol: 'TSLA', quote: q(6) },
    { userId: 'c', symbol: 'AAPL', quote: q(2.1) },
  ], 2);
  if (picked.map((p) => p.symbol).join() !== 'TSLA,NVDA') throw new Error(`pick order: ${picked.map((p) => p.symbol)}`);
  if (plainWhy('Oracle ($ORCL) fell.\nPeers too.') !== 'Oracle (ORCL) fell. Peers too.') throw new Error('plainWhy');
  console.log('recap-why ok');
}
