// Targeted Test: NVIDIA 10-for-1 Stock Split (Item 3.02)
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { ingestFiling } from '../lib/ingestion/filing-ingestion';
import { createServerClient } from '../lib/supabase/client';
import { hardResetCompany } from '../lib/metrics/hard-reset';
import { getCompanyByTicker } from '../lib/ingestion/database';
import { getRecentFilings } from '../lib/ingestion/sec-edgar';

async function main() {
  console.log('Targeted Test: NVIDIA 10-for-1 Stock Split (Item 3.02)\n');
  
  const ticker = 'NVDA';
  const cik = '0001045810';
  
  // Find the split filing (June 2024)
  console.log('Searching for Item 3.02 split filing...');
  const filings = await getRecentFilings(cik, '8-K', 100);
  const splitFiling = filings.find(f => {
    const date = f.filingDate;
    return date >= '2024-06-01' && date <= '2024-06-10';
  });
  
  if (!splitFiling) {
    console.error('❌ No split filing found in June 2024');
    console.log('Recent 8-K filings:');
    filings.slice(0, 10).forEach(f => console.log(`  ${f.accessionNumber} - ${f.filingDate}`));
    process.exit(1);
  }
  
  console.log(`✓ Found split filing: ${splitFiling.accessionNumber} (${splitFiling.filingDate})\n`);
  
  // Get company
  const companyResult = await getCompanyByTicker(ticker);
  if (!companyResult.success || !companyResult.data) {
    throw new Error(`Company not found: ${ticker}`);
  }
  
  const company = companyResult.data;
  
  // Hard reset to ensure clean state
  console.log('Hard resetting company...');
  await hardResetCompany(company.id);
  
  // Get before snapshot
  const supabase = createServerClient();
  const { count: beforeMetrics } = await supabase
    .from('financial_metrics')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', company.id);
  
  const { count: beforeSplits } = await supabase
    .from('stock_splits')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', company.id);
  
  console.log(`Before: ${beforeMetrics || 0} metrics, ${beforeSplits || 0} splits\n`);
  
  // Ingest filing
  console.log(`Ingesting 8-K: ${splitFiling.accessionNumber}`);
  const result = await ingestFiling(company.cik, splitFiling.accessionNumber, (step, details) => {
    console.log(`  ${step}`, details ? JSON.stringify(details) : '');
  });
  
  if (!result.success || !result.filingId) {
    throw new Error(`Filing ingestion failed: ${result.error}`);
  }
  
  // Get after snapshot
  const { count: afterMetrics } = await supabase
    .from('financial_metrics')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', company.id);
  
  const { count: afterSplits } = await supabase
    .from('stock_splits')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', company.id);
  
  // Get filing details
  const { data: filing } = await supabase
    .from('filings')
    .select('items, fiscal_year, fiscal_quarter, period_end_date')
    .eq('id', result.filingId)
    .single();
  
  // Get splits
  const { data: splits } = await supabase
    .from('stock_splits')
    .select('*')
    .eq('company_id', company.id)
    .eq('source', '8-K')
    .order('effective_date', { ascending: false });
  
  console.log(`\n=== Results ===`);
  console.log(`Filing items: ${filing?.items?.join(', ') || 'N/A'}`);
  console.log(`Metrics: ${beforeMetrics || 0} → ${afterMetrics || 0} ${afterMetrics === beforeMetrics ? '✓' : '✗'}`);
  console.log(`Splits: ${beforeSplits || 0} → ${afterSplits || 0}`);
  console.log(`Fiscal fields: fiscal_year=${filing?.fiscal_year}, fiscal_quarter=${filing?.fiscal_quarter}, period_end_date=${filing?.period_end_date}`);
  
  if (splits && splits.length > 0) {
    console.log(`\n✓ Split detected:`);
    splits.forEach(split => {
      console.log(`  - Ratio: ${split.split_ratio}-for-1`);
      console.log(`  - Effective: ${split.effective_date}`);
      console.log(`  - Source: ${split.source}`);
    });
  } else {
    console.log(`\n⚠ No splits detected (expected: 10-for-1 on ~2024-06-10)`);
  }
  
  // Validate
  const hasItem302 = filing?.items?.includes('3.02');
  const hasNoFiscalFields = filing?.fiscal_year === null && filing?.fiscal_quarter === null && filing?.period_end_date === null;
  const noMetricsCreated = (afterMetrics || 0) === (beforeMetrics || 0);
  const splitDetected = (afterSplits || 0) > (beforeSplits || 0);
  
  console.log(`\n=== Validation ===`);
  console.log(`Item 3.02 present: ${hasItem302 ? '✓' : '✗'}`);
  console.log(`No fiscal fields: ${hasNoFiscalFields ? '✓' : '✗'}`);
  console.log(`No metrics created: ${noMetricsCreated ? '✓' : '✗'}`);
  console.log(`Split detected: ${splitDetected ? '✓' : '✗'}`);
  
  if (hasItem302 && hasNoFiscalFields && noMetricsCreated && splitDetected) {
    console.log(`\n✅ All validations passed!`);
  } else {
    console.log(`\n❌ Some validations failed`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
