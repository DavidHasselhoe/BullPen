import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';

async function checkMetrics() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('financial_metrics')
    .select('*')
    .eq('company_id', '1b09229f-48c1-4427-9d42-ccc27a7d9237')
    .limit(10);
  
  console.log('Metrics found:', data?.length || 0);
  if (data && data.length > 0) {
    console.log('\nSample metrics:');
    data.forEach(m => {
      console.log(`  - ${m.metric_type}: ${m.value} ${m.unit} (${m.period_type}, FY${m.fiscal_year}${m.fiscal_quarter ? ` Q${m.fiscal_quarter}` : ''})`);
    });
  }
  if (error) {
    console.error('Error:', error);
  }
}

checkMetrics().catch(console.error);
