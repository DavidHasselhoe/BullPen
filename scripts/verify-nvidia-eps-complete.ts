// Verify NVIDIA EPS metrics are correctly stored
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';

async function main() {
  const companyId = '1b09229f-48c1-4427-9d42-ccc27a7d9237'; // NVIDIA
  
  console.log('🔍 Verifying NVIDIA EPS metrics\n');
  
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
  
  // Check quarterly EPS
  console.log('📊 Quarterly EPS Metrics:\n');
  const { data: quarterlyEPS } = await supabase
    .from('financial_metrics')
    .select('*, filings(filing_type, accession_number, period_end_date)')
    .eq('company_id', companyId)
    .in('metric_type', ['eps_basic', 'eps_diluted'])
    .eq('period_type', 'quarterly')
    .order('period_end_date', { ascending: false })
    .limit(10);
  
  if (quarterlyEPS && quarterlyEPS.length > 0) {
    console.log(`Found ${quarterlyEPS.length} quarterly EPS metrics:\n`);
    quarterlyEPS.forEach(m => {
      const filing = m.filings as any;
      console.log(`  ✅ ${m.metric_type}: ${m.value} ${m.unit}`);
      console.log(`     Period: ${m.period_end_date} (Q${m.fiscal_quarter} FY${m.fiscal_year})`);
      console.log(`     Filing: ${filing?.filing_type} - ${filing?.accession_number}`);
      console.log(`     Split Adjusted: ${m.split_adjusted}`);
      console.log(`     Period Type: ${m.period_type}`);
      console.log('');
    });
  } else {
    console.log('⚠️  No quarterly EPS metrics found\n');
  }
  
  // Check annual EPS
  console.log('📊 Annual EPS Metrics:\n');
  const { data: annualEPS } = await supabase
    .from('financial_metrics')
    .select('*, filings(filing_type, accession_number, period_end_date)')
    .eq('company_id', companyId)
    .in('metric_type', ['eps_basic', 'eps_diluted'])
    .eq('period_type', 'annual')
    .order('period_end_date', { ascending: false })
    .limit(5);
  
  if (annualEPS && annualEPS.length > 0) {
    console.log(`Found ${annualEPS.length} annual EPS metrics:\n`);
    annualEPS.forEach(m => {
      const filing = m.filings as any;
      console.log(`  ✅ ${m.metric_type}: ${m.value} ${m.unit}`);
      console.log(`     Period: ${m.period_end_date} (FY${m.fiscal_year})`);
      console.log(`     Filing: ${filing?.filing_type} - ${filing?.accession_number}`);
      console.log(`     Split Adjusted: ${m.split_adjusted}`);
      console.log(`     Period Type: ${m.period_type}`);
      console.log(`     Fiscal Quarter: ${m.fiscal_quarter} (should be NULL)`);
      console.log('');
    });
  } else {
    console.log('⚠️  No annual EPS metrics found\n');
  }
  
  // Verify data integrity
  console.log('🔍 Data Integrity Checks:\n');
  
  // Check for quarterly EPS with NULL fiscal_quarter
  const { count: nullQuarterCount } = await supabase
    .from('financial_metrics')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .in('metric_type', ['eps_basic', 'eps_diluted'])
    .eq('period_type', 'quarterly')
    .is('fiscal_quarter', null);
  
  if (nullQuarterCount && nullQuarterCount > 0) {
    console.log(`❌ Found ${nullQuarterCount} quarterly EPS with NULL fiscal_quarter (violates constraint)\n`);
  } else {
    console.log('✅ All quarterly EPS have fiscal_quarter IS NOT NULL\n');
  }
  
  // Check for annual EPS with non-NULL fiscal_quarter
  const { count: nonNullAnnualCount } = await supabase
    .from('financial_metrics')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .in('metric_type', ['eps_basic', 'eps_diluted'])
    .eq('period_type', 'annual')
    .not('fiscal_quarter', 'is', null);
  
  if (nonNullAnnualCount && nonNullAnnualCount > 0) {
    console.log(`❌ Found ${nonNullAnnualCount} annual EPS with non-NULL fiscal_quarter (violates constraint)\n`);
  } else {
    console.log('✅ All annual EPS have fiscal_quarter = NULL\n');
  }
  
  // Check for quarterly EPS > 2.5 with split_adjusted = false
  const { count: invalidQuarterlyCount } = await supabase
    .from('financial_metrics')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .in('metric_type', ['eps_basic', 'eps_diluted'])
    .eq('period_type', 'quarterly')
    .gt('value', 2.5)
    .eq('split_adjusted', false);
  
  if (invalidQuarterlyCount && invalidQuarterlyCount > 0) {
    console.log(`❌ Found ${invalidQuarterlyCount} quarterly EPS > 2.5 with split_adjusted = false (violates constraint)\n`);
  } else {
    console.log('✅ All quarterly EPS > 2.5 have split_adjusted = true\n');
  }
  
  // Summary
  console.log('='.repeat(60));
  console.log('\n📋 SUMMARY:\n');
  console.log(`Quarterly EPS metrics: ${quarterlyEPS?.length || 0}`);
  console.log(`Annual EPS metrics: ${annualEPS?.length || 0}`);
  console.log(`Data integrity: ${nullQuarterCount === 0 && nonNullAnnualCount === 0 && invalidQuarterlyCount === 0 ? '✅ PASSED' : '❌ FAILED'}\n`);
}

main().catch(console.error);
