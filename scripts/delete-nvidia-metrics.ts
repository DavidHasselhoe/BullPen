// Delete all financial metrics for NVIDIA
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';

async function main() {
  const companyId = '1b09229f-48c1-4427-9d42-ccc27a7d9237'; // NVIDIA
  
  console.log('🗑️  Deleting all financial metrics for NVIDIA\n');
  
  const supabase = createServerClient();
  
  // Get company info
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
  
  // Count existing metrics
  const { count: beforeCount } = await supabase
    .from('financial_metrics')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId);
  
  console.log(`Found ${beforeCount || 0} existing metrics\n`);
  
  // Delete all metrics for NVIDIA
  console.log('Deleting all financial metrics...\n');
  const { error, count } = await supabase
    .from('financial_metrics')
    .delete()
    .eq('company_id', companyId)
    .select('*', { count: 'exact', head: false });
  
  if (error) {
    console.error('❌ Error deleting metrics:', error);
    return;
  }
  
  // Verify deletion
  const { count: afterCount } = await supabase
    .from('financial_metrics')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId);
  
  console.log(`✅ Deleted ${beforeCount || 0} metrics`);
  console.log(`   Remaining: ${afterCount || 0} metrics\n`);
  
  if (afterCount === 0) {
    console.log('✅ All metrics deleted successfully!\n');
  } else {
    console.log('⚠️  Some metrics may still exist\n');
  }
}

main().catch(console.error);
