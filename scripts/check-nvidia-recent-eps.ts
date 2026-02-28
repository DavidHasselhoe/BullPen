// Check NVIDIA's recent EPS metrics
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';

async function main() {
  const supabase = createServerClient();
  
  // Get all EPS metrics ordered by date
  const { data } = await supabase
    .from('financial_metrics')
    .select('*, filings(filing_type, accession_number, period_end_date, filing_date)')
    .eq('company_id', '1b09229f-48c1-4427-9d42-ccc27a7d9237')
    .in('metric_type', ['eps_basic', 'eps_diluted'])
    .order('period_end_date', { ascending: false })
    .limit(10);
  
  console.log('Recent EPS metrics for NVIDIA:\n');
  if (data && data.length > 0) {
    data.forEach(m => {
      const filing = m.filings as any;
      console.log(`  ${m.metric_type} (${m.period_type}): ${m.value} ${m.unit}`);
      console.log(`    Period End: ${m.period_end_date}`);
      console.log(`    Filing: ${filing?.filing_type} - ${filing?.accession_number}`);
      console.log(`    Filing Period End: ${filing?.period_end_date}`);
      console.log(`    Split Adjusted: ${m.split_adjusted}`);
      console.log(`    Fiscal Quarter: ${m.fiscal_quarter}`);
      console.log('');
    });
  } else {
    console.log('  No EPS metrics found');
  }
  
  // Check for 2025-10-26 specifically
  const { data: specific } = await supabase
    .from('financial_metrics')
    .select('*')
    .eq('company_id', '1b09229f-48c1-4427-9d42-ccc27a7d9237')
    .in('metric_type', ['eps_basic', 'eps_diluted'])
    .eq('period_end_date', '2025-10-26');
  
  console.log('\nEPS metrics specifically for 2025-10-26:');
  if (specific && specific.length > 0) {
    specific.forEach(m => {
      console.log(`  ✅ ${m.metric_type}: ${m.value} ${m.unit}`);
    });
  } else {
    console.log('  ❌ None found');
  }
}

main().catch(console.error);
