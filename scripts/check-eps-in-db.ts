// Quick check for EPS metrics in database
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
    .order('period_end_date', { ascending: false });
  
  console.log('✅ EPS metrics in database:');
  if (data && data.length > 0) {
    data.forEach(m => {
      console.log(`  - ${m.metric_type}: ${m.value} ${m.unit} @ ${m.period_end_date}`);
    });
  } else {
    console.log('  No EPS metrics found');
  }
}

main().catch(console.error);
