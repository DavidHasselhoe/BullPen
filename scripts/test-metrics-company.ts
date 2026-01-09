// Test metrics extraction for a specific company
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';
import { extractMetricsForFiling } from '../lib/metrics/metrics-orchestrator';

async function main() {
  const ticker = process.argv[2]?.toUpperCase();
  
  if (!ticker) {
    console.error('Usage: npx tsx scripts/test-metrics-company.ts <TICKER>');
    console.log('\nExample: npx tsx scripts/test-metrics-company.ts MSFT');
    process.exit(1);
  }

  console.log(`📊 Testing metrics extraction for ${ticker}\n`);

  const supabase = createServerClient();

  // Find company
  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('ticker', ticker)
    .single();

  if (!company) {
    console.error(`❌ Company ${ticker} not found in database`);
    console.log('\nTo add a company, use the ingestion pipeline first.');
    process.exit(1);
  }

  console.log(`Found: ${company.name} (${company.ticker})`);
  console.log(`CIK: ${company.cik}\n`);

  // Find latest 10-K filing
  const { data: filing } = await supabase
    .from('filings')
    .select('*')
    .eq('company_id', company.id)
    .eq('processing_status', 'completed')
    .in('filing_type', ['10-K', '10-Q'])
    .order('filing_date', { ascending: false })
    .limit(1)
    .single();

  if (!filing) {
    console.error(`❌ No completed 10-K or 10-Q filings found for ${ticker}`);
    console.log('\nTo ingest a filing, use the ingestion pipeline first.');
    process.exit(1);
  }

  console.log(`Filing: ${filing.filing_type} - ${filing.filing_date}`);
  console.log(`Accession: ${filing.accession_number}`);
  console.log(`Period End: ${filing.period_end_date || filing.filing_date}`);
  console.log(`Filing ID: ${filing.id}\n`);

  console.log('🔄 Extracting financial metrics from SEC XBRL...\n');

  const result = await extractMetricsForFiling(filing.id, {
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
    console.log(`  Metrics Extracted: ${result.metricsExtracted}\n`);

    if (result.details?.metrics) {
      console.log('Extracted Metrics:');
      result.details.metrics.forEach((m, i) => {
        const status = m.success ? '✅' : '❌';
        const value = m.success 
          ? `${m.value.toLocaleString()} ${m.unit}` 
          : `Error: ${m.error || 'Unknown'}`;
        console.log(`  ${i + 1}. ${status} ${m.metricType}`);
        console.log(`     ${value}`);
      });
    }
  } else {
    console.log('❌ Metrics extraction failed!\n');
    if (result.errors) {
      result.errors.forEach(err => console.log(`  - ${err}`));
    }
    process.exit(1);
  }

  console.log('\n✅ Test complete!');
}

main();
