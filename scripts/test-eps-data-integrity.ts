// Regression Test: EPS Data Integrity
// Ensures annual EPS from 10-K filings is never stored as quarterly EPS
// This test should fail if the bug ever reappears

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';

async function main() {
  console.log('🧪 Running EPS Data Integrity Regression Test\n');
  
  const supabase = createServerClient();
  const errors: string[] = [];
  
  // Test 1: No quarterly EPS with value > 2.5 and split_adjusted = false
  console.log('Test 1: Checking for invalid quarterly EPS (value > 2.5, split_adjusted = false)...');
  const { data: invalidQuarterlyEPS, error: error1 } = await supabase
    .from('financial_metrics')
    .select('*')
    .in('metric_type', ['eps_basic', 'eps_diluted'])
    .eq('period_type', 'quarterly')
    .gt('value', 2.5)
    .eq('split_adjusted', false);
  
  if (error1) {
    errors.push(`Error querying invalid quarterly EPS: ${error1.message}`);
  } else if (invalidQuarterlyEPS && invalidQuarterlyEPS.length > 0) {
    errors.push(`❌ Found ${invalidQuarterlyEPS.length} invalid quarterly EPS rows:`);
    invalidQuarterlyEPS.slice(0, 5).forEach(m => {
      errors.push(`   - ${m.metric_type}: ${m.value} ${m.unit} @ ${m.period_end_date} (filing_id: ${m.filing_id})`);
    });
  } else {
    console.log('✅ No invalid quarterly EPS found (value > 2.5, split_adjusted = false)\n');
  }
  
  // Test 2: Annual EPS must have fiscal_quarter = NULL
  console.log('Test 2: Checking annual EPS has fiscal_quarter = NULL...');
  const { data: annualEPSWithQuarter, error: error2 } = await supabase
    .from('financial_metrics')
    .select('*')
    .in('metric_type', ['eps_basic', 'eps_diluted'])
    .eq('period_type', 'annual')
    .not('fiscal_quarter', 'is', null);
  
  if (error2) {
    errors.push(`Error querying annual EPS: ${error2.message}`);
  } else if (annualEPSWithQuarter && annualEPSWithQuarter.length > 0) {
    errors.push(`❌ Found ${annualEPSWithQuarter.length} annual EPS rows with non-NULL fiscal_quarter:`);
    annualEPSWithQuarter.slice(0, 5).forEach(m => {
      errors.push(`   - ${m.metric_type}: ${m.value} ${m.unit} @ ${m.period_end_date}, fiscal_quarter: ${m.fiscal_quarter}`);
    });
  } else {
    console.log('✅ All annual EPS have fiscal_quarter = NULL\n');
  }
  
  // Test 3: Quarterly EPS must have fiscal_quarter IS NOT NULL
  console.log('Test 3: Checking quarterly EPS has fiscal_quarter IS NOT NULL...');
  const { data: quarterlyEPSWithoutQuarter, error: error3 } = await supabase
    .from('financial_metrics')
    .select('*')
    .in('metric_type', ['eps_basic', 'eps_diluted'])
    .eq('period_type', 'quarterly')
    .is('fiscal_quarter', null);
  
  if (error3) {
    errors.push(`Error querying quarterly EPS: ${error3.message}`);
  } else if (quarterlyEPSWithoutQuarter && quarterlyEPSWithoutQuarter.length > 0) {
    errors.push(`❌ Found ${quarterlyEPSWithoutQuarter.length} quarterly EPS rows with NULL fiscal_quarter:`);
    quarterlyEPSWithoutQuarter.slice(0, 5).forEach(m => {
      errors.push(`   - ${m.metric_type}: ${m.value} ${m.unit} @ ${m.period_end_date}`);
    });
  } else {
    console.log('✅ All quarterly EPS have fiscal_quarter IS NOT NULL\n');
  }
  
  // Test 4: Quarterly EPS with value > 2.5 must be split_adjusted = true
  console.log('Test 4: Checking quarterly EPS with value > 2.5 are split_adjusted...');
  const { data: highQuarterlyEPSNotSplitAdjusted, error: error4 } = await supabase
    .from('financial_metrics')
    .select('*')
    .in('metric_type', ['eps_basic', 'eps_diluted'])
    .eq('period_type', 'quarterly')
    .gt('value', 2.5)
    .eq('split_adjusted', false);
  
  if (error4) {
    errors.push(`Error querying high quarterly EPS: ${error4.message}`);
  } else if (highQuarterlyEPSNotSplitAdjusted && highQuarterlyEPSNotSplitAdjusted.length > 0) {
    errors.push(`❌ Found ${highQuarterlyEPSNotSplitAdjusted.length} quarterly EPS rows with value > 2.5 and split_adjusted = false:`);
    highQuarterlyEPSNotSplitAdjusted.slice(0, 5).forEach(m => {
      errors.push(`   - ${m.metric_type}: ${m.value} ${m.unit} @ ${m.period_end_date}`);
    });
  } else {
    console.log('✅ All quarterly EPS with value > 2.5 are split_adjusted\n');
  }
  
  // Summary
  console.log('='.repeat(60));
  if (errors.length > 0) {
    console.log('\n❌ REGRESSION TEST FAILED\n');
    errors.forEach(error => console.log(error));
    console.log('\nThese violations indicate the annual EPS as quarterly bug has reappeared.');
    process.exit(1);
  } else {
    console.log('\n✅ ALL TESTS PASSED\n');
    console.log('EPS data integrity is maintained:');
    console.log('  - No quarterly EPS > 2.5 with split_adjusted = false');
    console.log('  - Annual EPS have fiscal_quarter = NULL');
    console.log('  - Quarterly EPS have fiscal_quarter IS NOT NULL');
    console.log('  - Quarterly EPS > 2.5 are split_adjusted = true');
    process.exit(0);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
