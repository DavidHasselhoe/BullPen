// Test metrics extraction for NVIDIA's latest 10-Q
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';
import { extractMetricsForFiling } from '../lib/metrics/metrics-orchestrator';

async function main() {
  const supabase = createServerClient();

  // Get NVIDIA's latest 10-Q
  const { data: company } = await supabase
    .from('companies')
    .select('id, name, ticker')
    .eq('ticker', 'NVDA')
    .single();

  if (!company) {
    console.log('❌ NVIDIA not found');
    return;
  }

  const { data: filing } = await supabase
    .from('filings')
    .select('id, filing_type, period_end_date, accession_number')
    .eq('company_id', company.id)
    .eq('filing_type', '10-Q')
    .order('period_end_date', { ascending: false })
    .limit(1)
    .single();

  if (!filing) {
    console.log('❌ No 10-Q filing found');
    return;
  }

  console.log(`\n🧪 Testing metrics extraction for:`);
  console.log(`   Filing: ${filing.filing_type} - ${filing.period_end_date}`);
  console.log(`   Accession: ${filing.accession_number}\n`);

  const onProgress = (step: string, details?: any) => {
    console.log(`📋 ${step}`);
    if (details && Object.keys(details).length > 0) {
      console.log(`   ${JSON.stringify(details, null, 2)}`);
    }
  };

  const result = await extractMetricsForFiling(filing.id, {
    onProgress,
  });

  console.log(`\n✅ Extraction complete:`);
  console.log(`   Success: ${result.success}`);
  console.log(`   Metrics extracted: ${result.metricsExtracted || 0}`);
  if (result.errors && result.errors.length > 0) {
    console.log(`   Errors: ${result.errors.length}`);
    result.errors.forEach((e, i) => {
      console.log(`      ${i + 1}. ${e}`);
    });
  }

  // Check what was stored
  const { data: storedMetrics } = await supabase
    .from('financial_metrics')
    .select('metric_type, period_type, value, unit')
    .eq('filing_id', filing.id);

  console.log(`\n📊 Stored metrics: ${storedMetrics?.length || 0}`);
  if (storedMetrics && storedMetrics.length > 0) {
    storedMetrics.forEach((m, i) => {
      console.log(`   ${i + 1}. ${m.metric_type} (${m.period_type}): ${m.value} ${m.unit}`);
    });
  }
}

main().catch(console.error);
