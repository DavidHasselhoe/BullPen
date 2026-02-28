// Check if eps_diluted already exists for 2025-10-26
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';

async function main() {
  const companyId = '1b09229f-48c1-4427-9d42-ccc27a7d9237'; // NVIDIA
  const filingId = '0c4a2118-a1db-473e-9111-19349426fea0'; // 10-Q for 2025-10-26
  
  console.log('🔍 Checking eps_diluted for NVIDIA 2025-10-26\n');
  
  const supabase = createServerClient();
  
  // Check all eps_diluted for this period
  const { data: existingDiluted, error } = await supabase
    .from('financial_metrics')
    .select('*')
    .eq('company_id', companyId)
    .eq('metric_type', 'eps_diluted')
    .eq('period_end_date', '2025-10-26');
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  if (existingDiluted && existingDiluted.length > 0) {
    console.log(`Found ${existingDiluted.length} existing eps_diluted entries for 2025-10-26:\n`);
    existingDiluted.forEach(m => {
      console.log(`  ${m.metric_type}: ${m.value} ${m.unit}`);
      console.log(`    Period Type: ${m.period_type}`);
      console.log(`    Fiscal Year: ${m.fiscal_year}, Quarter: ${m.fiscal_quarter}`);
      console.log(`    Split Adjusted: ${m.split_adjusted}`);
      console.log(`    Filing ID: ${m.filing_id}`);
      console.log(`    Ingested: ${m.ingested_at || m.created_at}`);
      console.log('');
    });
  } else {
    console.log('❌ No existing eps_diluted found for 2025-10-26\n');
    console.log('This means the unique constraint is preventing insertion.\n');
    console.log('Checking the unique constraint...\n');
    
    // Check what EPS metrics exist for this fiscal period
    const { data: allEPSForPeriod } = await supabase
      .from('financial_metrics')
      .select('*')
      .eq('company_id', companyId)
      .in('metric_type', ['eps_basic', 'eps_diluted'])
      .eq('fiscal_year', 2025)
      .eq('fiscal_quarter', 4)
      .eq('accounting_basis', 'gaap');
    
    if (allEPSForPeriod && allEPSForPeriod.length > 0) {
      console.log(`Found ${allEPSForPeriod.length} EPS metrics for Q4 FY2025:\n`);
      allEPSForPeriod.forEach(m => {
        console.log(`  ${m.metric_type}: ${m.value} ${m.unit}`);
        console.log(`    Period End: ${m.period_end_date}`);
        console.log(`    Filing ID: ${m.filing_id}`);
        console.log('');
      });
    }
  }
}

main().catch(console.error);
