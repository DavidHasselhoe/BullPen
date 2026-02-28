// Quick reset and re-ingest NVIDIA with updated pipeline
// Usage: tsx scripts/reset-nvidia-quick.ts

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';
import { lazyIngestCompany } from '../lib/search/lazy-ingestion';
import { hardResetCompany } from '../lib/metrics/hard-reset';

const TICKER = 'NVDA';

async function main() {
  console.log(`🔄 Resetting and re-ingesting ${TICKER} with updated canonical pipeline\n`);

  const supabase = createServerClient();

  // Step 1: Find company (create via first-time ingest if needed)
  console.log('📊 Step 1: Finding company...');
  let { data: company, error: companyError } = await supabase
    .from('companies')
    .select('id, name, ticker')
    .eq('ticker', TICKER)
    .single();

  if (companyError || !company) {
    // Company not in DB - create from company_index (requires bootstrap or prior search)
    console.log(`   Company not in database. Creating from company_index...`);
    const { data: indexRow, error: indexError } = await supabase
      .from('company_index')
      .select('ticker, name, cik')
      .eq('ticker', TICKER)
      .single();

    if (indexError || !indexRow) {
      console.error(`❌ ${TICKER} not in company_index. Run: npm run bootstrap-company-index`);
      process.exit(1);
    }

    const { data: newCompany, error: insertError } = await supabase
      .from('companies')
      .insert({
        ticker: indexRow.ticker.toUpperCase(),
        name: indexRow.name,
        cik: indexRow.cik,
        sector: null,
        industry: null,
        description: null,
        metadata: {},
      })
      .select('id, name, ticker')
      .single();

    if (insertError || !newCompany) {
      console.error(`❌ Failed to create company: ${insertError?.message || 'Unknown'}`);
      process.exit(1);
    }
    company = newCompany;
    console.log(`   ✅ Created: ${company.name} (${company.ticker})\n`);
  }

  console.log(`✅ Found: ${company.name} (${company.ticker})`);
  console.log(`   Company ID: ${company.id}\n`);

  // Step 2: Delete all data using hard reset
  console.log('🗑️  Step 2: Deleting all existing data...');
  
  const resetResult = await hardResetCompany(company.id);
  
  if (!resetResult.success) {
    console.error(`❌ Error deleting data: ${resetResult.error}`);
    process.exit(1);
  }

  console.log(`✅ Deleted ${resetResult.deletedFilings || 0} filings and ${resetResult.deletedMetrics || 0} metrics\n`);

  // Step 3: Reset company_index flag
  console.log('📊 Step 3: Resetting company index flag...');
  const { error: indexError } = await supabase
    .from('company_index')
    .update({ has_data: false, last_ingested_at: null })
    .eq('ticker', TICKER);

  if (indexError) {
    console.warn(`⚠️  Warning resetting index: ${indexError.message}`);
  } else {
    console.log('✅ Reset company_index.has_data = false\n');
  }

  // Step 4: Re-ingest with updated pipeline
  console.log('🔄 Step 4: Re-ingesting with canonical filing-first pipeline...\n');
  console.log('='.repeat(70));
  console.log('Updated features:');
  console.log('  - Canonical filing-first pipeline');
  console.log('  - AI table extraction with fallback');
  console.log('  - Zero-trust validation');
  console.log('  - Full provenance tracking');
  console.log('='.repeat(70) + '\n');

  const onProgress = (step: string, _details?: any) => {
    const pct = step.match(/\((\d+)%\)/)?.[1] ?? '';
    const short = step.replace(/\s*\(\d+%\)$/, '').trim();
    // Only log key milestones - suppress verbose table/column logs
    if (short.includes('Looking up') || short.includes('Downloading') || short.includes('Processing') || 
        short.includes('Analyzing') || short.includes('Generating') || short.includes('Ingested')) {
      console.log(`  ${pct ? `[${pct}%]` : '•'} ${short}`);
    } else if (short.includes('error') || short.includes('failed')) {
      console.log(`  ⚠ ${short}`);
    } else if (short.includes('Tables found') && pct) {
      process.stdout.write(`  [${pct}%] Extracting metrics...\r`);
    }
  };

  const result = await lazyIngestCompany(TICKER, undefined, onProgress);

  if (!result.success) {
    console.error(`\n❌ Re-ingestion failed: ${result.error}`);
    process.exit(1);
  }

  console.log('\n' + '='.repeat(70));
  console.log('✅ Re-ingestion complete!');
  console.log(`   Filings ingested: ${result.filingsIngested || 0}`);
  console.log(`   Company ID: ${result.companyId}\n`);

  // Step 5: Verify metrics extraction
  console.log('📊 Step 5: Verifying metrics...\n');
  
  const { data: allMetrics } = await supabase
    .from('financial_metrics')
    .select('metric_type, period_type, period_end_date, fiscal_year, fiscal_quarter, value, unit')
    .eq('company_id', company.id)
    .order('metric_type')
    .order('period_end_date', { ascending: false });

  if (!allMetrics || allMetrics.length === 0) {
    console.log('⚠️  No metrics found in database.\n');
  } else {
    const byType = allMetrics.reduce((acc: Record<string, number>, m) => {
      acc[m.metric_type] = (acc[m.metric_type] || 0) + 1;
      return acc;
    }, {});
    
    console.log(`Found ${allMetrics.length} metrics total:\n`);
    console.log('   By metric type:');
    Object.entries(byType).sort().forEach(([type, count]) => {
      console.log(`     - ${type}: ${count}`);
    });
    
    const quarterly = allMetrics.filter(m => m.period_type === 'quarterly');
    if (quarterly.length > 0) {
      console.log(`\n   Sample (latest quarterly):`);
      const seen = new Set<string>();
      quarterly.slice(0, 6).forEach((m) => {
        const key = `${m.metric_type}-${m.period_end_date}`;
        if (seen.has(key)) return;
        seen.add(key);
        const period = m.fiscal_quarter ? `Q${m.fiscal_quarter} FY${m.fiscal_year}` : m.period_end_date;
        const val = Number(m.value) >= 1e9 ? `${(Number(m.value)/1e9).toFixed(2)}B` : 
          Number(m.value) >= 1e6 ? `${(Number(m.value)/1e6).toFixed(1)}M` : m.value;
        console.log(`     ${m.metric_type}: ${val} ${m.unit} (${period})`);
      });
    }
    console.log('');
  }

  console.log('='.repeat(70));
  console.log('✅ Test complete!\n');
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
