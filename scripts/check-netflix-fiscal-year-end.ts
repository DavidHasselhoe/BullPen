// Check Netflix fiscal year end
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';

async function main() {
  const supabase = createServerClient();
  
  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('ticker', 'NFLX')
    .single();
  
  if (!company) {
    console.log('❌ Netflix not found');
    return;
  }
  
  console.log('📊 Netflix Company Record:\n');
  console.log(`   Ticker: ${company.ticker}`);
  console.log(`   Name: ${company.name}`);
  console.log(`   CIK: ${company.cik}`);
  console.log(`   Fiscal Year End: ${company.fiscal_year_end || 'NULL'}`);
  console.log(`   Fiscal Year End Month: ${company.fiscal_year_end_month || 'NULL'}`);
  console.log(`   Fiscal Year End Day: ${company.fiscal_year_end_day || 'NULL'}\n`);
  
  // Netflix's fiscal year end is December 31 (12-31)
  // Let's check if we need to set it
  if (!company.fiscal_year_end && !company.fiscal_year_end_month) {
    console.log('⚠️  Fiscal year end is missing. Netflix\'s fiscal year end is December 31 (12-31).\n');
    console.log('Updating company record...\n');
    
    const { error: updateError } = await supabase
      .from('companies')
      .update({
        fiscal_year_end: '12-31',
        fiscal_year_end_month: 12,
        fiscal_year_end_day: 31,
      })
      .eq('id', company.id);
    
    if (updateError) {
      console.log('❌ Error updating:', updateError.message);
    } else {
      console.log('✅ Successfully updated fiscal year end to 12-31\n');
    }
  } else {
    console.log('✅ Fiscal year end is already set\n');
  }
}

main().catch(console.error);
