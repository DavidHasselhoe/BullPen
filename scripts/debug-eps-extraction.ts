// Debug EPS extraction for a company
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';
import { getMetricForFiling } from '../lib/metrics/xbrl-fetcher';

async function main() {
  const companyId = process.argv[2] || '1b09229f-48c1-4427-9d42-ccc27a7d9237';
  
  console.log(`Debugging EPS extraction for company: ${companyId}\n`);
  
  const supabase = createServerClient();
  
  // Get company
  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single();
  
  if (companyError || !company) {
    console.error('Company not found:', companyError);
    return;
  }
  
  console.log(`Company: ${company.name} (${company.ticker})\n`);
  
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
    console.error('No 10-Q filing found:', filingError);
    return;
  }
  
  console.log(`Filing: ${filing.filing_type} - ${filing.accession_number}`);
  console.log(`Period End: ${filing.period_end_date}\n`);
  
  // Try to extract EPS basic
  console.log('Attempting to extract EPS Basic...');
  try {
    const epsBasic = await getMetricForFiling(
      company.cik,
      'eps_basic',
      filing.period_end_date || filing.filing_date,
      filing.filing_type as '10-Q',
      filing.accession_number,
      false // Don't require exact period
    );
    
    if (epsBasic) {
      console.log('✅ EPS Basic found:');
      console.log(`   Value: ${epsBasic.value}`);
      console.log(`   Unit: ${epsBasic.unit}`);
      console.log(`   Period End: ${epsBasic.periodEnd}`);
      console.log(`   Period Type: ${epsBasic.periodType}`);
    } else {
      console.log('❌ EPS Basic not found in XBRL data');
    }
  } catch (error) {
    console.error('Error extracting EPS Basic:', error);
  }
  
  // Try to extract EPS diluted
  console.log('\nAttempting to extract EPS Diluted...');
  try {
    const epsDiluted = await getMetricForFiling(
      company.cik,
      'eps_diluted',
      filing.period_end_date || filing.filing_date,
      filing.filing_type as '10-Q',
      filing.accession_number,
      false // Don't require exact period
    );
    
    if (epsDiluted) {
      console.log('✅ EPS Diluted found:');
      console.log(`   Value: ${epsDiluted.value}`);
      console.log(`   Unit: ${epsDiluted.unit}`);
      console.log(`   Period End: ${epsDiluted.periodEnd}`);
      console.log(`   Period Type: ${epsDiluted.periodType}`);
    } else {
      console.log('❌ EPS Diluted not found in XBRL data');
    }
  } catch (error) {
    console.error('Error extracting EPS Diluted:', error);
  }
  
  // Check if EPS metrics exist in database but were filtered out
  console.log('\n\nChecking database for EPS metrics...');
  const { data: epsInDb } = await supabase
    .from('financial_metrics')
    .select('*')
    .eq('company_id', companyId)
    .in('metric_type', ['eps_basic', 'eps_diluted'])
    .order('period_end_date', { ascending: false })
    .limit(5);
  
  if (epsInDb && epsInDb.length > 0) {
    console.log(`Found ${epsInDb.length} EPS metrics in database:`);
    epsInDb.forEach(m => {
      console.log(`  - ${m.metric_type} (${m.period_type}): ${m.value} ${m.unit}`);
      console.log(`    Period: ${m.period_end_date}, Ingested: ${m.ingested_at || m.created_at}`);
    });
  } else {
    console.log('No EPS metrics found in database');
  }
}

main().catch(console.error);
