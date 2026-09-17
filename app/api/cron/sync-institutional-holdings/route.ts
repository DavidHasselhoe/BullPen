/**
 * Institutional 13F holdings — sync cron
 * GET /api/cron/sync-institutional-holdings
 *
 * Runs daily (07:00 UTC, vercel.json) but only does real work when a filing
 * could plausibly have landed: inside the 13F filing window, or on Mondays
 * through the rest of the quarter to catch a late filing or an amendment.
 *
 * Every manager shares one deadline (45 days after quarter-end, rolled past
 * weekends and Presidents' Day — see lib/institutions/filing-schedule.ts) and
 * 72% of the filings ingested here landed exactly on it. Polling weekly
 * therefore had its worst case on the one day that matters: Q3 2026 is due
 * Monday Nov 16, this cron ran Mondays at 07:00 UTC (02:00 ET), hours before
 * any of those filings existed, so followers would not have heard until
 * Nov 23.
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
import { enrichHoldingSectors } from '@/lib/institutions/enrich-holding-sectors';
import { fetchFirst13FFiledDate } from '@/lib/edgar/edgar-watch';
import { isInFilingWindow } from '@/lib/institutions/filing-schedule';

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
  // The cron only ever sees a genuinely new filing, so this is where
  // followers get told. The backfill script leaves notify off.
  return ingestFiling(supabase, investor, latest13F, { notify: true });
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

  // Outside the filing window there is nothing new to find on most days, so
  // keep the old weekly cadence there and spend the daily runs where filings
  // actually appear. A manual ?slug= run always proceeds — it exists to
  // re-trigger one fund on demand.
  if (!slugFilter && !isInFilingWindow() && new Date().getUTCDay() !== 1) {
    return NextResponse.json({ success: true, skipped: 'outside_filing_window' });
  }

  const supabase = createServerClient();
  let query = supabase
    .from('institutional_investors')
    .select('id, slug, cik, first_13f_filed_date')
    .eq('is_active', true)
    .order('sort_order');
  if (slugFilter) query = query.eq('slug', slugFilter);
  const { data: investors, error } = await query;

  if (error || !investors) {
    return NextResponse.json({ success: false, error: 'Could not load institutional_investors' }, { status: 500 });
  }

  const rows = investors as (IngestTarget & { first_13f_filed_date: string | null })[];

  const results = [];
  for (const investor of rows) {
    const result = await syncFund(supabase, investor);
    results.push(result);
    await sleep(INTER_FUND_DELAY_MS);
  }

  // "Filing since" for the Discover sort. Only a newly added fund is missing
  // it, so on almost every run this does nothing.
  const firstFiled: Record<string, string> = {};
  for (const investor of rows.filter((r) => !r.first_13f_filed_date)) {
    try {
      const date = await fetchFirst13FFiledDate(investor.cik);
      if (date) {
        await supabase
          .from('institutional_investors')
          .update({ first_13f_filed_date: date } as never)
          .eq('id', investor.id);
        firstFiled[investor.slug] = date;
      }
    } catch (err) {
      console.error(`[sync-institutional-holdings] first 13F date failed for ${investor.slug}:`, err);
    }
    await sleep(INTER_FUND_DELAY_MS);
  }

  // Sectors for whatever the funds newly hold, so the fund list's sector split
  // and filter stay covered as quarters roll over. Independent of the ingest
  // above: a failure here must not turn a good sync into a failed one.
  //
  // 60 lookups is 600 credits, about a minute and a half paced under the cron
  // credit share. The default 300 would take ~7.5 minutes and this route stops
  // at 5. A new quarter adds tens of new tickers, not thousands, so 60 a week
  // keeps up; the one-off catch-up ran as a script.
  let sectors = null;
  try {
    sectors = await enrichHoldingSectors(supabase, { limit: 60 });
  } catch (err) {
    console.error('[sync-institutional-holdings] sector enrichment failed:', err);
  }

  return NextResponse.json({ success: true, results, firstFiled, sectors });
}
