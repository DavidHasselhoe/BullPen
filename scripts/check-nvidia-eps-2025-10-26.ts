// Check if EPS for NVIDIA 2025-10-26 is stored
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';

async function main() {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('financial_metrics')
    .select('*')
    .eq('company_id', '1b09229f-48c1-4427-9d42-ccc27a7d9237')
    .in('metric_type', ['eps_basic', 'eps_diluted'])
    .eq('period_end_date', '2025-10-26');
  
  console.log('EPS metrics for 2025-10-26:');
  if (data && data.length > 0) {
    data.forEach(m => {
      console.log(`  ✅ ${m.metric_type}: ${m.value} ${m.unit}`);
      console.log(`     Period Type: ${m.period_type}`);
      console.log(`     Split Adjusted: ${m.split_adjusted}`);
      console.log(`     Fiscal Quarter: ${m.fiscal_quarter}`);
      console.log(`     Ingested: ${m.ingested_at || m.created_at}`);
    });
  } else {
    console.log('  ❌ No EPS metrics found for 2025-10-26');
  }
}

main().catch(console.error);
