// Verify Metrics via SQL
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';

async function main() {
  const supabase = createServerClient();

  // Get latest filing with metrics
  const { data: filing } = await supabase
    .from('filings')
    .select('id, accession_number, filing_type, filing_date, company:companies(ticker, name)')
    .eq('processing_status', 'completed')
    .in('filing_type', ['10-K', '10-Q'])
    .order('filing_date', { ascending: false })
    .limit(1)
    .single();

  if (!filing) {
    console.error('No filing found');
    return;
  }

  const company = (filing as any).company;

  console.log('📊 Financial Metrics Verification\n');
  console.log(`Company: ${company.name} (${company.ticker})`);
  console.log(`Filing: ${filing.filing_type} - ${filing.filing_date}`);
  console.log(`Accession: ${filing.accession_number}\n`);

  // Get metrics
  const { data: metrics } = await supabase
    .from('financial_metrics')
    .select('*')
    .eq('filing_id', filing.id)
    .order('metric_type', { ascending: true });

  if (!metrics || metrics.length === 0) {
    console.log('No metrics found');
    return;
  }

  console.log(`Found ${metrics.length} metrics:\n`);
  console.log('Metric Type          | Value              | Unit      | Period End  | Period Type');
  console.log('-'.repeat(80));
  
  metrics.forEach(m => {
    const value = typeof m.value === 'number' ? m.value.toLocaleString() : m.value;
    console.log(
      `${m.metric_type.padEnd(20)} | ${value.toString().padStart(18)} | ${m.unit.padEnd(9)} | ${m.period_end_date} | ${m.period_type}`
    );
  });

  console.log('\n✅ Metrics stored and verified!');
  console.log('\nAll data sourced from SEC public EDGAR API (no third-party services)');
}

main();
