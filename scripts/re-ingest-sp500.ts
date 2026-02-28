// Re-Ingestion Strategy for S&P 500 Companies
// Phase 5: Script to reset and re-ingest S&P 500 companies
// Produces reconciliation report

import { hardResetByTickers } from '../lib/metrics/hard-reset';
import { extractMetricsForFiling } from '../lib/metrics/metrics-orchestrator';
import { createServerClient } from '../lib/supabase/client';

interface ReconciliationReport {
  companyTicker: string;
  companyName: string;
  status: 'success' | 'failed' | 'skipped';
  filingsProcessed: number;
  metricsExtracted: number;
  errors: string[];
  rejectedMetrics: Array<{
    metricType: string;
    error: string;
  }>;
}

interface ReIngestionOptions {
  tickers?: string[]; // If provided, only process these tickers
  dryRun?: boolean; // If true, don't actually reset/ingest
  onProgress?: (message: string, details?: any) => void;
}

/**
 * Re-ingests S&P 500 companies (or subset)
 * 
 * Process:
 * 1. Hard reset each company (delete filings + metrics)
 * 2. Re-fetch and ingest filings chronologically
 * 3. Extract metrics with validation
 * 4. Generate reconciliation report
 */
export async function reIngestSP500(
  options: ReIngestionOptions = {}
): Promise<ReconciliationReport[]> {
  const { tickers, dryRun = false, onProgress } = options;
  const supabase = createServerClient();
  const reports: ReconciliationReport[] = [];

  try {
    // Step 1: Get list of companies to process
    onProgress?.('Fetching company list');
    
    let companiesQuery = supabase
      .from('companies')
      .select('id, ticker, name, cik')
      .order('ticker');

    if (tickers && tickers.length > 0) {
      companiesQuery = companiesQuery.in('ticker', tickers);
    }

    const { data: companies, error: companiesError } = await companiesQuery;

    if (companiesError || !companies) {
      throw new Error(`Failed to fetch companies: ${companiesError?.message}`);
    }

    onProgress?.(`Found ${companies.length} companies to process`);

    // Step 2: Process each company
    for (const company of companies) {
      const report: ReconciliationReport = {
        companyTicker: company.ticker,
        companyName: company.name,
        status: 'skipped',
        filingsProcessed: 0,
        metricsExtracted: 0,
        errors: [],
        rejectedMetrics: [],
      };

      try {
        onProgress?.(`Processing ${company.ticker} (${company.name})`);

        // Step 2.1: Hard reset (delete filings + metrics)
        if (!dryRun) {
          onProgress?.(`Resetting ${company.ticker}`);
          const resetResult = await hardResetByTickers([company.ticker]);
          
          if (!resetResult.success) {
            report.status = 'failed';
            report.errors.push(`Reset failed: ${resetResult.error}`);
            reports.push(report);
            continue;
          }
        } else {
          onProgress?.(`[DRY RUN] Would reset ${company.ticker}`);
        }

        // Step 2.2: Fetch filings for this company
        // Note: This requires implementing filing discovery/fetching
        // For now, we'll skip this step and mark as "requires manual filing ingestion"
        
        onProgress?.(`[SKIP] Filing ingestion not yet implemented for ${company.ticker}`);
        report.status = 'skipped';
        report.errors.push('Filing ingestion not yet implemented - requires manual filing fetch');

        // Step 2.3: Extract metrics for each filing
        // This would be done after filing ingestion
        
        reports.push(report);
      } catch (error) {
        report.status = 'failed';
        report.errors.push(error instanceof Error ? error.message : 'Unknown error');
        reports.push(report);
      }
    }

    return reports;
  } catch (error) {
    throw new Error(`Re-ingestion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generates a reconciliation report summary
 */
export function generateReconciliationSummary(
  reports: ReconciliationReport[]
): string {
  const total = reports.length;
  const successful = reports.filter(r => r.status === 'success').length;
  const failed = reports.filter(r => r.status === 'failed').length;
  const skipped = reports.filter(r => r.status === 'skipped').length;

  const totalFilings = reports.reduce((sum, r) => sum + r.filingsProcessed, 0);
  const totalMetrics = reports.reduce((sum, r) => sum + r.metricsExtracted, 0);
  const totalErrors = reports.reduce((sum, r) => sum + r.errors.length, 0);
  const totalRejected = reports.reduce((sum, r) => sum + r.rejectedMetrics.length, 0);

  return `
Re-Ingestion Reconciliation Report
===================================

Summary:
--------
Total Companies: ${total}
Successful: ${successful}
Failed: ${failed}
Skipped: ${skipped}

Metrics:
--------
Total Filings Processed: ${totalFilings}
Total Metrics Extracted: ${totalMetrics}
Total Errors: ${totalErrors}
Total Rejected Metrics: ${totalRejected}

Per-Company Details:
--------------------
${reports.map(r => `
${r.companyTicker} (${r.companyName}):
  Status: ${r.status}
  Filings: ${r.filingsProcessed}
  Metrics: ${r.metricsExtracted}
  Errors: ${r.errors.length}
  Rejected: ${r.rejectedMetrics.length}
  ${r.errors.length > 0 ? `Errors: ${r.errors.join(', ')}` : ''}
`).join('\n')}
`;
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const tickers = args.filter(arg => !arg.startsWith('--'));

  reIngestSP500({
    tickers: tickers.length > 0 ? tickers : undefined,
    dryRun,
    onProgress: (message, details) => {
      console.log(`[${new Date().toISOString()}] ${message}`, details || '');
    },
  })
    .then((reports) => {
      console.log(generateReconciliationSummary(reports));
      process.exit(0);
    })
    .catch((error) => {
      console.error('Re-ingestion failed:', error);
      process.exit(1);
    });
}
