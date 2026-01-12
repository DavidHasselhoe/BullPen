// Extract metrics for all available filings of a company
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';
import { extractMetricsForFiling } from '../lib/metrics/metrics-orchestrator';

async function main() {
  const ticker = process.argv[2]?.toUpperCase() || 'AAPL';
  
  console.log(`📊 Extracting metrics for all ${ticker} filings...\n`);

  const supabase = createServerClient();

  // Get company
  const { data: company } = await supabase
    .from('companies')
    .select('id, name, ticker, cik')
    .eq('ticker', ticker)
    .single();

  if (!company) {
    console.error(`❌ Company ${ticker} not found`);
    process.exit(1);
  }

  console.log(`Found: ${company.name} (${company.ticker})\n`);

  // Get all completed filings (10-K, 10-Q, 20-F, 6-K), ordered by date (most recent first)
  const { data: filings } = await supabase
    .from('filings')
    .select('id, filing_type, filing_date, period_end_date, accession_number')
    .eq('company_id', company.id)
    .eq('processing_status', 'completed')
    .in('filing_type', ['10-K', '10-Q', '20-F', '6-K'])
    .order('filing_date', { ascending: false });

  if (!filings || filings.length === 0) {
    console.error(`❌ No completed filings found for ${ticker}`);
    console.log('\nPlease ingest filings first using:');
    console.log(`  npx tsx scripts/test-ingestion.ts ingest-latest ${company.cik} 10-K`);
    console.log(`  npx tsx scripts/test-ingestion.ts ingest-latest ${company.cik} 10-Q`);
    process.exit(1);
  }

  console.log(`Found ${filings.length} filings:\n`);
  filings.forEach((f, i) => {
    console.log(`  ${i + 1}. ${f.filing_type} - ${f.filing_date} (Period: ${f.period_end_date || 'N/A'})`);
  });
  console.log('');

  // Extract metrics for each filing
  let successCount = 0;
  let failCount = 0;

  for (const filing of filings) {
    console.log(`\n📊 Processing ${filing.filing_type} - ${filing.filing_date}...`);
    
    try {
      const result = await extractMetricsForFiling(filing.id, {
        enforceHistory: false, // Don't enforce history during bulk extraction
        onProgress: (step, details) => {
          if (step.includes('Extracted')) {
            console.log(`  ✓ ${step}`);
          }
        },
      });

      if (result.success) {
        console.log(`  ✅ Extracted ${result.metricsExtracted} metrics`);
        successCount++;
      } else {
        console.log(`  ❌ Failed: ${result.errors?.join(', ') || 'Unknown error'}`);
        failCount++;
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      failCount++;
    }

    // Small delay to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Extraction complete!');
  console.log(`  Success: ${successCount}`);
  console.log(`  Failed: ${failCount}`);
  console.log(`  Total: ${filings.length}`);
  
  // Now enforce history policy
  console.log('\n🔄 Enforcing history policy...');
  const { data: metrics } = await supabase
    .from('financial_metrics')
    .select('filing_id, metric_type, period_type, period_end_date')
    .eq('company_id', company.id);

  const annualCount = new Set(metrics?.filter(m => m.period_type === 'annual').map(m => m.filing_id)).size;
  const quarterlyCount = new Set(metrics?.filter(m => m.period_type === 'quarterly').map(m => m.filing_id)).size;

  console.log(`  Annual filings with metrics: ${annualCount}`);
  console.log(`  Quarterly filings with metrics: ${quarterlyCount}`);

  // Extract metrics with history enforcement one more time for the most recent of each type
  if (filings.length > 0) {
    const latest10K = filings.find(f => f.filing_type === '10-K');
    const latest10Q = filings.find(f => f.filing_type === '10-Q');

    if (latest10K) {
      console.log(`\n🔄 Enforcing history policy for ${latest10K.filing_type}...`);
      await extractMetricsForFiling(latest10K.id, {
        enforceHistory: true,
      });
    }

    if (latest10Q) {
      console.log(`\n🔄 Enforcing history policy for ${latest10Q.filing_type}...`);
      await extractMetricsForFiling(latest10Q.id, {
        enforceHistory: true,
      });
    }
  }

  console.log('\n✅ Done! Metrics should now be available in the UI.');
}

main();
