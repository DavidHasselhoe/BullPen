// Quick script to check NVIDIA quarterly EPS metrics
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';

async function main() {
  const supabase = createServerClient();
  
  const { data: metrics } = await supabase
    .from('financial_metrics')
    .select('metric_type, period_type, period_end_date, fiscal_year, fiscal_quarter, value, unit, metadata')
    .eq('company_id', '1b09229f-48c1-4427-9d42-ccc27a7d9237')
    .in('metric_type', ['eps_basic', 'eps_diluted'])
    .order('period_end_date', { ascending: false })
    .limit(20);
  
  console.log('📊 NVIDIA EPS Metrics:\n');
  
  if (!metrics || metrics.length === 0) {
    console.log('⚠️  No EPS metrics found.\n');
    return;
  }
  
  const quarterly = metrics.filter(m => m.period_type === 'quarterly');
  const annual = metrics.filter(m => m.period_type === 'annual');
  const ytd = metrics.filter(m => m.period_type === 'ytd');
  const ttm = metrics.filter(m => m.period_type === 'ttm');
  
  console.log(`Total EPS metrics: ${metrics.length}`);
  console.log(`  Quarterly: ${quarterly.length}`);
  console.log(`  Annual: ${annual.length}`);
  console.log(`  YTD: ${ytd.length}`);
  console.log(`  TTM: ${ttm.length}\n`);
  
  if (quarterly.length > 0) {
    console.log('✅ Quarterly EPS Metrics:\n');
    quarterly.forEach((m, i) => {
      const q = m.fiscal_quarter ? `Q${m.fiscal_quarter} FY${m.fiscal_year}` : 'N/A';
      const src = (m.metadata as any)?.source || 'unknown';
      console.log(`  ${i + 1}. ${m.metric_type}: ${m.value} ${m.unit}`);
      console.log(`     Period: ${q} (${m.period_end_date})`);
      console.log(`     Source: ${src}`);
      
      // Check for Q3 2026
      if (m.fiscal_quarter === 3 && m.fiscal_year === 2026 && m.metric_type === 'eps_diluted') {
        const expectedValue = 1.30;
        const diff = Math.abs(parseFloat(m.value.toString()) - expectedValue);
        if (diff < 0.15) {
          console.log(`     ✅ Value ${m.value} matches expected ~${expectedValue}`);
        } else {
          console.log(`     ⚠️  Value ${m.value} differs from expected ~${expectedValue} (diff: ${diff.toFixed(2)})`);
        }
      }
      console.log('');
    });
  } else {
    console.log('⚠️  No quarterly EPS metrics found.\n');
  }
  
  if (annual.length > 0) {
    console.log('📅 Annual EPS Metrics:\n');
    annual.slice(0, 3).forEach((m, i) => {
      console.log(`  ${i + 1}. ${m.metric_type}: ${m.value} ${m.unit} (FY${m.fiscal_year}, ${m.period_end_date})`);
    });
    console.log('');
  }
}

main().catch(console.error);
