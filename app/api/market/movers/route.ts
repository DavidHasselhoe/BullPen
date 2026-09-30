import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/security/api-security';
import { getIndexMovers } from '@/lib/market-data/index-movers';

export const dynamic = 'force-dynamic';
// The response is instant; this is for the paced refresh getIndexMovers()
// schedules with after() when the cached list has expired.
export const maxDuration = 300;

/** Discover's market movers. Same list for everyone, cached in Redis by getIndexMovers. */
async function handler() {
  const movers = await getIndexMovers();
  if (!movers) {
    // Nothing cached yet (first refresh still running): the section stays hidden and polls.
    return NextResponse.json({ success: false, error: 'plan_restricted' }, { status: 200 });
  }
  const res = NextResponse.json({ success: true, movers });
  res.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=240');
  return res;
}

export const GET = withRateLimit(handler, { windowMs: 60_000, maxRequests: 30 });
