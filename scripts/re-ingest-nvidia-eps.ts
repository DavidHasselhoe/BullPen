// Re-ingest NVIDIA filing to extract EPS with new validation threshold
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';
import { extractMetricsForFiling } from '../lib/metrics/metrics-orchestrator';

async function main() {
  const companyId = process.argv[2] || '1b09229f-48c1-4427-9d42-ccc27a7d9237';
  
  console.log(`🔄 Re-ingesting NVIDIA filing to extract EPS with new validation threshold\n`);
  
  const supabase = createServerClient();
  
  // Get company
  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single();
  
  if (companyError || !company) {
    console.error('❌ Company not found:', companyError);
    return;
  }
  
  console.log(`✅ Company: ${company.name} (${company.ticker})\n`);
  
  // Get recent 10-Q filing
  const { data: filing, error: filingError } = await supabase
    .from('filings')
    .select('*')
    .eq('company_id', companyId)
    .eq('filing_type', '10-Q')
    .eq('processing_status', 'completed')
    .order('filing_date', { ascending: false })
    .limit(1)
    .single();
  
  if (filingError || !filing) {
    console.error('❌ No 10-Q filing found:', filingError);
    return;
  }
  
  console.log(`✅ Filing: ${filing.filing_type} - ${filing.accession_number}`);
  console.log(`   Period End: ${filing.period_end_date}`);
  console.log(`   Filing Date: ${filing.filing_date}\n`);
  
  // Check existing EPS metrics before re-ingestion
  console.log('📊 Checking existing EPS metrics before re-ingestion...\n');
  const { data: existingEPS } = await supabase
    .from('financial_metrics')
    .select('*')
    .eq('company_id', companyId)
    .in('metric_type', ['eps_basic', 'eps_diluted'])
    .order('period_end_date', { ascending: false })
    .limit(5);
  
  if (existingEPS && existingEPS.length > 0) {
    console.log(`Found ${existingEPS.length} existing EPS metrics:`);
    existingEPS.forEach(m => {
      console.log(`  - ${m.metric_type} (${m.period_type}): ${m.value} ${m.unit} @ ${m.period_end_date}`);
    });
  } else {
    console.log('No existing EPS metrics found');
  }
  
  console.log('\n🔄 Starting re-ingestion...\n');
  console.log('='.repeat(60));
  
  // Track progress
  const progressLog: Array<{ step: string; details?: any }> = [];
  
  const result = await extractMetricsForFiling(filing.id, {
    enforceHistory: true,
    onProgress: (step, details) => {
      const logEntry = { step, details };
      progressLog.push(logEntry);
      console.log(`📌 ${step}`);
      if (details) {
        if (typeof details === 'object') {
          Object.entries(details).forEach(([key, value]) => {
            if (key !== 'metricType' || step.includes('Extracted') || step.includes('Calculated')) {
              console.log(`   ${key}: ${value}`);
            }
          });
        } else {
          console.log(`   ${details}`);
        }
      }
    },
  });
  
  console.log('='.repeat(60));
  console.log('\n📋 EXTRACTION RESULT:\n');
  
  if (result.success) {
    console.log(`✅ Successfully extracted metrics`);
    console.log(`   Metrics extracted: ${result.metricsExtracted || 0}`);
    console.log(`   Filing ID: ${result.filingId}`);
    
    if (result.details?.metrics) {
      console.log('\n📊 Extracted Metrics:');
      result.details.metrics.forEach((m: any) => {
        const status = m.success ? '✅' : '❌';
        console.log(`   ${status} ${m.metricType}: ${m.success ? `${m.value} ${m.unit}` : m.error}`);
      });
    }
  } else {
    console.log(`❌ Extraction failed`);
    console.log(`   Errors: ${result.errors?.join(', ') || result.error || 'Unknown error'}`);
  }
  
  // Check EPS metrics after re-ingestion
  console.log('\n📊 Checking EPS metrics after re-ingestion...\n');
  const { data: epsAfter } = await supabase
    .from('financial_metrics')
    .select('*')
    .eq('company_id', companyId)
    .in('metric_type', ['eps_basic', 'eps_diluted'])
    .order('period_end_date', { ascending: false })
    .limit(5);
  
  if (epsAfter && epsAfter.length > 0) {
    console.log(`Found ${epsAfter.length} EPS metrics after re-ingestion:`);
    epsAfter.forEach(m => {
      console.log(`  - ${m.metric_type} (${m.period_type}): ${m.value} ${m.unit} @ ${m.period_end_date}`);
      console.log(`    Split Adjusted: ${m.split_adjusted}`);
      console.log(`    Ingested: ${m.ingested_at || m.created_at}`);
    });
    
    // Check if our filing's period is included
    const filingEPS = epsAfter.filter(m => 
      m.period_end_date === filing.period_end_date && 
      m.filing_id === filing.id
    );
    
    if (filingEPS.length > 0) {
      console.log(`\n✅ EPS metrics successfully extracted for filing period ${filing.period_end_date}:`);
      filingEPS.forEach(m => {
        console.log(`   - ${m.metric_type}: ${m.value} ${m.unit}`);
      });
    } else {
      console.log(`\n⚠️  EPS metrics exist but not for this filing's period (${filing.period_end_date})`);
      console.log(`   This may indicate the metrics were rejected during extraction`);
      
      // Check progress log for rejection reasons
      const rejectionLogs = progressLog.filter(log => 
        log.step.includes('Skipping') || 
        log.step.includes('rejected') || 
        log.step.includes('failed')
      );
      
      if (rejectionLogs.length > 0) {
        console.log(`\n🔍 Rejection reasons found in progress log:`);
        rejectionLogs.forEach(log => {
          console.log(`   - ${log.step}`);
          if (log.details) {
            console.log(`     ${JSON.stringify(log.details)}`);
          }
        });
      }
    }
  } else {
    console.log('❌ No EPS metrics found after re-ingestion');
    console.log('   This indicates the metrics were rejected or failed to extract');
    
    // Check progress log for reasons
    const rejectionLogs = progressLog.filter(log => 
      log.step.includes('Skipping') || 
      log.step.includes('rejected') || 
      log.step.includes('failed') ||
      log.step.includes('EPS')
    );
    
    if (rejectionLogs.length > 0) {
      console.log(`\n🔍 Relevant progress log entries:`);
      rejectionLogs.forEach(log => {
        console.log(`   - ${log.step}`);
        if (log.details) {
          console.log(`     ${JSON.stringify(log.details)}`);
        }
      });
    }
  }
  
  // Check all metrics for this filing
  console.log('\n📊 All metrics for this filing after re-ingestion...\n');
  const { data: allMetrics } = await supabase
    .from('financial_metrics')
    .select('*')
    .eq('filing_id', filing.id)
    .order('metric_type', { ascending: true });
  
  if (allMetrics && allMetrics.length > 0) {
    console.log(`Found ${allMetrics.length} metrics for filing ${filing.accession_number}:`);
    allMetrics.forEach(m => {
      const status = m.metric_type.includes('eps') || m.metric_type === 'free_cash_flow' ? '⭐' : '  ';
      console.log(`${status} ${m.metric_type} (${m.period_type}): ${m.value} ${m.unit}`);
      if (m.error) {
        console.log(`     Error: ${m.error}`);
      }
    });
  } else {
    console.log('⚠️  No metrics found for this filing');
  }
  
  console.log('\n✅ Re-ingestion complete!\n');
}

main().catch(console.error);
