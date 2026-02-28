// Re-ingest NVIDIA 10-Q filing with 6.04 EPS to check if it should be annual
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';
import { extractMetricsForFiling } from '../lib/metrics/metrics-orchestrator';

async function main() {
  const companyId = '1b09229f-48c1-4427-9d42-ccc27a7d9237'; // NVIDIA
  const accessionNumber = '0001045810-24-000124'; // 10-Q with 6.04 EPS
  
  console.log('🔄 Re-ingesting NVIDIA 10-Q filing to check 6.04 EPS...\n');
  
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
  
  // Get the 10-Q filing
  const { data: filing } = await supabase
    .from('filings')
    .select('*')
    .eq('company_id', companyId)
    .eq('accession_number', accessionNumber)
    .single();
  
  if (!filing) {
    console.error('❌ Filing not found');
    return;
  }
  
  console.log('Filing Details:');
  console.log(`  Filing Type: ${filing.filing_type}`);
  console.log(`  Accession Number: ${filing.accession_number}`);
  console.log(`  Filing Date: ${filing.filing_date}`);
  console.log(`  Period End Date: ${filing.period_end_date}`);
  console.log(`  Period Type: ${filing.period_type || 'null'}`);
  console.log(`  Fiscal Year: ${filing.fiscal_year || 'null'}`);
  console.log(`  Fiscal Quarter: ${filing.fiscal_quarter || 'null'}\n`);
  
  // Delete existing EPS metrics for this filing (if any)
  console.log('Deleting existing EPS metrics for this filing...\n');
  const { error: deleteError } = await supabase
    .from('financial_metrics')
    .delete()
    .eq('filing_id', filing.id)
    .in('metric_type', ['eps_basic', 'eps_diluted']);
  
  if (deleteError) {
    console.log(`⚠️  Error deleting existing metrics: ${deleteError.message}\n`);
  } else {
    console.log('✅ Existing EPS metrics deleted\n');
  }
  
  console.log('='.repeat(60));
  console.log('Re-ingesting filing with XBRL fp field fix...\n');
  console.log('Note: XBRL fp=\'FY\' should now be detected as annual, even for 10-Q filings\n');
  console.log('='.repeat(60));
  
  const result = await extractMetricsForFiling(filing.id, {
    enforceHistory: true,
    onProgress: (step, details) => {
      // Log all important steps
      if (step.includes('EPS') || step.includes('Storing') || step.includes('Successfully') || step.includes('Skipping') || step.includes('DEBUG') || step.includes('HARD INVARIANT') || step.includes('FATAL') || step.includes('XBRL indicated')) {
        console.log(`📌 ${step}`);
        if (details && typeof details === 'object') {
          Object.entries(details).forEach(([key, value]) => {
            console.log(`   ${key}: ${value}`);
          });
        } else if (details) {
          console.log(`   ${details}`);
        }
      }
    },
  });
  
  console.log('='.repeat(60));
  console.log('\n📋 RE-INGESTION RESULT:\n');
  
  if (result.success) {
    console.log(`✅ Successfully re-ingested filing`);
    console.log(`   Metrics extracted: ${result.metricsExtracted || 0}\n`);
    
    // Check EPS metrics
    const { data: epsMetrics } = await supabase
      .from('financial_metrics')
      .select('*')
      .eq('filing_id', filing.id)
      .in('metric_type', ['eps_basic', 'eps_diluted'])
      .order('period_end_date', { ascending: false });
    
    if (epsMetrics && epsMetrics.length > 0) {
      console.log(`Found ${epsMetrics.length} EPS metrics:\n`);
      epsMetrics.forEach(m => {
        console.log(`  ${m.metric_type}:`);
        console.log(`    Value: ${m.value}`);
        console.log(`    Period Type: ${m.period_type}`);
        console.log(`    Period End: ${m.period_end_date}`);
        console.log(`    Fiscal Year: ${m.fiscal_year}`);
        console.log(`    Fiscal Quarter: ${m.fiscal_quarter}`);
        console.log(`    Split Adjusted: ${m.split_adjusted}`);
        console.log('');
        
        // Check if it's the 6.04 value
        if (m.value === 6.04 || m.value === 5.98) {
          if (m.period_type === 'annual' && m.fiscal_quarter === null) {
            console.log(`    ✅ CORRECT: Annual EPS (from 10-Q with fp='FY') with fiscal_quarter = null`);
          } else if (m.period_type === 'quarterly') {
            console.log(`    ⚠️  WARNING: Still stored as quarterly. XBRL might not have fp='FY' for this value.`);
            console.log(`    This might be correct if the value is actually quarterly Q2 EPS, not annual.`);
          }
        }
        console.log('');
      });
    } else {
      console.log('⚠️  No EPS metrics found after re-ingestion\n');
    }
  } else {
    console.log(`❌ Failed to re-ingest filing`);
    console.log(`   Errors: ${result.errors?.join(', ') || result.error || 'Unknown error'}\n`);
  }
}

main().catch(console.error);
