// Re-ingest all filings for NVIDIA
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';
import { extractMetricsForFiling } from '../lib/metrics/metrics-orchestrator';

async function main() {
  const companyId = '1b09229f-48c1-4427-9d42-ccc27a7d9237'; // NVIDIA
  
  console.log('🔄 Re-ingesting all filings for NVIDIA\n');
  
  const supabase = createServerClient();
  
  // Get company
  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single();
  
  if (!company) {
    console.error('❌ Company not found');
    return;
  }
  
  console.log(`✅ Company: ${company.name} (${company.ticker})\n`);
  
  // Get all completed filings for NVIDIA, ordered by filing date (oldest first for proper ingestion order)
  const { data: filings, error: filingsError } = await supabase
    .from('filings')
    .select('*')
    .eq('company_id', companyId)
    .eq('processing_status', 'completed')
    .in('filing_type', ['10-K', '10-Q', '20-F'])
    .order('filing_date', { ascending: true }); // Oldest first to maintain proper order
  
  if (filingsError) {
    console.error('❌ Error fetching filings:', filingsError);
    return;
  }
  
  if (!filings || filings.length === 0) {
    console.log('⚠️  No completed filings found');
    return;
  }
  
  console.log(`Found ${filings.length} completed filings to re-ingest:\n`);
  filings.forEach(f => {
    console.log(`  - ${f.filing_type} - ${f.accession_number} (${f.period_end_date || f.filing_date})`);
  });
  console.log('');
  
  let successCount = 0;
  let failCount = 0;
  const errors: string[] = [];
  
  // Re-ingest each filing
  for (const filing of filings) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Re-ingesting: ${filing.filing_type} - ${filing.accession_number}`);
    console.log(`Period End: ${filing.period_end_date || filing.filing_date}`);
    console.log('='.repeat(60));
    
    const result = await extractMetricsForFiling(filing.id, {
      enforceHistory: true,
      onProgress: (step, details) => {
        // Only log important steps to avoid noise
        if (step.includes('EPS') || step.includes('Storing') || step.includes('Successfully') || step.includes('Skipping') || step.includes('DEBUG') || step.includes('HARD INVARIANT')) {
          console.log(`📌 ${step}`);
          if (details && typeof details === 'object') {
            Object.entries(details).forEach(([key, value]) => {
              if (key !== 'metricType' || step.includes('EPS') || step.includes('DEBUG')) {
                console.log(`   ${key}: ${value}`);
              }
            });
          } else if (details) {
            console.log(`   ${details}`);
          }
        }
      },
    });
    
    if (result.success) {
      successCount++;
      console.log(`✅ Successfully re-ingested ${filing.filing_type} - ${filing.accession_number}`);
      console.log(`   Metrics extracted: ${result.metricsExtracted || 0}`);
      
      if (result.details?.metrics) {
        const epsMetrics = result.details.metrics.filter((m: any) => 
          m.metricType === 'eps_basic' || m.metricType === 'eps_diluted'
        );
        if (epsMetrics.length > 0) {
          console.log(`   EPS metrics: ${epsMetrics.length}`);
          epsMetrics.forEach((m: any) => {
            const status = m.success ? '✅' : '❌';
            console.log(`     ${status} ${m.metricType}: ${m.success ? `${m.value} ${m.unit}` : m.error}`);
          });
        }
      }
    } else {
      failCount++;
      const errorMsg = result.errors?.join(', ') || result.error || 'Unknown error';
      errors.push(`${filing.filing_type} - ${filing.accession_number}: ${errorMsg}`);
      console.log(`❌ Failed to re-ingest ${filing.filing_type} - ${filing.accession_number}`);
      console.log(`   Error: ${errorMsg}`);
    }
    
    // Small delay between filings to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('📋 RE-INGESTION SUMMARY\n');
  console.log(`Total filings: ${filings.length}`);
  console.log(`✅ Successful: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);
  
  if (errors.length > 0) {
    console.log(`\nErrors:\n`);
    errors.forEach(e => console.log(`  - ${e}`));
  }
  
  // Verify final EPS metrics
  console.log(`\n🔍 Verifying EPS metrics after re-ingestion...\n`);
  const { data: epsMetrics } = await supabase
    .from('financial_metrics')
    .select('*, filings(filing_type, accession_number)')
    .eq('company_id', companyId)
    .in('metric_type', ['eps_basic', 'eps_diluted'])
    .order('period_end_date', { ascending: false })
    .limit(10);
  
  if (epsMetrics && epsMetrics.length > 0) {
    console.log(`Found ${epsMetrics.length} EPS metrics:\n`);
    epsMetrics.forEach(m => {
      const filing = m.filings as any;
      console.log(`  ${m.metric_type} (${m.period_type}): ${m.value} ${m.unit}`);
      console.log(`    Period: ${m.period_end_date}, FY${m.fiscal_year}, Q${m.fiscal_quarter || 'null'}`);
      console.log(`    Filing: ${filing?.filing_type} - ${filing?.accession_number}`);
      console.log(`    Split Adjusted: ${m.split_adjusted}`);
      console.log('');
    });
  } else {
    console.log('⚠️  No EPS metrics found after re-ingestion\n');
  }
  
  console.log('✅ Re-ingestion complete!\n');
}

main().catch(console.error);
