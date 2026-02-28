/**
 * Lazy Company Ingestion — XBRL-First Architecture
 *
 * Ingests a company on-demand using the SEC's structured XBRL data.
 * One Company Facts API call replaces the previous 88-call AI table-reading pipeline.
 *
 * Pipeline (always sequential — progress never goes backwards):
 *
 *   Step 1  ( 0–10%):  CIK lookup + company record
 *   Step 2  (10–25%):  Fetch SEC Submissions → upsert all filings → build filingIdMap
 *   Step 3  (25–55%):  XBRL metric extraction  (1 API call, 0 AI calls)
 *   Step 4  (55–70%):  Download filing text for latest 1 10-K + 4 10-Qs
 *   Step 5  (70–88%):  AI narrative analysis (MD&A, risk factors)
 *   Step 6  (88–95%):  Trends + signals + composite scores
 *   Step 7  (95–100%): Finalize + logo
 */

import { analyzeFilingSections } from '../ai/ai-orchestrator';
import { generateSignalsForFiling } from '../signals/signals-orchestrator';
import { calculateFilingCompositeScore } from '../scores/scores-orchestrator';
import { analyzeTrendsForCompany } from '../trends/trends-orchestrator';
import { markCompanyIndexAsIngested, getCompanyIndexByTicker } from './search-db';
import { createServerClient } from '../supabase/client';
import { getCompanySubmissions, getFilingContent } from '../ingestion/sec-edgar';
import { processAndUpsertFilings, extractCompanyProfileFromSubmissions } from '../ingestion/submissions-processor';
import { fetchAndExtractCompanyMetrics } from '../ingestion/xbrl-company-facts';
import { parseFiling } from '../ingestion/filing-parser';
import { createFilingSections } from '../ingestion/database';
import { createLazyIngestionTracker } from './progress-tracker';
import type { Company } from '../types/database';
import type { FilingIndexEntry } from '../ingestion/xbrl-company-facts';

// ============================================================
// PUBLIC TYPES
// ============================================================

export interface LazyIngestionResult {
  success: boolean;
  companyId?: string;
  ticker?: string;
  filingsIngested?: number;
  error?: string;
  details?: {
    companyName?: string;
    metricsStored?: number;
    skipped?: boolean;
    reason?: string;
    filings?: Array<{ filingType: string; filingId: string; success: boolean; error?: string }>;
  };
}

export type LazyIngestionProgressCallback = (step: string, details?: any) => void;

export interface LazyIngestionOptions {
  /**
   * When true, bypasses the staleness/count skip check and always runs the
   * full pipeline. Used by the cron job and manual "refresh" triggers.
   */
  forceRefresh?: boolean;
}

/** Number of days after which existing data is considered stale */
const STALENESS_DAYS = 45;

