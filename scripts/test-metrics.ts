// Test Financial Metrics Extraction Script
// Run with: npx tsx scripts/test-metrics.ts

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';
import { extractMetricsForFiling } from '../lib/metrics/metrics-orchestrator';

async function main() {
  console.log('📊 BullPen Financial Metrics Extraction Test\n');

  // Get filing ID from command line or use latest Apple filing
  let filingId = process.argv[2];

  if (!filingId) {
    console.log('📊 Finding latest completed Apple filing...\n');
    const supabase = createServerClient();

    const { data: filing } = await supabase
      .from('filings')
      .select(`
        id, 
        accession_number, 
        filing_type, 
        filing_date,
        company:companies(ticker, name, cik)
      `)
      .eq('processing_status', 'completed')
      .in('filing_type', ['10-K', '10-Q'])
      .order('filing_date', { ascending: false })
      .limit(1)
      .single();

    if (!filing) {
      console.error('❌ No completed 10-K or 10-Q filings found');
      console.log('\nUsage: npx tsx scripts/test-metrics.ts [FILING_ID]');
      process.exit(1);
    }

    filingId = filing.id;
    const company = (filing as any).company;
    console.log(`Found: ${company.name} (${company.ticker})`);
    console.log(`Filing: ${filing.filing_type} - ${filing.filing_date}`);
    console.log(`Accession: ${filing.accession_number}`);
    console.log(`CIK: ${company.cik}`);
    console.log(`Filing ID: ${filingId}\n`);
  }

  console.log('🔄 Extracting financial metrics from SEC XBRL...\n');

  const result = await extractMetricsForFiling(filingId, {
    enforceHistory: true,
    onProgress: (step, details) => {
      console.log(`  → ${step}`, details ? `(${JSON.stringify(details)})` : '');
    },
  });

  console.log('\n' + '='.repeat(60));

  if (result.success) {
    console.log('✅ Metrics extraction completed successfully!\n');
    console.log('Results:');
    console.log(`  Filing ID:         ${result.filingId}`);
    console.log(`  Company ID:        ${result.companyId}`);
    console.log(`  Metrics Extracted: ${result.metricsExtracted}`);
    
    if (result.details?.metrics) {
      console.log(`\nExtracted Metrics:`);
      result.details.metrics.forEach((metric, i) => {
        const status = metric.success ? '✅' : '❌';
        console.log(`  ${i + 1}. ${status} ${metric.metricType}`);
        if (metric.success) {
          console.log(`     Value: ${metric.value.toLocaleString()} ${metric.unit}`);
        } else {
          console.log(`     Error: ${metric.error}`);
        }
      });
    }
  } else {
    console.log('❌ Metrics extraction failed!\n');
    if (result.errors) {
      console.log('Errors:');
      result.errors.forEach((error, i) => {
        console.log(`  ${i + 1}. ${error}`);
      });
    }
    process.exit(1);
  }

  console.log('\n📋 Fetching stored metrics...\n');

  // Query metrics from database
  const supabase = createServerClient();
  const { data: metrics } = await supabase
    .from('financial_metrics')
    .select('*')
    .eq('filing_id', filingId)
    .order('metric_type', { ascending: true });

  if (metrics && metrics.length > 0) {
    console.log(`Found ${metrics.length} metrics:\n`);
    metrics.forEach((metric, i) => {
      console.log(`${i + 1}. ${metric.metric_type}`);
      console.log(`   Value: ${metric.value.toLocaleString()} ${metric.unit}`);
      console.log(`   Period: ${metric.period_type} ending ${metric.period_end_date}`);
      console.log('');
    });
  } else {
    console.log('No metrics found in database');
  }

  console.log('\n📊 SQL Verification:\n');
  console.log('Run this SQL to verify metrics:');
  console.log('```sql');
  console.log(`SELECT`);
  console.log(`  metric_type,`);
  console.log(`  value,`);
  console.log(`  unit,`);
  console.log(`  period_type,`);
  console.log(`  period_end_date`);
  console.log(`FROM financial_metrics`);
  console.log(`WHERE filing_id = '${filingId}'`);
  console.log(`ORDER BY metric_type;`);
  console.log('```\n');

  console.log('Time-series query (for charts):');
  console.log('```sql');
  console.log(`SELECT`);
  console.log(`  period_end_date,`);
  console.log(`  metric_type,`);
  console.log(`  value,`);
  console.log(`  unit`);
  console.log(`FROM financial_metrics`);
  console.log(`WHERE company_id = '${result.companyId}'`);
  console.log(`  AND metric_type = 'revenue'`);
  console.log(`ORDER BY period_end_date DESC;`);
  console.log('```\n');
}

main();
