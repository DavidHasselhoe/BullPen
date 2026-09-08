/**
 * Ingest one 13F-HR filing into institutional_filings + institutional_holdings.
 *
 * Extracted from the weekly sync cron so the cron and the historical backfill
 * script (scripts/backfill-institution-filings.ts) share one parse path. The
 * cron passes the newest filing; the backfill passes the newest N. Two copies
 * of this pipeline would drift, and the quiet failure mode of drift here is
 * a quarter of holdings parsed under slightly different rules than the quarter
 * it gets diffed against.
 *
 * Amendments (13F-HR/A) are not ingested — a restated filing just won't be
 * reflected; a known, accepted gap, not a bug.
 */

import { fetchRecentFilings, fetchFilingIndex, fetchFilingDocument, type EdgarFiling } from '@/lib/edgar/edgar-watch';
import { parseInfoTable, parsePeriodOfReport } from '@/lib/institutions/parse-13f-xml';
import { resolveHoldingsForFiling } from '@/lib/institutions/resolve-cusip';
import { invalidateCachedPrefix } from '@/lib/cache/market-data-cache';
import type { createServerClient } from '@/lib/supabase/client';

/**
 * SEC's <value> tag is whole USD only from schema X0202 (in effect 2023);
 * before that the convention was thousands, and parseInfoTable has no
 * detection for which it is reading — see its own comment recording that this
 * mistake inflated every holding 1000x on the first ingestion run. Anything
 * older than this is refused rather than silently ingested at the wrong scale.
 *
 * ponytail: hard floor, not a format sniff. Lift it by adding a median
 * implied-price check (value/shares < $1 means thousands) inside
 * parseInfoTable, only if deep history is ever actually wanted.
 */
export const EARLIEST_SUPPORTED_PERIOD = '2023-06-30';

/** The largest funds run to 7000+ rows in one filing; insert in batches
 *  rather than one request body that size. */
const HOLDINGS_INSERT_CHUNK = 1000;

export interface IngestTarget {
  id: string;
  slug: string;
  cik: string;
}

export type IngestStatus =
  | 'ok'
  | 'already_ingested'
  | 'duplicate_period'
  | 'too_old'
  | 'parse_failed';

export interface IngestResult {
  slug: string;
  accessionNumber: string;
  status: IngestStatus;
  periodOfReport?: string;
  positions?: number;
  resolved?: number;
  error?: string;
}

export interface IngestOptions {
  /**
   * Resolve CUSIPs to tickers. Costs TwelveData credits on a cache miss.
   * For a historical quarter, `symbol` is only read for the exited list's
   * logo and link, so a huge fund's backfill can skip the whole loop.
   *
   * ponytail: all-or-nothing switch. If a middle ground is ever needed,
   * resolve only the top N by value, since that is all the UI renders.
   */
  resolveSymbols?: boolean;
}

/** Every 13F-HR for a CIK, newest first. Excludes amendments (13F-HR/A). */
export async function list13FFilings(cik: string): Promise<EdgarFiling[]> {
  const filings = await fetchRecentFilings(cik);
  return filings
    .filter((f) => f.form === '13F-HR')
    .sort((a, b) => b.filingDate.localeCompare(a.filingDate));
}

