/**
 * The first minutes of trading after an earnings release, for the deep dive's
 * price reaction slide.
 *
 * Read at publish time, never by waiting: across 8 posts (Oct-Nov 2026) the
 * move at the moment we published already pointed the same way as 45 minutes
 * later in 7 of 8, and the 45-minute figure was no closer to the next day's
 * close (META +4.9% after hours, -7.1% the next day). So the slide shows the
 * first reaction, says that it is one, and the post stays as fast as before.
 *
 * One /time_series call, 1 credit.
 */

import { getStockCandles } from '@/lib/twelvedata/twelvedata-client';
import { sleep } from '@/lib/utils';
import type { PriceReaction } from './schema';

/** Fewer trades than this since the release is too thin to draw a move from. */
const MIN_PRINTS = 3;
/** Trades this long before the 8-K still count: the press release crosses the
 *  wire first. ANET (2026-11-03) jumped at 4:06 PM, its 8-K was accepted at
 *  4:10, and counting only from 4:10 found one bar and dropped the slide. */
const WIRE_LEAD_S = 600;
const ATTEMPTS = 3;
const RETRY_MS = 60_000;

/** Which extended session a release lands in; null inside regular hours, where there is no after-hours move. */
function sessionFor(releasedAt: number): 'pre' | 'post' | null {
  const [h, m] = new Date(releasedAt * 1000)
    .toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit' })
    .split(':').map(Number);
  const minute = (h % 24) * 60 + m;
  if (minute >= 16 * 60) return 'post';
  return minute < 9 * 60 + 30 ? 'pre' : null;
}

/** The reaction as of `now`, in one call. Exported for re-rendering past posts at their publish time. */
export async function readPriceReactionAsOf(ticker: string, releasedAt: number, now: number): Promise<PriceReaction | null> {
  const session = sessionFor(releasedAt);
  if (!session) return null;
  // Four days back reaches a Monday pre-market release's Friday close in the same call.
  const r = await getStockCandles(ticker, releasedAt - 4 * 86400, now, '1', { extendedHours: true });
  const bars = r.t.map((t, i) => ({ t, c: r.c[i], regular: r.session?.[i] === 'regular' })).filter((b) => b.t <= now);

  const close = bars.filter((b) => b.regular && b.t < releasedAt).pop();
  if (!close) return null;
  if (bars.filter((b) => b.t > close.t && b.t >= releasedAt - WIRE_LEAD_S).length < MIN_PRINTS) return null;

  // Split at the close, not the release: the press release can cross the wire
  // a few minutes before the 8-K we time it by, and its jump belongs after the line.
  const last = bars[bars.length - 1];
  return {
    baseline: close.c,
    closeAt: close.t,
    releasedAt,
    asOf: last.t,
    session,
    points: bars.filter((b) => b.t > close.t - 3600).map(({ t, c }) => ({ t, c })),
    changePercent: (last.c / close.c - 1) * 100,
  };
}

/**
 * The reaction so far, or null. Tries again a minute later, twice, when there
 * aren't enough trades yet (GOOGL had 2 by 4:03 PM): two minutes is the most
 * this ever holds a post back, and a failure only drops the slide.
 */
export async function readPriceReaction(ticker: string, releasedAt: number): Promise<PriceReaction | null> {
  if (!sessionFor(releasedAt)) return null;
  for (let i = 0; i < ATTEMPTS; i++) {
    if (i > 0) await sleep(RETRY_MS);
    try {
      const r = await readPriceReactionAsOf(ticker, releasedAt, Math.floor(Date.now() / 1000));
      if (r) return r;
    } catch (err) {
      console.error(`[price-reaction] ${ticker} failed:`, err);
      return null;
    }
  }
  return null;
}

export function reactionTimeLabel(r: PriceReaction): string {
  return new Date(r.asOf * 1000).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
}

/** The caption's one line about the move, written here rather than by the model so the figure can't drift. */
export function reactionCaptionLine(r: PriceReaction): string {
  const pct = `${Math.abs(r.changePercent).toFixed(1)}%`;
  const move = Math.abs(r.changePercent) < 0.05 ? 'Shares were about flat' : `Shares were ${r.changePercent > 0 ? 'up' : 'down'} ${pct}`;
  return `${move} in early ${r.session === 'post' ? 'after-hours' : 'pre-market'} trading as of ${reactionTimeLabel(r)} ET.`;
}
