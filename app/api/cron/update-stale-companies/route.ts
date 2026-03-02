/**
 * Autonomous Filing Update Cron Job
 * GET /api/cron/update-stale-companies
 *
 * Vercel invokes this endpoint on the schedule defined in vercel.json.
 * On every run it:
 *   1. Fetches the 10 most-stale tracked companies (oldest last_ingested_at first)
 *   2. Checks each for new 10-K / 10-Q / 20-F filings on SEC (one lightweight API call each)
 *   3. Re-ingests any company that has newer filings than our stored data
 *
 * Authentication: Vercel automatically sends `Authorization: Bearer $CRON_SECRET`
 * when it invokes a cron job. Any other caller without this header is rejected.
 *
 * Timeout: maxDuration = 300 (Vercel Pro). On Hobby (10s limit), the endpoint
 * still responds quickly — detection is fast, but full re-ingestion may not
 * complete. In that case the staleness guard in lazy-ingestion.ts catches it
 * on the user's next page visit.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { checkForNewFilings } from '@/lib/ingestion/filing-freshness';
import { lazyIngestCompany } from '@/lib/search/lazy-ingestion';
import { sendEarningsAlerts } from '@/lib/email/earnings-alert';

// Tell Vercel this function may run up to 300 seconds (Pro plan)
export const maxDuration = 300;

// How many companies to process per cron invocation
const BATCH_SIZE = 10;

interface CronSummary {
  checked:   number;
  withNewFilings: number;
  reingested: number;
  errors:    string[];
  companies: Array<{
    ticker: string;
    hadNewFilings: boolean;
    reingested:    boolean;
    latestFilingDate: string | null;
    emailsSent?: number;
    error?: string;
  }>;
  emailErrors?: string[];
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // ── Auth check ────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const summary: CronSummary = {
    checked:        0,
    withNewFilings: 0,
    reingested:     0,
    errors:         [],
    companies:      [],
  };

  try {
    const supabase = createServerClient();

    // ── 1. Fetch the stalest tracked companies ────────────────────────────
    const { data: stalestRaw, error: fetchErr } = await supabase
      .from('company_index')
      .select('ticker, name, cik, last_ingested_at')
      .eq('has_data', true)
      .order('last_ingested_at', { ascending: true, nullsFirst: true })
      .limit(BATCH_SIZE);

    if (fetchErr) {
      return NextResponse.json(
        { error: `Failed to fetch company list: ${fetchErr.message}` },
        { status: 500 },
      );
    }

    const companies = (stalestRaw || []) as Array<{
      ticker: string;
      name: string;
      cik: string;
      last_ingested_at: string | null;
    }>;

    if (companies.length === 0) {
      return NextResponse.json({ message: 'No tracked companies found', ...summary });
    }

    // ── 2. Check + re-ingest each company ────────────────────────────────
    for (const company of companies) {
      summary.checked++;

      const companyEntry: CronSummary['companies'][0] = {
        ticker:           company.ticker,
        hadNewFilings:    false,
        reingested:       false,
        latestFilingDate: null,
      };

      try {
        // Lightweight SEC check (one API call per company)
        const freshness = await checkForNewFilings(company.cik, company.last_ingested_at);
        companyEntry.latestFilingDate = freshness.latestFilingDate;

        if (!freshness.hasNewFilings) {
          summary.companies.push(companyEntry);
          continue;
        }

        // New filing detected
        companyEntry.hadNewFilings = true;
        summary.withNewFilings++;

        // Re-ingest — force bypasses the staleness/count skip guard
        const result = await lazyIngestCompany(
          company.ticker,
          { forceRefresh: true },
        );

        if (result.success) {
          companyEntry.reingested = true;
          summary.reingested++;

          // Notify holders who opted in
          const formType = freshness.latestFormType || 'earnings report';
          const emailResult = await sendEarningsAlerts(
            company.ticker,
            company.name,
            formType,
          );
          companyEntry.emailsSent = emailResult.sent;
          if (emailResult.errors.length) {
            summary.emailErrors = [...(summary.emailErrors || []), ...emailResult.errors];
          }
        } else {
          companyEntry.error = result.error;
          summary.errors.push(`${company.ticker}: ${result.error}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        companyEntry.error = msg;
        summary.errors.push(`${company.ticker}: ${msg}`);
      }

      summary.companies.push(companyEntry);
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...summary,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: msg, ...summary },
      { status: 500 },
    );
  }
}
