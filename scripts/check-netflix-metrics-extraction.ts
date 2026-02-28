// Check why Netflix metrics extraction failed
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';
import { extractMetricsForFiling } from '../lib/metrics/metrics-orchestrator';

async function main() {
  const supabase = createServerClient();
  
  console.log('🔍 Checking Netflix metrics extraction...\n');
  
  // Get Netflix company
  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('ticker', 'NFLX')
    .single();
  
  if (!company) {
    console.log('❌ Netflix not found');
    return;
  }
  
  // Get latest filing
  const { data: filing } = await supabase
    .from('filings')
    .select('*')
    .eq('company_id', company.id)
    .eq('processing_status', 'completed')
    .order('filing_date', { ascending: false })
    .limit(1)
    .single();
  
  if (!filing) {
    console.log('❌ No completed filings found');
    return;
  }
  
  console.log(`📄 Testing metrics extraction for:`);
  console.log(`   Filing: ${filing.filing_type} - ${filing.filing_date}`);
  console.log(`   Accession: ${filing.accession_number}`);
  console.log(`   Period End: ${filing.period_end_date || filing.filing_date}`);
  console.log(`   Fiscal Year: ${filing.fiscal_year || 'NULL'}`);
  console.log(`   Fiscal Quarter: ${filing.fiscal_quarter || 'NULL'}\n`);
  
  console.log('🔄 Running metrics extraction...\n');
  
  const progressLog: Array<{ step: string; details?: any }> = [];
  const onProgress = (step: string, details?: any) => {
    progressLog.push({ step, details });
    
    // Show important steps
    if (
      step.includes('error') || 
      step.includes('Error') ||
      step.includes('failed') ||
      step.includes('Failed') ||
      step.includes('REJECTED') ||
      step.includes('missing') ||
      step.includes('Missing')
    ) {
      console.log(`  ⚠️  ${step}`);
      if (details) {
        console.log(`     ${JSON.stringify(details, null, 2)}`);
      }
    } else if (step.includes('Extracted') || step.includes('Success')) {
      console.log(`  ✅ ${step}`);
    }
  };
  
  try {
    const result = await extractMetricsForFiling(filing.id, {
      onProgress,
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 Extraction Result:\n');
    console.log(`Success: ${result.success}`);
    console.log(`Metrics Extracted: ${result.metricsExtracted || 0}`);
    
    if (result.errors && result.errors.length > 0) {
      console.log(`\n❌ Errors (${result.errors.length}):`);
      result.errors.forEach((error, i) => {
        console.log(`  ${i + 1}. ${error}`);
      });
    }
    
    if (!result.success) {
      console.log(`\nError: ${result.error || 'Unknown error'}`);
    }
    
    // Check if any metrics were stored
    const { data: storedMetrics } = await supabase
      .from('financial_metrics')
      .select('metric_type, value, period_type')
      .eq('filing_id', filing.id)
      .limit(10);
    
    console.log(`\n📈 Stored Metrics for this filing: ${storedMetrics?.length || 0}`);
    if (storedMetrics && storedMetrics.length > 0) {
      storedMetrics.forEach((m, i) => {
        console.log(`  ${i + 1}. ${m.metric_type} (${m.period_type}): ${m.value}`);
      });
    } else {
      console.log('  ⚠️  No metrics were stored for this filing');
    }
    
    // Show all progress logs for debugging
    if (progressLog.length > 0) {
      console.log('\n📋 All Progress Logs:');
      progressLog.forEach((log, i) => {
        console.log(`  ${i + 1}. ${log.step}`);
        if (log.details && Object.keys(log.details).length > 0) {
          console.log(`     ${JSON.stringify(log.details, null, 2)}`);
        }
      });
    }
    
  } catch (error) {
    console.error('\n❌ Extraction threw an error:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
      console.error('   Stack:', error.stack);
    }
  }
}

main().catch(console.error);
