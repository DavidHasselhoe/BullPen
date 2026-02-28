// Reset NVIDIA data and re-ingest with updated period classification logic
// Usage: tsx scripts/reset-and-reingest-nvidia.ts

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';
import { lazyIngestCompany } from '../lib/search/lazy-ingestion';
import { hardResetCompany } from '../lib/metrics/hard-reset';

const TICKER = 'NVDA';

async function main() {
  console.log(`🔄 Resetting and re-ingesting ${TICKER} with updated period classification logic\n`);

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
    process.exit(1);
  }

  console.log(`✅ Found: ${company.name} (${company.ticker})`);
  console.log(`   Company ID: ${company.id}\n`);

  // Step 2: Check existing data
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

  // Step 3: Delete all data using hard reset
  console.log('🗑️  Step 3: Deleting all existing data...');
  
  const resetResult = await hardResetCompany(company.id);
  
  if (!resetResult.success) {
    console.error(`❌ Error deleting data: ${resetResult.error}`);
    process.exit(1);
  }

  console.log(`✅ Deleted ${resetResult.deletedFilings || 0} filings and ${resetResult.deletedMetrics || 0} metrics\n`);

  // Step 4: Reset company_index flag
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

  // Step 5: Re-ingest with updated logic
  console.log('🔄 Step 5: Re-ingesting with updated period classification logic...\n');
  console.log('='.repeat(70));
  console.log('Updated features:');
  console.log('  - Explicit Q/YTD/TTM/FY detection from XBRL fp and frame');
  console.log('  - Prioritization of quarterly entries over YTD for same periodEndDate');
  console.log('  - Strict filtering: Reject YTD EPS from 10-Q filings');
  console.log('  - Detailed logging for all extraction steps');
  console.log('='.repeat(70) + '\n');

  const progressLog: Array<{ step: string; details?: any }> = [];
  const onProgress = (step: string, details?: any) => {
    progressLog.push({ step, details });
    
    // Highlight key events
    if (step.includes('REJECTED') || step.includes('EPS REJECTED')) {
      console.log(`  ⚠️  ${step}`);
      if (details && Object.keys(details).length > 0) {
        console.log(`     ${JSON.stringify(details, null, 2)}`);
      }
    } else if (step.includes('Extracted eps_diluted') || step.includes('Extracted eps_basic')) {
      console.log(`  ✅ ${step}`);
      if (details && Object.keys(details).length > 0) {
        console.log(`     ${JSON.stringify(details, null, 2)}`);
      }
    } else if (step.includes('Failed') || step.includes('Error')) {
      console.log(`  ❌ ${step}`);
      if (details && Object.keys(details).length > 0) {
        console.log(`     ${JSON.stringify(details, null, 2)}`);
      }
    } else if (step.includes('Phase') || step.includes('Step') || step.includes('Ingested')) {
      console.log(`  🔄 ${step}`);
    }
  };

  const result = await lazyIngestCompany(TICKER, undefined, onProgress);

  if (!result.success) {
    console.error(`\n❌ Re-ingestion failed: ${result.error}`);
    process.exit(1);
  }

  console.log('\n' + '='.repeat(70));
  console.log('✅ Re-ingestion complete!');
  console.log(`   Filings ingested: ${result.filingsIngested || 0}`);
  console.log(`   Company ID: ${result.companyId}\n`);

  // Step 6: Verify EPS metrics
  console.log('📊 Step 6: Verifying EPS metrics extraction...\n');
  
  const { data: allMetrics } = await supabase
    .from('financial_metrics')
    .select('metric_type, period_type, period_end_date, fiscal_year, fiscal_quarter, value, unit')
    .eq('company_id', company.id)
    .in('metric_type', ['eps_basic', 'eps_diluted'])
    .order('period_end_date', { ascending: false })
    .limit(20);

  if (!allMetrics || allMetrics.length === 0) {
    console.log('⚠️  No EPS metrics found in database.\n');
    
    // Check rejection log
    const rejections = progressLog.filter(log => 
      log.step.includes('EPS REJECTED') || log.step.includes('REJECTED')
    );
    
    if (rejections.length > 0) {
      console.log('📋 Rejection log entries:');
      rejections.forEach((log, i) => {
        console.log(`   ${i + 1}. ${log.step}`);
        if (log.details) {
          console.log(`      ${JSON.stringify(log.details)}`);
        }
      });
      console.log('');
    }
  } else {
    console.log(`Found ${allMetrics.length} EPS metrics:\n`);
    
    // Group by period type
    const quarterlyMetrics = allMetrics.filter(m => m.period_type === 'quarterly');
    const ytdMetrics = allMetrics.filter(m => m.period_type === 'ytd');
    const annualMetrics = allMetrics.filter(m => m.period_type === 'annual');
    
    console.log(`📊 Breakdown:`);
    console.log(`   Quarterly EPS: ${quarterlyMetrics.length}`);
    console.log(`   YTD EPS: ${ytdMetrics.length}`);
    console.log(`   Annual EPS: ${annualMetrics.length}\n`);
    
    if (quarterlyMetrics.length > 0) {
      console.log('✅ Quarterly EPS metrics found:\n');
      quarterlyMetrics.forEach((m, i) => {
        const periodLabel = m.fiscal_quarter 
          ? `Q${m.fiscal_quarter} FY${m.fiscal_year}` 
          : `FY${m.fiscal_year}`;
        console.log(`   ${i + 1}. ${m.metric_type} (${m.period_type}): ${m.value} ${m.unit}`);
        console.log(`      Period: ${periodLabel} (${m.period_end_date})`);
        
        // Check for Q3 2026
        if (m.fiscal_quarter === 3 && m.fiscal_year === 2026 && m.metric_type === 'eps_diluted') {
          const expectedValue = 1.30;
          const diff = Math.abs(m.value - expectedValue);
          if (diff < 0.15) {
            console.log(`      ✅ Value ~${m.value} is close to expected ~${expectedValue}`);
          } else {
            console.log(`      ⚠️  Value ${m.value} differs from expected ~${expectedValue} (diff: ${diff.toFixed(2)})`);
          }
        }
        console.log('');
      });
    } else {
      console.log('⚠️  No quarterly EPS metrics found.\n');
    }
    
    if (ytdMetrics.length > 0) {
      console.log(`⚠️  Warning: Found ${ytdMetrics.length} YTD EPS metrics (should not appear for 10-Q filings):\n`);
      ytdMetrics.forEach((m, i) => {
        console.log(`   ${i + 1}. ${m.metric_type} (${m.period_type}): ${m.value} ${m.unit} - ${m.period_end_date}`);
      });
      console.log('');
    }
    
    if (annualMetrics.length > 0) {
      console.log('📋 Annual EPS metrics (from 10-K filings):\n');
      annualMetrics.forEach((m, i) => {
        const periodLabel = `FY${m.fiscal_year}`;
        console.log(`   ${i + 1}. ${m.metric_type} (${m.period_type}): ${m.value} ${m.unit} - ${periodLabel}`);
      });
      console.log('');
    }
  }

  // Step 7: Check latest Q3 filing specifically
  console.log('📊 Step 7: Checking latest Q3 filing (2025-10-26)...\n');
  const { data: latestQ3Filing } = await supabase
    .from('filings')
    .select('id, filing_type, period_end_date, filing_date')
    .eq('company_id', company.id)
    .eq('filing_type', '10-Q')
    .eq('period_end_date', '2025-10-26')
    .single();

  if (latestQ3Filing) {
    console.log(`✅ Found Q3 filing: ${latestQ3Filing.filing_type} - ${latestQ3Filing.period_end_date}`);
    
    const { data: q3Metrics } = await supabase
      .from('financial_metrics')
      .select('metric_type, period_type, value, unit, fiscal_year, fiscal_quarter')
      .eq('filing_id', latestQ3Filing.id)
      .in('metric_type', ['eps_diluted', 'eps_basic'])
      .order('metric_type', { ascending: true });

    if (q3Metrics && q3Metrics.length > 0) {
      console.log(`\n📊 Metrics for Q3 filing:\n`);
      q3Metrics.forEach((m) => {
        const periodLabel = m.fiscal_quarter 
          ? `Q${m.fiscal_quarter} FY${m.fiscal_year}` 
          : `FY${m.fiscal_year}`;
        console.log(`   ${m.metric_type} (${m.period_type}): ${m.value} ${m.unit} - ${periodLabel}`);
      });
    } else {
      console.log(`\n⚠️  No EPS metrics found for Q3 filing (they may have been rejected)\n`);
    }
  } else {
    console.log('⚠️  Q3 filing (2025-10-26) not found\n');
  }

  console.log('='.repeat(70));
  console.log('✅ Test complete!\n');
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
