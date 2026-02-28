// Check if metrics exist for a company
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';
import { FISCAL_REFACTOR_RELEASE_DATE } from '../lib/metrics/ingestion-constants';

async function main() {
  const companyId = process.argv[2] || '1b09229f-48c1-4427-9d42-ccc27a7d9237';
  
  console.log(`Checking metrics for company: ${companyId}\n`);
  
  const supabase = createServerClient();
  
  // Check all metrics (without the date filter)
  const { data: allMetrics, error: allError } = await supabase
    .from('financial_metrics')
    .select('metric_type, period_type, value, unit, period_end_date, ingested_at, created_at')
    .eq('company_id', companyId)
    .order('period_end_date', { ascending: false });
  
  if (allError) {
    console.error('Error:', allError);
    return;
  }
  
  console.log(`Total metrics in database: ${allMetrics?.length || 0}\n`);
  
  if (allMetrics && allMetrics.length > 0) {
    console.log('All metrics (unfiltered):');
    const grouped = allMetrics.reduce((acc: any, m: any) => {
      const key = `${m.metric_type}_${m.period_type}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(m);
      return acc;
    }, {});
    
    Object.entries(grouped).forEach(([key, metrics]: [string, any]) => {
      console.log(`\n${key}: ${metrics.length} records`);
      metrics.slice(0, 3).forEach((m: any) => {
        console.log(`  - ${m.period_end_date}: ${m.value} ${m.unit}`);
        console.log(`    ingested_at: ${m.ingested_at || m.created_at}`);
      });
    });
  }
  
  // Check filtered metrics (with FISCAL_REFACTOR_RELEASE_DATE)
  console.log(`\n\nFiltered by ingested_at >= ${FISCAL_REFACTOR_RELEASE_DATE.toISOString()}:`);
  const { data: filteredMetrics, error: filteredError } = await supabase
    .from('financial_metrics')
    .select('metric_type, period_type, value, unit, period_end_date, ingested_at')
    .eq('company_id', companyId)
    .gte('ingested_at', FISCAL_REFACTOR_RELEASE_DATE.toISOString())
    .order('period_end_date', { ascending: false });
  
  if (filteredError) {
    console.error('Error:', filteredError);
    return;
  }
  
  console.log(`Filtered metrics: ${filteredMetrics?.length || 0}\n`);
  
  // Check specific metrics
  const metricsToCheck = ['eps_basic', 'eps_diluted', 'free_cash_flow'];
  
  for (const metricType of metricsToCheck) {
    for (const periodType of ['annual', 'quarterly']) {
      const { count, error } = await supabase
        .from('financial_metrics')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('metric_type', metricType)
        .eq('period_type', periodType)
        .gte('ingested_at', FISCAL_REFACTOR_RELEASE_DATE.toISOString());
      
      console.log(`${metricType} (${periodType}): ${count || 0} records`);
      
      if (count === 0) {
        // Check without date filter
        const { count: totalCount } = await supabase
          .from('financial_metrics')
          .select('*', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('metric_type', metricType)
          .eq('period_type', periodType);
        
        if (totalCount && totalCount > 0) {
          console.log(`  ⚠ Found ${totalCount} records but they're filtered out by FISCAL_REFACTOR_RELEASE_DATE`);
        }
      }
    }
  }
}

main().catch(console.error);
