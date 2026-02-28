import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '@/lib/supabase/client';

async function fixIntelFiscalYear() {
  const supabase = createServerClient();

  console.log('🔧 Fixing Intel (INTC) fiscal year end...\n');

  // Intel's fiscal year ends on December 31st (12-31)
  const fiscalYearEnd = '12-31';

  const { data, error } = await supabase
    .from('companies')
    .update({
      fiscal_year_end: fiscalYearEnd,
      fiscal_year_end_month: 12,
      fiscal_year_end_day: 31,
    })
    .eq('ticker', 'INTC')
    .select();

  if (error) {
    console.error('❌ Error updating fiscal year end:', error.message);
    return;
  }

  if (!data || data.length === 0) {
    console.log('❌ Intel (INTC) not found in companies table');
    return;
  }

  console.log('✅ Updated Intel fiscal year end to:', fiscalYearEnd);
  console.log(`   Company: ${data[0].name}`);
  console.log(`   Ticker: ${data[0].ticker}`);
  console.log('\n💡 You may need to re-run metrics extraction for Intel filings.');
}

fixIntelFiscalYear().catch(console.error);
