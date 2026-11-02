/**
 * Landing hero: real Why Today answers from the most recent session that has a
 * few worth showing. Read-only: it only reads answers someone already paid for
 * (the whytoday:v2 cache Home and the Why? panel share) and never generates
 * one, so it costs a Redis SCAN per cache window and no AI or market credits.
 *
 * "No company news today" answers are skipped: they are honest, but they show
 * nothing about what the feature does.
 */

import { NextResponse } from 'next/server';
import { rget, rmget, rscan, rset } from '@/lib/cache/redis-cache';
import { getDisplayNames } from '@/lib/market-data/display-names';
import { SP500_TICKERS } from '@/lib/market-data/sp500';
import { WHY_TODAY_MIN_MOVE } from '@/lib/ai/why-today-shared';
import type { CachedWhyToday } from '@/lib/ai/why-today';
import { logger } from '@/lib/utils/logger';

export interface LandingWhy {
  ticker: string;
  name: string;
  changePct: number;
  text: string;
}
export interface LandingWhyPayload {
  /** The ET session date the answers explain, YYYY-MM-DD. */
  date: string;
  answers: LandingWhy[];
}

const CACHE_KEY = 'landing:why:v3';
const TTL_SECONDS = 15 * 60;
const MAX_ANSWERS = 4;
const MIN_ANSWERS = 3;
const KEY_SHAPE = /^whytoday:v2:(\d{4}-\d{2}-\d{2}):en:([A-Z.]{1,6})$/;
const SP500 = new Set(SP500_TICKERS);

const HEADERS = { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900' };

async function build(): Promise<LandingWhyPayload | null> {
  // Group the cached answers by session date; skip listing-pinned (@MIC) and lock keys.
  const byDate = new Map<string, string[]>();
  for (const key of await rscan('whytoday:v2:*:en:*')) {
    const m = key.match(KEY_SHAPE);
    // Well-known names only: a beginner should recognise the company.
    if (!m || !SP500.has(m[2])) continue;
    byDate.set(m[1], [...(byDate.get(m[1]) ?? []), key]);
  }

  for (const date of [...byDate.keys()].sort().reverse()) {
    const keys = byDate.get(date)!;
    const values = await rmget<CachedWhyToday>(keys);
    const answers = keys
      .map((key) => ({ ticker: key.match(KEY_SHAPE)![2], v: values.get(key) }))
      .filter((a): a is { ticker: string; v: CachedWhyToday } =>
        !!a.v && Math.abs(a.v.changePct) >= WHY_TODAY_MIN_MOVE && !/^no company news/i.test(a.v.text.trim()))
      .sort((a, b) => Math.abs(b.v.changePct) - Math.abs(a.v.changePct))
      .slice(0, MAX_ANSWERS);
    if (answers.length < MIN_ANSWERS) continue;

    const names = await getDisplayNames(answers.map((a) => a.ticker));

    return {
      date,
      answers: answers.map((a) => ({
        ticker: a.ticker,
        name: names.get(a.ticker) ?? a.ticker,
        changePct: a.v.changePct,
        // "Intel ($INTC)" reads as code to someone new; the app links cashtags, this page can't.
        text: a.v.text.trim().replace(/\$([A-Z]{1,5})\b/g, '$1'),
      })),
    };
  }
  return null;
}

export async function GET() {
  try {
    const cached = await rget<LandingWhyPayload>(CACHE_KEY);
    if (cached) return NextResponse.json({ success: true, ...cached }, { headers: HEADERS });

    const payload = await build();
    if (!payload) return NextResponse.json({ success: false }, { headers: HEADERS });
    void rset(CACHE_KEY, payload, TTL_SECONDS);
    return NextResponse.json({ success: true, ...payload }, { headers: HEADERS });
  } catch (error) {
    logger.error('[landing-why] Error', error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
