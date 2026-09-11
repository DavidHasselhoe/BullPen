/**
 * GET/POST /api/cron/refresh-search-index
 *
 * Rebuilds `search_index`, the symbol catalogue the browser downloads once and
 * then searches locally on every keystroke (see /api/search/index).
 *
 * The work itself lives in lib/search/refresh-index.ts so it can also be run
 * directly with `npm run refresh-search-index`, which is the reliable way to
 * test it: a dev server will happily serve a stale compiled copy of this route.
 *
 * `?part=stocks|etfs|funds` refreshes one catalogue, and `&from=N` resumes the
 * funds walk. The scheduler uses both,
 * because each source is a multi-megabyte fetch from an upstream measured
 * anywhere between 6s and 153s, and three of those do not reliably fit in one
 * function invocation. Each part prunes only its own rows, so the others keep
 * whatever the last successful run left.
 *
 * Auth: Bearer CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logSecurityEvent } from '@/lib/security/security-events';
import { refreshSearchIndex, FeedTooSmallError, ALL_PARTS, type RefreshPart } from '@/lib/search/refresh-index';
import { TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** A full 270-page walk measured 1252s, so ~4.6s a page rather than the ~2s a
 *  single page suggests. Thirty pages is ~140s, which leaves this function half
 *  its 300s ceiling for a slow day and the upserts. */
const FUND_PAGES_PER_RUN = 30;

async function handler(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/refresh-search-index' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // One source per invocation by default is how the scheduler calls this:
    // all three in one go only fits when the upstream is having a good day.
    const requested = request.nextUrl.searchParams.get('part');
    const parts = requested
      ? (requested.split(',').filter((p): p is RefreshPart => (ALL_PARTS as string[]).includes(p)))
      : ALL_PARTS;
    if (parts.length === 0) {
      return NextResponse.json({ success: false, error: 'unknown_part' }, { status: 400 });
    }
    // The funds catalogue is ~270 paged requests at ~2s each, far past this
    // function's 300s ceiling, so it is walked a window at a time: the caller
    // repeats with ?from=<nextFundPage> until that comes back null.
    const from = Number(request.nextUrl.searchParams.get('from') ?? '1');
    const fundWindow = { startPage: Number.isFinite(from) && from > 0 ? from : 1, maxPages: FUND_PAGES_PER_RUN };
    return NextResponse.json({
      success: true,
      parts,
      ...(await refreshSearchIndex(parts, fundWindow)),
    });
  } catch (err) {
    if (err instanceof FeedTooSmallError) {
      // A short feed means TwelveData returned something unexpected. The index
      // is left exactly as it was rather than replaced with a broken one.
      return NextResponse.json(
        { success: false, error: 'feed_too_small', rows: err.rows },
        { status: 502 }
      );
    }
    if (err instanceof TwelveDataRateLimitError) {
      return NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 });
    }
    console.error('[cron/refresh-search-index] failed:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export const GET = handler;
export const POST = handler;