function daysSince(isoTimestamp: string): number {
  const ms = Date.now() - new Date(isoTimestamp).getTime();
  return ms / (1000 * 60 * 60 * 24);
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Picks the filings to use for text analysis (narrative AI):
 *   - 1 most recent annual (10-K filing type maps to 10-K and 20-F)
 *   - 4 most recent quarterly (10-Q filing type maps to 10-Q and 6-K)
 */
function selectTextAnalysisFilings(
  filingIdMap: Map<string, FilingIndexEntry>,
): Array<{ accn: string; entry: FilingIndexEntry }> {
  const annuals: Array<{ accn: string; entry: FilingIndexEntry }> = [];
  const quarterlies: Array<{ accn: string; entry: FilingIndexEntry }> = [];

  for (const [accn, entry] of filingIdMap) {
    if (entry.filingType === '10-K') annuals.push({ accn, entry });
    else if (entry.filingType === '10-Q') quarterlies.push({ accn, entry });
  }

  // Sort most-recent first by period end date
  const byPeriodDesc = (
    a: { entry: FilingIndexEntry },
    b: { entry: FilingIndexEntry },
  ) => (b.entry.periodEndDate || '').localeCompare(a.entry.periodEndDate || '');

  annuals.sort(byPeriodDesc);
  quarterlies.sort(byPeriodDesc);

  return [...annuals.slice(0, 1), ...quarterlies.slice(0, 4)];
}

/**
 * Downloads and stores filing text sections if they haven't been stored yet.
 * Returns true if sections are available (either existing or newly downloaded).
 */
async function ensureFilingSections(
  filingId: string,
  accessionNumber: string,
  cik: string,
  filingType: string,
  supabase: ReturnType<typeof createServerClient>,
  onProgress?: (msg: string) => void,
): Promise<boolean> {
  // Skip download if sections are already stored
  const { count } = await supabase
    .from('filing_sections')
    .select('*', { count: 'exact', head: true })
    .eq('filing_id', filingId);

  if (count && count > 0) {
    return true;
  }

  try {
    onProgress?.(`Downloading ${filingType} text`);
    const content = await getFilingContent(accessionNumber, cik);

    if (!content || content.length < 1000) {
      return false;
    }

    const parsed = parseFiling(content, filingType);
    if (parsed.sections.length === 0) return false;

    await createFilingSections(filingId, parsed.sections);
    onProgress?.(`Stored ${parsed.sections.length} sections for ${filingType}`);
    return true;
  } catch (err) {
    onProgress?.(`Text download skipped: ${err instanceof Error ? err.message : 'unknown'}`);
    return false;
  }
}

// ============================================================
// MAIN ORCHESTRATOR
// ============================================================

export async function lazyIngestCompany(
  ticker: string,
  options?: LazyIngestionOptions,
  onProgress?: LazyIngestionProgressCallback,
): Promise<LazyIngestionResult> {
  const tracker = createLazyIngestionTracker((message, percent) => {
    onProgress?.(`${message} (${percent}%)`);
  });

  try {
    // ── Step 1: CIK lookup ────────────────────────────────────────────── 0–10%
    tracker.startStep('Looking up company');
    const indexResult = await getCompanyIndexByTicker(ticker);

    if (!indexResult.success || !indexResult.data) {
      return { success: false, error: `Company ${ticker} not found in index` };
    }

    const companyIndex = indexResult.data;
    const cik = companyIndex.cik;

    const supabase = createServerClient();

    // Skip re-ingestion if company already has a healthy metric set
    const { data: existingCompanyRaw } = await supabase
      .from('companies')
      .select('id, name, ticker')
      .eq('ticker', ticker.toUpperCase())
      .single();

    const existingCompany = existingCompanyRaw as { id: string; name: string; ticker: string } | null;

    if (existingCompany && companyIndex.has_data && !options?.forceRefresh) {
      const { count } = await supabase
        .from('financial_metrics')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', existingCompany.id);

      const hasMetrics = count !== null && count > 10;
      const isStale =
        !companyIndex.last_ingested_at ||
        daysSince(companyIndex.last_ingested_at) > STALENESS_DAYS;

      if (hasMetrics && !isStale) {
        onProgress?.('Company data is current — skipping ingestion (5%)');
        return {
          success: true,
          companyId: existingCompany.id,
          ticker: existingCompany.ticker,
          filingsIngested: 0,
          details: { companyName: existingCompany.name, skipped: true, reason: 'Data is current (ingested within 45 days)' },
        };
      }

      if (hasMetrics && isStale) {
        onProgress?.(`Data is stale (last ingested ${companyIndex.last_ingested_at ? Math.round(daysSince(companyIndex.last_ingested_at)) : '?'} days ago) — refreshing (5%)`);
      }
    }

    tracker.completeStep('Looking up company');

    // ── Step 2: Fetch SEC Submissions + upsert all filings ──────────── 10–25%
    tracker.startStep('Downloading reports');
    tracker.update('Fetching SEC filing history');

    const submissions = await getCompanySubmissions(cik);

    // Get or create company record, enriching with data from submissions
    let company: Company;
    const profile = extractCompanyProfileFromSubmissions(submissions);

    if (existingCompany) {
      // Update profile data from submissions (may add fiscal year end, SIC, etc.)
      await (supabase.from('companies') as any)
        .update({
          name:                   profile.name || companyIndex.name,
          sic_code:               profile.sic_code,
          fiscal_year_end:        profile.fiscal_year_end,
          fiscal_year_end_month:  profile.fiscal_year_end_month,
          fiscal_year_end_day:    profile.fiscal_year_end_day,
          incorporation_location: profile.incorporation_location,
        })
        .eq('id', existingCompany.id);

      company = existingCompany as Company;
    } else {
      // Create new company record
      const { data: newCompanyRaw, error: createErr } = await supabase
        .from('companies')
        .insert({
          ticker:                 companyIndex.ticker.toUpperCase(),
          name:                   profile.name || companyIndex.name,
          cik:                    companyIndex.cik,
          sic_code:               profile.sic_code,
          fiscal_year_end:        profile.fiscal_year_end,
          fiscal_year_end_month:  profile.fiscal_year_end_month,
          fiscal_year_end_day:    profile.fiscal_year_end_day,
          incorporation_location: profile.incorporation_location,
          sector:                 null,
          industry:               null,
          description:            null,
          metadata:               {},
        } as any)
        .select()
        .single();

      if (createErr || !newCompanyRaw) {
        return { success: false, error: `Failed to create company: ${createErr?.message}` };
      }

      company = newCompanyRaw as unknown as Company;
    }

    // Upsert all filings from submissions and build the accn → filingId map
    tracker.update('Indexing all filings');
    const { filingIdMap, totalFilings } = await processAndUpsertFilings(
      submissions,
      company.id,
      cik,
      (msg) => tracker.update(msg),
    );

    tracker.update(`Indexed ${totalFilings} filings`);
    tracker.completeStep('Downloading reports');

    // ── Step 3: XBRL metric extraction ──────────────────────────────── 25–55%
    tracker.startStep('Extracting metrics');
    tracker.update('Extracting financial metrics via XBRL');

    const metricsResult = await fetchAndExtractCompanyMetrics(
      cik,
      company.id,
      filingIdMap,
      (msg) => tracker.update(msg),
    );

    if (metricsResult.errors.length > 0) {
      console.warn(`[LazyIngestion] XBRL warnings for ${ticker}:`, metricsResult.errors);
    }

    tracker.update(`Stored ${metricsResult.metricsStored} metrics (${metricsResult.fcfCalculated} FCF periods)`);
    tracker.completeStep('Extracting metrics');

    // ── Steps 4-5: Text download + AI analysis ─────────────────────── 55–88%
    tracker.startStep('Analyzing with AI');

    const textFilings = selectTextAnalysisFilings(filingIdMap);

    // Pick the accession numbers for the selected filings so we can iterate them
    const filingsWithAccn = textFilings.map(({ accn, entry }) => ({ accn, entry }));

    for (let i = 0; i < filingsWithAccn.length; i++) {
      const { accn, entry } = filingsWithAccn[i];
      const { filingId, filingType } = entry;

      tracker.update(`Analyzing filing ${i + 1}/${filingsWithAccn.length} (${filingType})`);

      // Download and parse text if not already stored
      const hasSections = await ensureFilingSections(
        filingId,
        accn,
        cik,
        filingType,
        supabase,
        (msg) => tracker.update(msg),
      );

      if (!hasSections) {
        // No text available for this filing — skip AI analysis but continue
        continue;
      }

      try {
        // AI narrative analysis (MD&A, risk factors, executive summary)
        await analyzeFilingSections(filingId, {});
      } catch (err) {
        // Non-fatal: AI may fail due to rate limits; log and continue
        console.warn(`[LazyIngestion] AI analysis failed for ${accn}:`, err);
      }
    }

    tracker.completeStep('Analyzing with AI');

    // ── Step 6: Trends + signals + composite scores ─────────────────── 88–95%
    tracker.startStep('Generating insights');

    // Run signals and scores for each analyzed filing (best-effort, non-blocking)
    for (const { accn, entry } of filingsWithAccn) {
      try {
        await Promise.all([
          generateSignalsForFiling(entry.filingId, {}),
          calculateFilingCompositeScore(entry.filingId, { storeResult: true }),
        ]);
      } catch (err) {
        console.warn(`[LazyIngestion] Signals/score failed for ${accn}:`, err);
      }
    }

    // Company-level trend analysis
    try {
      await analyzeTrendsForCompany(company.id, { onProgress: () => {} });
    } catch (err) {
      console.warn(`[LazyIngestion] Trend analysis failed for ${ticker}:`, err);
    }

    tracker.completeStep('Generating insights');

    // ── Step 7: Finalize ────────────────────────────────────────────── 95–100%
    tracker.startStep('Finalizing');

    await markCompanyIndexAsIngested(ticker);

    // Logo ingestion — fire and forget (non-blocking)
    import('../logos/logos-orchestrator')
      .then(({ ingestCompanyLogo }) =>
        ingestCompanyLogo(company.ticker, company.name, company.id, () => {}).catch(() => {}),
      )
      .catch(() => {});

    tracker.completeStep('Finalizing');
    tracker.update('Ingestion complete');

    return {
      success: true,
      companyId: company.id,
      ticker: company.ticker,
      filingsIngested: textFilings.length,
      details: {
        companyName: company.name,
        metricsStored: metricsResult.metricsStored,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error occurred',
    };
  }
}