export async function ingestFiling(
  supabase: ReturnType<typeof createServerClient>,
  investor: IngestTarget,
  filing: EdgarFiling,
  opts: IngestOptions = {}
): Promise<IngestResult> {
  const { resolveSymbols = true } = opts;
  const base = { slug: investor.slug, accessionNumber: filing.accessionNumber };

  const { data: existing } = await supabase
    .from('institutional_filings')
    .select('id, parse_status')
    .eq('investor_id', investor.id)
    .eq('accession_number', filing.accessionNumber)
    .maybeSingle<{ id: string; parse_status: string }>();

  if (existing?.parse_status === 'ok') {
    return { ...base, status: 'already_ingested' };
  }

  // Locate both documents in the filing before creating/updating the DB row,
  // so period_of_report (the cover page's periodOfReport, not the filing
  // date) is correct from the first insert rather than backfilled later.
  const files = await fetchFilingIndex(investor.cik, filing.accessionNumber);
  const infoTableFile = files.find((f) => /information table/i.test(f.type ?? ''));
  const coverPageFile = files.find((f) => f.name.toLowerCase().endsWith('.xml') && f !== infoTableFile);

  let periodOfReport = filing.filingDate; // fallback if the cover page is missing/unparseable
  if (coverPageFile) {
    try {
      const coverXml = await fetchFilingDocument(investor.cik, filing.accessionNumber, coverPageFile.name);
      periodOfReport = parsePeriodOfReport(coverXml) ?? periodOfReport;
    } catch {
      // Fall back to filing date -- not fatal, the filing itself still gets ingested.
    }
  }

  if (periodOfReport < EARLIEST_SUPPORTED_PERIOD) {
    return { ...base, status: 'too_old', periodOfReport };
  }

  // One quarter must map to exactly one filing. The holdings route reads the
  // previous quarter as filingRows[idx + 1], so a second row for the same
  // period would make it diff a quarter against itself (everything reads
  // Unchanged) and list the quarter twice in the quarter picker.
  const { data: samePeriod } = await supabase
    .from('institutional_filings')
    .select('id, accession_number')
    .eq('investor_id', investor.id)
    .eq('period_of_report', periodOfReport)
    .eq('parse_status', 'ok')
    .maybeSingle<{ id: string; accession_number: string }>();

  if (samePeriod && samePeriod.accession_number !== filing.accessionNumber) {
    return { ...base, status: 'duplicate_period', periodOfReport };
  }

  const filingId = existing
    ? existing.id
    : (
        await supabase
          .from('institutional_filings')
          .insert({
            investor_id: investor.id,
            accession_number: filing.accessionNumber,
            period_of_report: periodOfReport,
            filed_date: filing.filingDate,
            form_type: '13F-HR',
            parse_status: 'pending',
          } as never)
          .select('id')
          .single<{ id: string }>()
      ).data?.id;

  if (!filingId) {
    return { ...base, status: 'parse_failed', periodOfReport, error: 'Could not create filing row' };
  }

  try {
    if (!infoTableFile) {
      throw new Error('No "INFORMATION TABLE" document found in filing index');
    }

    const xml = await fetchFilingDocument(investor.cik, filing.accessionNumber, infoTableFile.name);
    const rawHoldings = parseInfoTable(xml);
    if (rawHoldings.length === 0) {
      throw new Error('Parsed zero holdings from information table XML');
    }

    const resolved = resolveSymbols
      ? await resolveHoldingsForFiling(rawHoldings)
      : rawHoldings.map((h) => ({ ...h, symbol: null }));
    const totalValueUsd = resolved.reduce((sum, h) => sum + h.valueUsd, 0);

    // Concentration weights, stored on the filing rather than derived per
    // request: the public fund list needs them to label a fund's shape, but
    // the holdings they come from are Pro-gated and run to 7000+ rows for the
    // largest funds. Migration 132 backfilled these for filings ingested
    // before this ran.
    const byValueDesc = [...resolved].sort((a, b) => b.valueUsd - a.valueUsd);
    const pctOfTotal = (v: number) =>
      totalValueUsd > 0 ? Math.round((v / totalValueUsd) * 100000) / 1000 : null;
    const topHoldingPct = pctOfTotal(byValueDesc[0]?.valueUsd ?? 0);
    const top5Pct = pctOfTotal(byValueDesc.slice(0, 5).reduce((sum, h) => sum + h.valueUsd, 0));

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

    // Chunked because the largest funds run to 7000+ rows in one filing and a
    // single insert of that size is a needlessly large request body.
    for (let i = 0; i < holdingsRows.length; i += HOLDINGS_INSERT_CHUNK) {
      const chunk = holdingsRows.slice(i, i + HOLDINGS_INSERT_CHUNK);
      const { error: insertError } = await supabase.from('institutional_holdings').insert(chunk as never);
      if (insertError) throw new Error(`Holdings insert failed: ${insertError.message}`);
    }

    await supabase
      .from('institutional_filings')
      .update({
        total_value_usd: totalValueUsd,
        total_positions: resolved.length,
        top_holding_pct: topHoldingPct,
        top5_pct: top5Pct,
        parse_status: 'ok',
        parse_error: null,
        ingested_at: new Date().toISOString(),
      } as never)
      .eq('id', filingId);

    // Every cached response for this fund is now wrong, including the "latest"
    // one: gaining a prior quarter flips its diff from null to real. Bust the
    // whole prefix here rather than at each call site, so neither the cron nor
    // the backfill can forget.
    await invalidateCachedPrefix(`institutions:holdings:${investor.slug}:`);

    const resolvedCount = resolved.filter((h) => h.symbol != null).length;
    return {
      ...base,
      status: 'ok',
      periodOfReport,
      positions: resolved.length,
      resolved: resolvedCount,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from('institutional_filings')
      .update({ parse_status: 'parse_failed', parse_error: message } as never)
      .eq('id', filingId);
    return { ...base, status: 'parse_failed', periodOfReport, error: message };
  }
}
