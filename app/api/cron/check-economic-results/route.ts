/**
 * Economic release results
 * GET /api/cron/check-economic-results
 *
 * QStash, every 15 minutes 12:00-20:45 UTC on weekdays: covers the 8:30 and
 * 10:00 ET releases and the Fed's 2:00 PM statement in both EDT and EST. For
 * each kind, fills the latest release's result once FRED (or the Fed's
 * statement page) has it. Nothing pending costs one small read per kind and
 * no provider calls. No TwelveData credits. See lib/market-data/economic-results.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withCronReport } from '@/lib/cron/report';
import { logSecurityEvent } from '@/lib/security/security-events';
import { checkEconomicResults } from '@/lib/market-data/economic-results';

export const maxDuration = 60;

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/check-economic-results' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const status = await checkEconomicResults();
  const filled = Object.values(status).filter((s) => s.startsWith('filled')).length;
  const errors = Object.values(status).filter((s) => s.startsWith('error')).length;
  if (errors > 0) console.error('[check-economic-results]', status);
  return NextResponse.json({ filled, errors, status });
}

export const GET = withCronReport('check-economic-results', handleGET);
