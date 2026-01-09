// Verify Free Cash Flow calculation metadata
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';

async function main() {
  const filingId = process.argv[2];
  
  if (!filingId) {
    console.error('Usage: npx tsx scripts/verify-fcf-metadata.ts <FILING_ID>');
    process.exit(1);
  }

  const supabase = createServerClient();

  const { data: metrics } = await supabase
    .from('financial_metrics')
    .select('*')
    .eq('filing_id', filingId)
    .order('metric_type');

  if (!metrics || metrics.length === 0) {
    console.log('No metrics found');
    return;
  }

  console.log(`Found ${metrics.length} metrics:\n`);

  metrics.forEach(m => {
    const value = typeof m.value === 'number' ? m.value.toLocaleString() : String(m.value);
    console.log(`${m.metric_type}: ${value} ${m.unit} (${m.period_end_date})`);
    
    if (m.metadata && typeof m.metadata === 'object') {
      const meta = m.metadata as any;
      if (meta.calculation_method) {
        console.log(`  → Method: ${meta.calculation_method}`);
        if (meta.formula) console.log(`  → Formula: ${meta.formula}`);
        if (meta.sources) {
          console.log(`  → Sources:`);
          Object.entries(meta.sources).forEach(([key, val]) => {
            console.log(`    - ${key}: ${typeof val === 'number' ? val.toLocaleString() : val}`);
          });
        }
      }
    }
    console.log('');
  });
}

main();
