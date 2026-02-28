// Debug Free Cash Flow extraction
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';
import { getMetricForFiling } from '../lib/metrics/xbrl-fetcher';

async function main() {
  const companyId = process.argv[2] || '1b09229f-48c1-4427-9d42-ccc27a7d9237';
  
  console.log(`🔍 Debugging Free Cash Flow extraction for company: ${companyId}\n`);
  
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
  
  // Check what metrics exist in database for this filing
  console.log('📊 Checking metrics in database for this filing...\n');
  const { data: metricsInDb } = await supabase
    .from('financial_metrics')
    .select('*')
    .eq('filing_id', filing.id)
    .order('metric_type', { ascending: true });
  
  if (metricsInDb && metricsInDb.length > 0) {
    console.log(`Found ${metricsInDb.length} metrics in database:`);
    metricsInDb.forEach(m => {
      console.log(`  - ${m.metric_type} (${m.period_type}): ${m.value} ${m.unit}`);
    });
  } else {
    console.log('⚠️  No metrics found in database for this filing');
  }
  
  // Check specifically for operating_cash_flow
  console.log('\n\n🔍 Checking Operating Cash Flow extraction...\n');
  try {
    const operatingCashFlow = await getMetricForFiling(
      company.cik,
      'operating_cash_flow',
      filing.period_end_date || filing.filing_date,
      filing.filing_type as '10-Q',
      filing.accession_number,
      false // Don't require exact period
    );
    
    if (operatingCashFlow) {
      console.log('✅ Operating Cash Flow found in XBRL:');
      console.log(`   Value: ${operatingCashFlow.value}`);
      console.log(`   Unit: ${operatingCashFlow.unit}`);
      console.log(`   Period End: ${operatingCashFlow.periodEnd}`);
      console.log(`   Period Type: ${operatingCashFlow.periodType}`);
    } else {
      console.log('❌ Operating Cash Flow NOT found in XBRL data');
    }
  } catch (error) {
    console.error('❌ Error extracting Operating Cash Flow:', error);
  }
  
  // Check for capital_expenditures
  console.log('\n\n🔍 Checking Capital Expenditures extraction...\n');
  try {
    const capitalExpenditures = await getMetricForFiling(
      company.cik,
      'capital_expenditures',
      filing.period_end_date || filing.filing_date,
      filing.filing_type as '10-Q',
      filing.accession_number,
      true // Require exact period for CapEx
    );
    
    if (capitalExpenditures) {
      console.log('✅ Capital Expenditures found in XBRL:');
      console.log(`   Value: ${capitalExpenditures.value}`);
      console.log(`   Unit: ${capitalExpenditures.unit}`);
      console.log(`   Period End: ${capitalExpenditures.periodEnd}`);
      console.log(`   Period Type: ${capitalExpenditures.periodType}`);
    } else {
      console.log('❌ Capital Expenditures NOT found in XBRL data');
      console.log('   This is why FCF cannot be calculated (needs: operating_cash_flow - capital_expenditures)');
    }
  } catch (error) {
    console.error('❌ Error extracting Capital Expenditures:', error);
  }
  
  // Try to find pre-calculated FCF in XBRL
  console.log('\n\n🔍 Checking for pre-calculated Free Cash Flow in XBRL...\n');
  try {
    const preCalculatedFCF = await getMetricForFiling(
      company.cik,
      'free_cash_flow',
      filing.period_end_date || filing.filing_date,
      filing.filing_type as '10-Q',
      filing.accession_number,
      true
    );
    
    if (preCalculatedFCF) {
      console.log('✅ Pre-calculated Free Cash Flow found in XBRL:');
      console.log(`   Value: ${preCalculatedFCF.value}`);
      console.log(`   Unit: ${preCalculatedFCF.unit}`);
      console.log(`   Period End: ${preCalculatedFCF.periodEnd}`);
      console.log(`   Period Type: ${preCalculatedFCF.periodType}`);
    } else {
      console.log('❌ Pre-calculated Free Cash Flow NOT found in XBRL');
      console.log('   FCF must be calculated from operating_cash_flow - capital_expenditures');
    }
  } catch (error) {
    console.error('❌ Error checking for pre-calculated FCF:', error);
  }
  
  // Check what FCF metrics exist in database
  console.log('\n\n📊 Checking Free Cash Flow metrics in database...\n');
  const { data: fcfInDb } = await supabase
    .from('financial_metrics')
    .select('*')
    .eq('company_id', companyId)
    .eq('metric_type', 'free_cash_flow')
    .order('period_end_date', { ascending: false })
    .limit(5);
  
  if (fcfInDb && fcfInDb.length > 0) {
    console.log(`Found ${fcfInDb.length} FCF metrics in database:`);
    fcfInDb.forEach(m => {
      console.log(`  - ${m.period_end_date} (${m.period_type}): ${m.value} ${m.unit}`);
      console.log(`    Ingested: ${m.ingested_at || m.created_at}`);
    });
  } else {
    console.log('❌ No Free Cash Flow metrics found in database');
  }
  
  // Summary
  console.log('\n\n📋 SUMMARY:\n');
  const { data: ocfInDb } = await supabase
    .from('financial_metrics')
    .select('*')
    .eq('company_id', companyId)
    .eq('metric_type', 'operating_cash_flow')
    .eq('filing_id', filing.id)
    .limit(1)
    .single();
  
  const { data: capexInDb } = await supabase
    .from('financial_metrics')
    .select('*')
    .eq('company_id', companyId)
    .eq('metric_type', 'capital_expenditures')
    .eq('filing_id', filing.id)
    .limit(1)
    .single();
  
  console.log(`Operating Cash Flow in DB: ${ocfInDb ? '✅' : '❌'}`);
  console.log(`Capital Expenditures in DB: ${capexInDb ? '✅' : '❌'}`);
  console.log(`Free Cash Flow in DB: ${fcfInDb && fcfInDb.length > 0 ? '✅' : '❌'}`);
  
  if (ocfInDb && capexInDb) {
    const calculatedFCF = ocfInDb.value - capexInDb.value;
    console.log(`\n💡 Calculated FCF: ${ocfInDb.value} - ${capexInDb.value} = ${calculatedFCF}`);
    console.log(`   This should have been calculated during ingestion`);
  } else {
    if (!ocfInDb) {
      console.log(`\n⚠️  Missing: Operating Cash Flow in database`);
    }
    if (!capexInDb) {
      console.log(`\n⚠️  Missing: Capital Expenditures in database`);
      console.log(`   This is likely why FCF is not being calculated`);
    }
  }
}

main().catch(console.error);
