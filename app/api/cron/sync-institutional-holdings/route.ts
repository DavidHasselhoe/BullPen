/**
 * Institutional 13F holdings — sync cron
 * GET /api/cron/sync-institutional-holdings
 *
 * Runs weekly (Mondays 06:00 UTC, vercel.json). 13F-HR filings are due 45
 * days after quarter-end but funds file on a rolling basis within that
 * window, so a weekly poll catches a new filing within 7 days without cron
 * needing a native "quarterly" concept.
 *
 * Loops every active fund in institutional_investors. Each fund's work is
 * fully independent and commits as it completes — one fund's bad filing or
 * a mid-run timeout never blocks or corrupts another fund's data:
 *   1. Find the fund's newest 13F-HR via SEC EDGAR (lib/edgar/edgar-watch.ts).
 *   2. Skip if already ingested (parse_status='ok' for that accession).
 *   3. Insert the filing row as 'pending' first, so a crash mid-parse leaves
 *      a debuggable stuck row instead of silent data loss.
 *   4. Locate + fetch the "INFORMATION TABLE" XML, parse + aggregate by
 *      CUSIP (a filing can report the same CUSIP multiple times across
 *      sub-managers — verified live against Berkshire Hathaway's own filing).
 *   5. Resolve CUSIPs to tickers (cache-first, credit-budget-gated).
 *   6. Bulk-insert holdings, mark the filing 'ok' with computed totals.
 *
 * Amendments (13F-HR/A) are not ingested in v1 — a restated filing just
 * won't be reflected; a known, accepted v1 gap, not a bug.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logSecurityEvent } from '@/lib/security/security-events';
import { createServerClient } from '@/lib/supabase/client';
import { fetchRecentFilings, fetchFilingIndex, fetchFilingDocument } from '@/lib/edgar/edgar-watch';
import { parseInfoTable, parsePeriodOfReport } from '@/lib/institutions/parse-13f-xml';
import { resolveHoldingsForFiling } from '@/lib/institutions/resolve-cusip';

export const maxDuration = 300;

const INTER_FUND_DELAY_MS = 250; // polite-citizen pacing against SEC EDGAR, no formal rate limit but edgar-watch.ts calls for this

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface InvestorRow {
  id: string;
  slug: string;
  cik: string;
}

async function syncFund(supabase: ReturnType<typeof createServerClient>, investor: InvestorRow) {
  const filings = await fetchRecentFilings(investor.cik);
  const latest13F = filings
    .filter((f) => f.form === '13F-HR')
    .sort((a, b) => b.filingDate.localeCompare(a.filingDate))[0];

  if (!latest13F) {
    return { slug: investor.slug, status: 'no_filing_found' as const };
  }

  const { data: existing } = await supabase
    .from('institutional_filings')
    .select('id, parse_status')
    .eq('investor_id', investor.id)
    .eq('accession_number', latest13F.accessionNumber)
    .maybeSingle<{ id: string; parse_status: string }>();

  if (existing?.parse_status === 'ok') {
    return { slug: investor.slug, status: 'already_ingested' as const };
  }

  // Locate both documents in the filing before creating/updating the DB row,
  // so period_of_report (the cover page's periodOfReport, not the filing
  // date) is correct from the first insert rather than backfilled later.
  const files = await fetchFilingIndex(investor.cik, latest13F.accessionNumber);
  const infoTableFile = files.find((f) => /information table/i.test(f.type ?? ''));
  const coverPageFile = files.find((f) => f.name.toLowerCase().endsWith('.xml') && f !== infoTableFile);

  let periodOfReport = latest13F.filingDate; // fallback if the cover page is missing/unparseable
  if (coverPageFile) {
    try {
      const coverXml = await fetchFilingDocument(investor.cik, latest13F.accessionNumber, coverPageFile.name);
      periodOfReport = parsePeriodOfReport(coverXml) ?? periodOfReport;
    } catch {
      // Fall back to filing date -- not fatal, the filing itself still gets ingested.
    }
  }

  const filingId = existing
    ? existing.id
    : (
        await supabase
          .from('institutional_filings')
          .insert({
            investor_id: investor.id,
            accession_number: latest13F.accessionNumber,
            period_of_report: periodOfReport,
            filed_date: latest13F.filingDate,
            form_type: '13F-HR',
            parse_status: 'pending',
          } as never)
          .select('id')
          .single<{ id: string }>()
      ).data?.id;

  if (!filingId) {
    return { slug: investor.slug, status: 'parse_failed' as const, error: 'Could not create filing row' };
  }

  try {
    if (!infoTableFile) {
      throw new Error('No "INFORMATION TABLE" document found in filing index');
    }

    const xml = await fetchFilingDocument(investor.cik, latest13F.accessionNumber, infoTableFile.name);
    const rawHoldings = parseInfoTable(xml);
    if (rawHoldings.length === 0) {
      throw new Error('Parsed zero holdings from information table XML');
    }

    const resolved = await resolveHoldingsForFiling(rawHoldings);
    const totalValueUsd = resolved.reduce((sum, h) => sum + h.valueUsd, 0);

    const holdingsRows = resolved.map((h) => ({
      filing_id: filingId,
      cusip: h.cusip,
      name_of_issuer: h.nameOfIssuer,
      symbol: h.symbol,
      value_usd: h.valueUsd,
      shares: h.shares,
      share_type: h.shareType,
      put_call: h.putCall,
      portfolio_pct: totalValueUsd > 0 ? Math.round((h.valueUsd / totalValueUsd) * 100000) / 1000 : null,
    }));

    // Clear any partial holdings from a prior crashed attempt at this same accession before re-inserting.
    await supabase.from('institutional_holdings').delete().eq('filing_id', filingId);
    const { error: insertError } = await supabase.from('institutional_holdings').insert(holdingsRows as never);
    if (insertError) throw new Error(`Holdings insert failed: ${insertError.message}`);

    await supabase
      .from('institutional_filings')
      .update({
        total_value_usd: totalValueUsd,
        total_positions: resolved.length,
        parse_status: 'ok',
        parse_error: null,
        ingested_at: new Date().toISOString(),
      } as never)
      .eq('id', filingId);

    const resolvedCount = resolved.filter((h) => h.symbol != null).length;
    return { slug: investor.slug, status: 'ok' as const, positions: resolved.length, resolved: resolvedCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from('institutional_filings')
      .update({ parse_status: 'parse_failed', parse_error: message } as never)
      .eq('id', filingId);
    return { slug: investor.slug, status: 'parse_failed' as const, error: message };
  }
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
  for (const investor of investors as InvestorRow[]) {
    const result = await syncFund(supabase, investor);
    results.push(result);
    await sleep(INTER_FUND_DELAY_MS);
  }

  return NextResponse.json({ success: true, results });
}
