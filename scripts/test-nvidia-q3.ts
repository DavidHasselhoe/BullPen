// Test NVIDIA Q3 filing and metrics extraction
// Usage: tsx scripts/test-nvidia-q3.ts

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';
import { extractMetricsForFiling } from '../lib/metrics/metrics-orchestrator';

const TICKER = 'NVDA';

async function main() {
  console.log(`🔍 Testing ${TICKER} Q3 filing and metrics extraction\n`);

  const supabase = createServerClient();

  // Step 1: Check company fiscal year end
  console.log('📊 Step 1: Checking fiscal year end configuration...');
  const { data: company } = await supabase
    .from('companies')
    .select('id, ticker, name, fiscal_year_end, fiscal_year_end_month, fiscal_year_end_day')
    .eq('ticker', TICKER)
    .single();

  if (!company) {
    console.error(`❌ Company ${TICKER} not found`);
    process.exit(1);
  }

  console.log(`✅ Company: ${company.name} (${company.ticker})`);
  console.log(`   ID: ${company.id}`);
  console.log(`   Fiscal Year End: ${company.fiscal_year_end || 'NOT SET'}`);
  console.log(`   Fiscal Year End Month: ${company.fiscal_year_end_month || 'NOT SET'}`);
  console.log(`   Fiscal Year End Day: ${company.fiscal_year_end_day || 'NOT SET'}\n`);

  if (!company.fiscal_year_end && !company.fiscal_year_end_month) {
    console.log('⚠️  Fiscal year end is NOT configured! This will cause metrics extraction to fail.\n');
    console.log('   Extracting fiscal year end from company profile...\n');
    
    // Try to extract fiscal year end from profile
    const { extractCompanyProfile } = await import('../lib/company/company-profile');
    const profileResult = await extractCompanyProfile(company.cik, company.id);
    
    if (profileResult.success && profileResult.fiscalYearEnd) {
      console.log(`✅ Extracted fiscal year end: ${profileResult.fiscalYearEnd}`);
      
      // Update company record
      const { error: updateError } = await supabase
        .from('companies')
        .update({
          fiscal_year_end: profileResult.fiscalYearEnd,
          fiscal_year_end_month: parseInt(profileResult.fiscalYearEnd.split('-')[0]),
          fiscal_year_end_day: parseInt(profileResult.fiscalYearEnd.split('-')[1]),
        })
        .eq('id', company.id);

      if (updateError) {
        console.error(`❌ Failed to update fiscal year end: ${updateError.message}`);
      } else {
        console.log('✅ Updated company fiscal year end\n');
      }
    } else {
      console.error('❌ Failed to extract fiscal year end from profile');
      console.log('   We need fiscal year end to calculate fiscal quarters\n');
    }
  }

  // Step 2: Find latest Q3 filing (should be Q3 FY2026)
  console.log('📄 Step 2: Finding latest Q3 filing...');
  const { data: filings } = await supabase
    .from('filings')
    .select('id, filing_type, filing_date, period_end_date, accession_number, processing_status')
    .eq('company_id', company.id)
    .eq('filing_type', '10-Q')
    .eq('processing_status', 'completed')
    .order('period_end_date', { ascending: false })
    .limit(5);

  if (!filings || filings.length === 0) {
    console.error('❌ No 10-Q filings found');
    process.exit(1);
  }

  console.log(`\nFound ${filings.length} recent 10-Q filings:\n`);
  filings.forEach((f, i) => {
    console.log(`  ${i + 1}. ${f.filing_type} - ${f.period_end_date} (Filed: ${f.filing_date})`);
    console.log(`     Filing ID: ${f.id}`);
    console.log(`     Accession: ${f.accession_number}`);
  });

  // Get the latest filing (should be Q3)
  const latestFiling = filings[0];
  console.log(`\n📊 Testing latest filing: ${latestFiling.filing_type} - ${latestFiling.period_end_date}\n`);

  // Step 3: Check existing metrics
  console.log('📊 Step 3: Checking existing metrics for this filing...');
  const { data: existingMetrics } = await supabase
    .from('financial_metrics')
    .select('metric_type, period_type, value, unit, fiscal_year, fiscal_quarter')
    .eq('filing_id', latestFiling.id)
    .order('metric_type', { ascending: true });

  if (existingMetrics && existingMetrics.length > 0) {
    console.log(`\nFound ${existingMetrics.length} existing metrics:\n`);
    existingMetrics.forEach((m) => {
      const periodLabel = m.fiscal_quarter 
        ? `Q${m.fiscal_quarter} FY${m.fiscal_year}` 
        : `FY${m.fiscal_year}`;
      console.log(`  - ${m.metric_type} (${m.period_type}): ${m.value} ${m.unit} - ${periodLabel}`);
    });
  } else {
    console.log('  ⚠️  No metrics found for this filing\n');
  }

  // Step 4: Extract metrics with detailed logging
  console.log('🔄 Step 4: Extracting metrics with detailed logging...\n');
  console.log('=' .repeat(70));

  const progressLog: Array<{ step: string; details?: any }> = [];
  const onProgress = (step: string, details?: any) => {
    progressLog.push({ step, details });
    
    // Highlight rejections and EPS-related messages
    if (step.includes('REJECTED') || step.includes('EPS') || step.includes('YTD') || step.includes('TTM')) {
      console.log(`  ⚠️  ${step}`);
      if (details && Object.keys(details).length > 0) {
        console.log(`     ${JSON.stringify(details, null, 2)}`);
      }
    } else if (step.includes('Extracted') || step.includes('Ingested') || step.includes('Created')) {
      console.log(`  ✅ ${step}`);
      if (details && Object.keys(details).length > 0) {
        console.log(`     ${JSON.stringify(details, null, 2)}`);
      }
    } else if (step.includes('Error') || step.includes('Failed') || step.includes('Skipping')) {
      console.log(`  ❌ ${step}`);
      if (details && Object.keys(details).length > 0) {
        console.log(`     ${JSON.stringify(details, null, 2)}`);
      }
    } else {
      console.log(`  • ${step}`);
      if (details && Object.keys(details).length > 0) {
        console.log(`     ${JSON.stringify(details, null, 2)}`);
      }
    }
  };

  const result = await extractMetricsForFiling(latestFiling.id, {
    enforceHistory: false, // Don't clean up old metrics during test
    onProgress,
  });

  console.log('\n' + '=' .repeat(70));
  
  if (!result.success) {
    console.error(`\n❌ Metrics extraction failed: ${result.error}`);
    if (result.errors) {
      result.errors.forEach((e) => console.error(`   - ${e}`));
    }
    process.exit(1);
  }

  console.log(`\n✅ Metrics extraction completed!`);
  console.log(`   Metrics extracted: ${result.metricsExtracted || 0}`);
  if (result.details?.metrics) {
    console.log(`\n   Detailed results:\n`);
    result.details.metrics.forEach((m) => {
      const status = m.success ? '✅' : '❌';
      console.log(`   ${status} ${m.metricType}: ${m.success ? `${m.value} ${m.unit}` : m.error || 'Failed'}`);
    });
  }

  // Step 5: Verify EPS metrics
  console.log('\n📊 Step 5: Verifying EPS metrics...\n');
  const { data: epsMetrics } = await supabase
    .from('financial_metrics')
    .select('metric_type, period_type, value, unit, fiscal_year, fiscal_quarter, period_start_date, period_end_date')
    .eq('filing_id', latestFiling.id)
    .in('metric_type', ['eps_basic', 'eps_diluted'])
    .order('metric_type', { ascending: true });

  if (epsMetrics && epsMetrics.length > 0) {
    console.log(`Found ${epsMetrics.length} EPS metrics:\n`);
    epsMetrics.forEach((m) => {
      const periodLabel = m.fiscal_quarter 
        ? `Q${m.fiscal_quarter} FY${m.fiscal_year}` 
        : `FY${m.fiscal_year}`;
      console.log(`  ✅ ${m.metric_type} (${m.period_type}): ${m.value} ${m.unit}`);
      console.log(`     Period: ${periodLabel}`);
      console.log(`     Date range: ${m.period_start_date || 'N/A'} to ${m.period_end_date}`);
      
      // Check if this is the expected Q3 value
      if (m.metric_type === 'eps_diluted' && m.fiscal_quarter === 3) {
        const expectedValue = 1.30;
        const diff = Math.abs(m.value - expectedValue);
        if (diff < 0.1) {
          console.log(`     ✅ Value matches expected ~${expectedValue}`);
        } else {
          console.log(`     ⚠️  Value ${m.value} differs from expected ~${expectedValue} (diff: ${diff.toFixed(2)})`);
        }
      }
      console.log('');
    });
  } else {
    console.log('⚠️  No EPS metrics found');
    console.log('\n   Rejection log entries:');
    progressLog
      .filter((log) => log.step.includes('EPS') || log.step.includes('REJECTED'))
      .forEach((log) => {
        console.log(`   - ${log.step}`);
        if (log.details) {
          console.log(`     ${JSON.stringify(log.details)}`);
        }
      });
  }

  console.log('\n✅ Test complete!\n');
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
