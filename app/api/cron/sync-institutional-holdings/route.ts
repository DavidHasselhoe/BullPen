/**
 * Institutional 13F holdings — sync cron
 * GET /api/cron/sync-institutional-holdings
 *
 * Runs weekly (Mondays 06:00 UTC, vercel.json). 13F-HR filings are due 45
 * days after quarter-end but funds file on a rolling basis within that
 * window, so a weekly poll catches a new filing within 7 days without cron
 * needing a native "quarterly" concept.
 *
 * Loops every active fund in institutional_investors and ingests its newest
 * 13F-HR. Each fund's work is fully independent and commits as it completes —
 * one fund's bad filing or a mid-run timeout never blocks or corrupts
 * another fund's data.
 *
 * The parse pipeline itself lives in lib/institutions/ingest-filing.ts,
 * shared with scripts/backfill-institution-filings.ts, which walks further
 * back than "newest" to seed quarter-over-quarter history. This route only
 * decides WHICH filing to hand it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logSecurityEvent } from '@/lib/security/security-events';
import { createServerClient } from '@/lib/supabase/client';
import { ingestFiling, list13FFilings, type IngestTarget } from '@/lib/institutions/ingest-filing';

export const maxDuration = 300;

const INTER_FUND_DELAY_MS = 250; // polite-citizen pacing against SEC EDGAR, no formal rate limit but edgar-watch.ts calls for this

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function syncFund(supabase: ReturnType<typeof createServerClient>, investor: IngestTarget) {
  const latest13F = (await list13FFilings(investor.cik))[0];
  if (!latest13F) {
    return { slug: investor.slug, status: 'no_filing_found' as const };
  }
  return ingestFiling(supabase, investor, latest13F);
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/sync-institutional-holdings' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Optional ?slug=<fund-slug> scopes the run to one fund — used for the
  // Phase 1 manual validation pass (Berkshire only) and for re-triggering a
  // single fund that came back parse_failed, without re-running everyone.
  const slugFilter = request.nextUrl.searchParams.get('slug');

  const supabase = createServerClient();
  let query = supabase
    .from('institutional_investors')
    .select('id, slug, cik')
    .eq('is_active', true)
    .order('sort_order');
  if (slugFilter) query = query.eq('slug', slugFilter);
  const { data: investors, error } = await query;

  if (error || !investors) {
    return NextResponse.json({ success: false, error: 'Could not load institutional_investors' }, { status: 500 });
  }

  const results = [];
  for (const investor of investors as IngestTarget[]) {
    const result = await syncFund(supabase, investor);
    results.push(result);
    await sleep(INTER_FUND_DELAY_MS);
  }

  return NextResponse.json({ success: true, results });
}
