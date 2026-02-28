// Check what data the chart query returns for diluted EPS
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';
import { FISCAL_REFACTOR_RELEASE_DATE } from '../lib/metrics/ingestion-constants';

async function main() {
  const supabase = createServerClient();
  const companyId = '1b09229f-48c1-4427-9d42-ccc27a7d9237';
  
  // Query exactly as metrics-ui.ts does
  const { data, error } = await supabase
    .from('financial_metrics')
    .select('period_end_date, value, unit, filing_id, fiscal_year, fiscal_quarter, accounting_basis, split_adjusted, period_type, ingested_at')
    .eq('company_id', companyId)
    .eq('metric_type', 'eps_diluted')
    .eq('period_type', 'quarterly')
    .eq('split_adjusted', true)
    .gte('ingested_at', FISCAL_REFACTOR_RELEASE_DATE.toISOString())
    .order('period_end_date', { ascending: true });
  
  console.log('📊 Chart Query Results (eps_diluted, quarterly, split_adjusted=true):\n');
  console.log(`FISCAL_REFACTOR_RELEASE_DATE: ${FISCAL_REFACTOR_RELEASE_DATE.toISOString()}\n`);
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  if (!data || data.length === 0) {
    console.log('⚠️  No metrics found matching chart query criteria\n');
    
    // Check what metrics exist without the ingested_at filter
    const { data: allData } = await supabase
      .from('financial_metrics')
      .select('period_end_date, value, fiscal_year, fiscal_quarter, split_adjusted, ingested_at')
      .eq('company_id', companyId)
      .eq('metric_type', 'eps_diluted')
      .eq('period_type', 'quarterly')
      .order('period_end_date', { ascending: true });
    
    console.log(`Total quarterly diluted EPS metrics (without ingested_at filter): ${allData?.length || 0}\n`);
    allData?.forEach(m => {
      const q = m.fiscal_quarter ? `Q${m.fiscal_quarter}` : 'Q?';
      const fy = m.fiscal_year ? `FY${m.fiscal_year}` : 'FY?';
      const ingested = m.ingested_at ? new Date(m.ingested_at) : null;
      const afterRelease = ingested && ingested >= FISCAL_REFACTOR_RELEASE_DATE;
      console.log(`  ${m.period_end_date}: ${m.value} (${q} ${fy}, split_adjusted: ${m.split_adjusted}, ingested: ${ingested?.toISOString() || 'N/A'}, ${afterRelease ? '✅' : '❌'})`);
    });
    return;
  }
  
  console.log(`Found ${data.length} metrics:\n`);
  data.forEach((m, i) => {
    const q = m.fiscal_quarter ? `Q${m.fiscal_quarter}` : 'Q?';
    const fy = m.fiscal_year ? `FY${m.fiscal_year}` : 'FY?';
    console.log(`${i + 1}. ${m.period_end_date}: ${m.value} (${q} ${fy})`);
  });
  
  // Check for the latest quarter
  const latest = data[data.length - 1];
  if (latest) {
    console.log(`\n📌 Latest quarter:`);
    console.log(`   Date: ${latest.period_end_date}`);
    console.log(`   Value: ${latest.value}`);
    console.log(`   Fiscal Year: ${latest.fiscal_year || 'NULL'}`);
    console.log(`   Fiscal Quarter: ${latest.fiscal_quarter || 'NULL'}`);
    
    if (latest.value === 0.76) {
      console.log(`\n⚠️  WARNING: Latest value is 0.76, expected ~1.30`);
    }
  }
}

main().catch(console.error);
