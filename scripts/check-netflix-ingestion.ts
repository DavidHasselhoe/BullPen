// Check why Netflix ingestion is failing
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';

async function main() {
  const supabase = createServerClient();
  
  console.log('🔍 Checking Netflix (NFLX) ingestion status...\n');
  
  // Find Netflix company
  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('*')
    .eq('ticker', 'NFLX')
    .single();
  
  if (companyError || !company) {
    console.log('❌ Netflix company not found in database');
    console.log('   Error:', companyError?.message);
    return;
  }
  
  console.log(`✅ Found company: ${company.name} (${company.ticker})`);
  console.log(`   CIK: ${company.cik}`);
  console.log(`   Company ID: ${company.id}\n`);
  
  // Check filings
  const { data: filings, error: filingsError } = await supabase
    .from('filings')
    .select('id, filing_type, filing_date, accession_number, processing_status, processing_error')
    .eq('company_id', company.id)
    .order('filing_date', { ascending: false })
    .limit(20);
  
  if (filingsError) {
    console.log('❌ Error fetching filings:', filingsError.message);
    return;
  }
  
  console.log(`📊 Filings (${filings?.length || 0}):\n`);
  
  if (!filings || filings.length === 0) {
    console.log('⚠️  No filings found - ingestion may not have started or all failed');
    return;
  }
  
  const byStatus = filings.reduce((acc, f) => {
    acc[f.processing_status] = (acc[f.processing_status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log('Status breakdown:');
  Object.entries(byStatus).forEach(([status, count]) => {
    console.log(`  ${status}: ${count}`);
  });
  console.log('');
  
  // Show failed filings with errors
  const failed = filings.filter(f => f.processing_status === 'failed');
  if (failed.length > 0) {
    console.log('❌ Failed Filings:\n');
    failed.forEach((f, i) => {
      console.log(`${i + 1}. ${f.filing_type} - ${f.filing_date}`);
      console.log(`   Accession: ${f.accession_number}`);
      console.log(`   Error: ${f.processing_error || 'No error message'}`);
      console.log('');
    });
  }
  
  // Show pending/processing filings
  const pending = filings.filter(f => f.processing_status === 'pending' || f.processing_status === 'processing');
  if (pending.length > 0) {
    console.log('⏳ Pending/Processing Filings:\n');
    pending.forEach((f, i) => {
      console.log(`${i + 1}. ${f.filing_type} - ${f.filing_date} (${f.processing_status})`);
      console.log(`   Accession: ${f.accession_number}`);
      console.log('');
    });
  }
  
  // Show completed filings
  const completed = filings.filter(f => f.processing_status === 'completed');
  if (completed.length > 0) {
    console.log(`✅ Completed Filings (${completed.length}):\n`);
    completed.slice(0, 5).forEach((f, i) => {
      console.log(`${i + 1}. ${f.filing_type} - ${f.filing_date}`);
    });
    if (completed.length > 5) {
      console.log(`   ... and ${completed.length - 5} more`);
    }
    console.log('');
  }
  
  // Check metrics
  const { data: metrics } = await supabase
    .from('financial_metrics')
    .select('metric_type, period_type')
    .eq('company_id', company.id)
    .limit(10);
  
  console.log(`📈 Financial Metrics: ${metrics?.length || 0} found`);
  
  // Check company index status
  const { data: index } = await supabase
    .from('company_index')
    .select('has_data, last_ingested_at')
    .eq('ticker', 'NFLX')
    .single();
  
  if (index) {
    console.log(`\n📋 Company Index:`);
    console.log(`   has_data: ${index.has_data}`);
    console.log(`   last_ingested_at: ${index.last_ingested_at || 'Never'}`);
  }
}

main().catch(console.error);
