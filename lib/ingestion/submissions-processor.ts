/**
 * SEC Submissions Processor
 *
 * Converts the SEC Submissions API JSON (from getCompanySubmissions) into our
 * `filings` table records and builds the `filingIdMap` used by the XBRL extractor
 * to link metric facts to their source filing.
 *
 * Handles all form types, including amendments (10-K/A, 10-Q/A, 20-F/A).
 */

import { createServerClient } from '../supabase/client';
import type { FilingType } from '../types/database';
import type { FilingIndexEntry } from './xbrl-company-facts';
import type { SECSubmissions } from './sec-edgar';

// ============================================================
// CONSTANTS
// ============================================================

/**
 * Form types we store in our filings table.
 * Note: 8-K is excluded — it is ingested only via full content pipeline (ingestFiling)
 * to ensure events, splits, and Item 2.02 earnings are properly parsed.
 */
const FORMS_TO_STORE = new Set([
  '10-K', '10-K/A',
  '10-Q', '10-Q/A',
  '20-F', '20-F/A',
  '6-K',
]);

// ============================================================
// HELPERS
// ============================================================

function mapFormToFilingType(form: string): FilingType {
  const base = form.toUpperCase().replace('/A', '').trim();
  if (base === '10-K' || base === '20-F') return '10-K';
  if (base === '10-Q' || base === '6-K')  return '10-Q';
  if (base === '8-K')                      return '8-K';
  if (base === 'S-1')                      return 'S-1';
  if (base === 'DEF 14A')                  return 'DEF 14A';
  return 'OTHER';
}

function getFilingPeriodType(form: string): 'annual' | 'quarterly' | null {
  const base = form.toUpperCase().replace('/A', '').trim();
  if (base === '10-K' || base === '20-F') return 'annual';
  if (base === '10-Q' || base === '6-K')  return 'quarterly';
  return null;
}

// ============================================================
// PUBLIC TYPES
// ============================================================

export interface ProcessedSubmissions {
  /** Maps accession_number → FilingIndexEntry for use by the XBRL extractor */
  filingIdMap: Map<string, FilingIndexEntry>;
  totalFilings: number;
}

// ============================================================
// MAIN FUNCTION
// ============================================================

/**
 * Upserts all relevant filings from the SEC Submissions response into our
 * `filings` table and returns a map of accession_number → DB filing record.
 *
 * Existing filing records are not overwritten (ignoreDuplicates: true).
 */
