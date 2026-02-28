// Check NVIDIA ingestion status
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';

async function main() {
  const supabase = createServerClient();

  const { data: company } = await supabase
    .from('companies')
    .select('id, name, ticker')
    .eq('ticker', 'NVDA')
    .single();

  if (!company) {
    console.log('❌ NVIDIA not found');
    return;
  }

  console.log(`\n📊 Status for ${company.name} (${company.ticker})\n`);

  const { data: filings } = await supabase
    .from('filings')
    .select('id, filing_type, period_end_date, filing_date, accession_number')
    .eq('company_id', company.id)
    .order('period_end_date', { ascending: false })
    .limit(10);

  console.log(`📄 Filings: ${filings?.length || 0}\n`);
  
  if (filings && filings.length > 0) {
    filings.forEach((f, i) => {
      console.log(`   ${i + 1}. ${f.filing_type} - ${f.period_end_date} (${f.accession_number})`);
    });
  }

  const { data: metrics } = await supabase
    .from('financial_metrics')
    .select('metric_type, period_type, count')
    .eq('company_id', company.id);

  console.log(`\n📊 Metrics: ${metrics?.length || 0}\n`);

  const { data: index } = await supabase
    .from('company_index')
    .select('has_data, last_ingested_at')
    .eq('ticker', 'NVDA')
    .single();

  if (index) {
    console.log(`📋 Company Index:`);
    console.log(`   has_data: ${index.has_data}`);
    console.log(`   last_ingested_at: ${index.last_ingested_at || 'null'}\n`);
  }
}

main().catch(console.error);
