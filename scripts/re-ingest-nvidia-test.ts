// Script to delete NVIDIA data and re-ingest to test period classification
// Usage: tsx scripts/re-ingest-nvidia-test.ts

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';
import { lazyIngestCompany } from '../lib/search/lazy-ingestion';
import { hardResetCompany } from '../lib/metrics/hard-reset';

const TICKER = 'NVDA';

async function main() {
  console.log(`🔄 Re-ingesting ${TICKER} to test period classification system\n`);

  const supabase = createServerClient();

  // Step 1: Find company
  console.log('📊 Step 1: Finding company...');
  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('id, name, ticker')
    .eq('ticker', TICKER)
    .single();

  if (companyError || !company) {
    console.error(`❌ Company ${TICKER} not found in database`);
    console.log('\nCompany might need to be ingested first via lazy ingestion.');
    process.exit(1);
  }

  console.log(`✅ Found: ${company.name} (${company.ticker})`);
  console.log(`   Company ID: ${company.id}\n`);

  // Step 2: Get count of existing filings and metrics
  console.log('📊 Step 2: Checking existing data...');
  const { count: filingCount } = await supabase
    .from('filings')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', company.id);

  const { count: metricsCount } = await supabase
    .from('financial_metrics')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', company.id);

  console.log(`   Existing filings: ${filingCount || 0}`);
  console.log(`   Existing metrics: ${metricsCount || 0}\n`);

  // Step 3: Delete all filings and metrics using hard reset utility
  console.log('🗑️  Step 3: Deleting existing filings and metrics...');
  
  const resetResult = await hardResetCompany(company.id);
  
  if (!resetResult.success) {
    console.error(`❌ Error deleting data: ${resetResult.error}`);
    process.exit(1);
  }

  console.log(`✅ Deleted ${resetResult.deletedFilings || 0} filings and ${resetResult.deletedMetrics || 0} metrics\n`);

  // Step 4: Reset company_index.has_data flag
  console.log('📊 Step 4: Resetting company index flag...');
  const { error: indexError } = await supabase
    .from('company_index')
    .update({ has_data: false, last_ingested_at: null })
    .eq('ticker', TICKER);

  if (indexError) {
    console.warn(`⚠️  Warning resetting index: ${indexError.message}`);
  } else {
    console.log('✅ Reset company_index.has_data = false\n');
  }

  // Step 5: Re-ingest company
  console.log('🔄 Step 5: Re-ingesting company with new period classification...\n');
  console.log('=' .repeat(60));
  console.log('This will test the new period classification system:');
  console.log('  - Explicit Q/YTD/TTM/FY detection');
  console.log('  - Strict filtering for quarterly EPS');
  console.log('  - YTD/TTM rejection from 10-Q filings');
  console.log('=' .repeat(60) + '\n');

  const onProgress = (step: string, details?: any) => {
    if (step.includes('REJECTED') || step.includes('EPS')) {
      console.log(`  ⚠️  ${step}`);
    } else if (step.includes('Extracted') || step.includes('Ingested')) {
      console.log(`  ✅ ${step}`);
    } else if (step.includes('Error') || step.includes('Failed')) {
      console.log(`  ❌ ${step}`);
    } else if (step.includes('Step') || step.includes('Phase')) {
      console.log(`  🔄 ${step}`);
    } else {
      console.log(`  • ${step}`);
    }
    if (details && Object.keys(details).length > 0) {
      console.log(`     ${JSON.stringify(details)}`);
    }
  };

  const result = await lazyIngestCompany(TICKER, undefined, onProgress);

  if (!result.success) {
    console.error(`\n❌ Re-ingestion failed: ${result.error}`);
    process.exit(1);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Re-ingestion complete!');
  console.log(`   Filings ingested: ${result.filingsIngested || 0}`);
  console.log(`   Company ID: ${result.companyId}\n`);

  // Step 6: Verify metrics were extracted with correct period classification
  console.log('📊 Step 6: Verifying period classification...\n');
  
  const { data: metrics } = await supabase
    .from('financial_metrics')
    .select('metric_type, period_type, period_end_date, fiscal_year, fiscal_quarter, value')
    .eq('company_id', company.id)
    .in('metric_type', ['eps_basic', 'eps_diluted'])
    .order('period_end_date', { ascending: false })
    .limit(10);

  if (!metrics || metrics.length === 0) {
    console.log('⚠️  No EPS metrics found. Check logs for rejection reasons.');
  } else {
    console.log(`Found ${metrics.length} EPS metrics:\n`);
    metrics.forEach((m, i) => {
      const periodLabel = m.fiscal_quarter 
        ? `Q${m.fiscal_quarter} FY${m.fiscal_year}` 
        : `FY${m.fiscal_year}`;
      console.log(`  ${i + 1}. ${m.metric_type} (${m.period_type}): ${m.value}`);
      console.log(`     Period: ${periodLabel} (${m.period_end_date})`);
    });
    
    // Check for any YTD/TTM in quarterly context
    const quarterlyMetrics = metrics.filter(m => m.period_type === 'quarterly');
    const ytdTtmMetrics = metrics.filter(m => m.period_type === 'ytd' || m.period_type === 'ttm');
    
    console.log(`\n✅ Quarterly EPS: ${quarterlyMetrics.length}`);
    console.log(`   YTD/TTM EPS: ${ytdTtmMetrics.length}`);
    
    if (ytdTtmMetrics.length > 0) {
      console.log('\n⚠️  Note: YTD/TTM metrics should not appear in quarterly charts');
      console.log('   They should only be available when explicitly requested (period_type=ytd or ttm)');
    }
  }

  console.log('\n✅ Test complete! Check the metrics above to verify:');
  console.log('   - Q4 FY2025 EPS should show ~1.30 (Q), not 3.14 (YTD)');
  console.log('   - All quarterly metrics should have period_type=quarterly');
  console.log('   - No YTD/TTM metrics should appear in quarterly context');
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