export async function processAndUpsertFilings(
  submissions: SECSubmissions,
  companyId: string,
  cik: string,
  onProgress?: (msg: string) => void,
): Promise<ProcessedSubmissions> {
  const supabase = createServerClient();
  const filingIdMap = new Map<string, FilingIndexEntry>();

  const recent = submissions.filings?.recent;
  if (!recent?.accessionNumber?.length) {
    return { filingIdMap, totalFilings: 0 };
  }

  // The CIK without leading zeros is used in EDGAR archive URLs
  const numericCik = parseInt(cik, 10).toString();

  // Build insert rows for filings we care about
  interface FilingRow {
    company_id: string;
    filing_type: FilingType;
    accession_number: string;
    filing_date: string;
    accepted_date: string | null;
    period_end_date: string | null;
    period_type: 'annual' | 'quarterly' | null;
    fiscal_year: number | null;
    fiscal_quarter: number | null;
    items: string[];
    source_url: string;
    document_url: string | null;
    processing_status: 'pending' | 'processing' | 'completed' | 'failed';
    processing_error: string | null;
    metadata: Record<string, unknown>;
  }

  const filingRows: FilingRow[] = [];

  for (let i = 0; i < recent.accessionNumber.length; i++) {
    const form = (recent.form?.[i] || '').trim();
    if (!FORMS_TO_STORE.has(form.toUpperCase())) continue;

    const accn = recent.accessionNumber[i];
    const filingDate = recent.filingDate?.[i] || null;
    if (!accn || !filingDate) continue;

    const reportDate = recent.reportDate?.[i] || null;
    const acceptanceDateTime = recent.acceptanceDateTime?.[i] || null;
    const rawItems = recent.items?.[i] || '';

    const accessionPath = accn.replace(/-/g, '');
    const sourceUrl = `https://www.sec.gov/Archives/edgar/data/${numericCik}/${accessionPath}/${accn}-index.htm`;

    filingRows.push({
      company_id:       companyId,
      filing_type:      mapFormToFilingType(form),
      accession_number: accn,
      filing_date:      filingDate,
      accepted_date:    acceptanceDateTime ? acceptanceDateTime.substring(0, 10) : null,
      period_end_date:  reportDate || null,
      period_type:      getFilingPeriodType(form),
      fiscal_year:      null, // XBRL extractor fills this in via fact.fy
      fiscal_quarter:   null, // XBRL extractor fills this in via fact.fp
      items:            rawItems ? rawItems.split(',').map((s) => s.trim()).filter(Boolean) : [],
      source_url:       sourceUrl,
      document_url:     null,
      // Mark completed upfront — XBRL handles metrics, no need for separate processing step
      processing_status: 'completed',
      processing_error:  null,
      metadata:          {},
    });
  }

  if (filingRows.length === 0) {
    return { filingIdMap, totalFilings: 0 };
  }

  onProgress?.(`Upserting ${filingRows.length} filings to database`);

  // Upsert in batches of 50 (Supabase payload limit ~1 MB)
  const BATCH_SIZE = 50;
  for (let i = 0; i < filingRows.length; i += BATCH_SIZE) {
    const batch = filingRows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('filings')
      .upsert(batch as any, {
        onConflict:      'accession_number',
        ignoreDuplicates: true, // Never overwrite existing filing records
      });

    if (error) {
      onProgress?.(`Warning: filing upsert batch error — ${error.message}`);
    }
  }

  // Fetch all stored filing IDs for the accession numbers we just processed.
  // This handles both newly inserted and pre-existing records.
  const allAccessionNumbers = filingRows.map((f) => f.accession_number);

  const { data: storedFilingsRaw, error: fetchErr } = await supabase
    .from('filings')
    .select('id, accession_number, filing_type, period_end_date, fiscal_year, fiscal_quarter')
    .eq('company_id', companyId)
    .in('accession_number', allAccessionNumbers);

  if (fetchErr) {
    onProgress?.(`Warning: could not fetch filing IDs — ${fetchErr.message}`);
  } else if (storedFilingsRaw) {
    const storedFilings = storedFilingsRaw as Array<{
      id: string;
      accession_number: string;
      filing_type: string;
      period_end_date: string | null;
      fiscal_year: number | null;
      fiscal_quarter: number | null;
    }>;
    for (const f of storedFilings) {
      filingIdMap.set(f.accession_number, {
        filingId:      f.id,
        filingType:    f.filing_type,
        periodEndDate: f.period_end_date,
        fiscalYear:    f.fiscal_year,
        fiscalQuarter: f.fiscal_quarter,
      });
    }
  }

  onProgress?.(`Filing index built: ${filingIdMap.size} entries`);

  return { filingIdMap, totalFilings: filingRows.length };
}

/**
 * Extracts company profile data from the submissions JSON for upserting
 * into the `companies` table (name, SIC, fiscal year end, etc.).
 */
export function extractCompanyProfileFromSubmissions(submissions: SECSubmissions): {
  name: string;
  sic_code: string | null;
  fiscal_year_end: string | null;       // MM-DD format
  fiscal_year_end_month: number | null;
  fiscal_year_end_day: number | null;
  incorporation_location: string | null;
} {
  // fiscalYearEnd from SEC is MMDD e.g. "0930" → September 30
  let fyEndMonth: number | null = null;
  let fyEndDay: number | null = null;
  let fyEndStr: string | null = null;

  if (submissions.fiscalYearEnd && submissions.fiscalYearEnd.length === 4) {
    const mm = parseInt(submissions.fiscalYearEnd.substring(0, 2));
    const dd = parseInt(submissions.fiscalYearEnd.substring(2, 4));
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      fyEndMonth = mm;
      fyEndDay   = dd;
      fyEndStr   = `${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }
  }

  return {
    name:                 submissions.name || '',
    sic_code:             submissions.sic || null,
    fiscal_year_end:      fyEndStr,
    fiscal_year_end_month: fyEndMonth,
    fiscal_year_end_day:   fyEndDay,
    incorporation_location: submissions.stateOfIncorporation || null,
  };
}
