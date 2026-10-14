import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/security/api-security';
import { getIndexMovers, getPremarketMovers, moversRollingOver } from '@/lib/market-data/index-movers';
import { isPreMarketET } from '@/lib/market-data/trading-day';

export const dynamic = 'force-dynamic';
// The response is instant; this is for the paced refresh getIndexMovers()
// schedules with after() when the cached list has expired.
export const maxDuration = 300;

/**
 * Discover's market movers. Same lists for everyone, cached in Redis. During
 * pre-market (4:00 to 9:30 New York) `premarket` carries this morning's
 * movers beside the last session's; otherwise it is null.
 */
async function handler() {
  const [movers, premarket] = await Promise.all([getIndexMovers(), getPremarketMovers()]);
  if (!movers) {
    // Nothing cached yet (first refresh still running): the section stays hidden and polls.
    return NextResponse.json({ success: false, error: 'plan_restricted' }, { status: 200 });
  }
  // The first request of the morning starts the pre-market sweep (a minute or
  // two); say so, and keep the CDN from serving the empty answer for minutes.
  const premarketPending = premarket === null && isPreMarketET();
  // Same at the open: yesterday's list in hand, today's being built.
  const moversPending = moversRollingOver(movers);
  const res = NextResponse.json({ success: true, movers, premarket, premarketPending, moversPending });
  res.headers.set('Cache-Control', premarketPending || moversPending ? 'public, s-maxage=15' : 'public, s-maxage=60, stale-while-revalidate=240');
  return res;
}

export const GET = withRateLimit(handler, { windowMs: 60_000, maxRequests: 30 });
