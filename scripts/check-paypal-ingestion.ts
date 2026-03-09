/**
 * Check PayPal (PYPL) ingestion status
 * Run: npx tsx scripts/check-paypal-ingestion.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';

const TICKER = 'PYPL';

async function main() {
  const supabase = createServerClient();

  console.log(`\n📊 PayPal (${TICKER}) Ingestion Status\n`);
  console.log('='.repeat(60));

  // 1. Company record
  const { data: company, error: companyErr } = await supabase
    .from('companies')
    .select('id, ticker, name, cik, sic_code, fiscal_year_end, logo_url, created_at')
    .eq('ticker', TICKER)
    .single();

  if (companyErr || !company) {
    console.log('\n❌ Company not found. PayPal may not have been ingested yet.');
    process.exit(1);
  }

  console.log('\n✅ Company:');
  console.log(`   ID: ${company.id}`);
  console.log(`   Name: ${company.name}`);
  console.log(`   CIK: ${company.cik}`);
  console.log(`   Fiscal year end: ${company.fiscal_year_end || 'N/A'}`);
  console.log(`   Logo: ${company.logo_url ? 'Yes' : 'No'}`);

  // 2. Filings summary
  const { data: filings, error: filingsErr } = await supabase
    .from('filings')
    .select('id, filing_type, accession_number, filing_date, period_end_date, fiscal_year, fiscal_quarter, processing_status, items')
    .eq('company_id', company.id)
    .order('filing_date', { ascending: false });

  if (!filingsErr && filings && filings.length > 0) {
    const byType = filings.reduce((acc: Record<string, number>, f) => {
      acc[f.filing_type] = (acc[f.filing_type] || 0) + 1;
      return acc;
    }, {});

    console.log('\n📁 Filings:');
    console.log(`   Total: ${filings.length}`);
    Object.entries(byType).forEach(([type, count]) => {
      console.log(`   - ${type}: ${count}`);
    });

    console.log('\n   Recent filings (newest 15):');
    filings.slice(0, 15).forEach((f, i) => {
      const items = Array.isArray(f.items) ? f.items.join(', ') : '-';
      console.log(`   ${i + 1}. ${f.filing_type} | ${f.filing_date} | ${f.accession_number}`);
      if (f.filing_type === '8-K' && items) console.log(`      Items: ${items}`);
      if (f.period_end_date) console.log(`      Period: ${f.period_end_date}`);
    });
  } else {
    console.log('\n⚠️ No filings found');
  }

  // 3. Financial metrics
  const { data: metricsData, error: metricsErr } = await supabase
    .from('financial_metrics')
    .select('metric_type, period_type')
    .eq('company_id', company.id);

  if (!metricsErr && metricsData && metricsData.length > 0) {
    const metricCounts: Record<string, number> = {};
    metricsData.forEach((m: { metric_type: string; period_type: string }) => {
      const key = `${m.metric_type} (${m.period_type})`;
      metricCounts[key] = (metricCounts[key] || 0) + 1;
    });

    console.log('\n📈 Financial Metrics:');
    console.log(`   Total: ${metricsData.length}`);
    Object.entries(metricCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .forEach(([k, v]) => console.log(`   - ${k}: ${v}`));
  } else {
    console.log('\n⚠️ No financial metrics (or error)');
  }

  // 4. Corporate events (from 8-K)
  const { data: events, error: eventsErr } = await supabase
    .from('corporate_events')
    .select('id, event_type, event_date, title, filing_id')
    .eq('company_id', company.id)
    .order('event_date', { ascending: false })
    .limit(20);

  if (!eventsErr && events && events.length > 0) {
    console.log('\n📋 Corporate Events (8-K):');
    console.log(`   Total (recent): ${events.length}`);
    events.slice(0, 10).forEach((e, i) => {
      console.log(`   ${i + 1}. ${e.event_type} | ${e.event_date} | ${e.title?.substring(0, 50)}...`);
    });
  } else {
    console.log('\n⚠️ No corporate events');
  }

  // 5. Stock splits
  const { data: splits, error: splitsErr } = await supabase
    .from('stock_splits')
    .select('split_ratio, effective_date, source')
    .eq('company_id', company.id);

  if (!splitsErr && splits && splits.length > 0) {
    console.log('\n📊 Stock Splits:');
    splits.forEach((s) => console.log(`   - ${s.split_ratio} | ${s.effective_date} | ${s.source}`));
  } else {
    console.log('\n⚠️ No stock splits');
  }

  // 6. Filing sections (for AI analysis)
  const filingIds = (filings || []).map((f) => f.id).filter(Boolean);
  let sectionsCount = 0;
  if (filingIds.length > 0) {
    const { count } = await supabase
      .from('filing_sections')
      .select('*', { count: 'exact', head: true })
      .in('filing_id', filingIds);
    sectionsCount = count ?? 0;
  }

  console.log('\n📄 Filing Sections (AI analysis):');
  console.log(`   Total: ${sectionsCount}`);

  // 7. Document embeddings
  const { count: embeddingsCount } = await supabase
    .from('sec_document_embeddings')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', company.id);

  console.log('\n🔍 Document Embeddings (RAG):');
  console.log(`   Total: ${embeddingsCount || 0}`);

  // 8. Signals
  let signalsCount = 0;
  if (filingIds.length > 0) {
    const { count } = await supabase
      .from('signals')
      .select('*', { count: 'exact', head: true })
      .in('filing_id', filingIds);
    signalsCount = count ?? 0;
  }

  console.log('\n📌 Signals:');
  console.log(`   Total: ${signalsCount}`);

  // 9. Expected vs actual - what might be missing
  console.log('\n' + '='.repeat(60));
  console.log('\n🔎 Summary / Potential Gaps:\n');

  const has10K = (filings || []).some((f) => f.filing_type === '10-K');
  const has10Q = (filings || []).some((f) => f.filing_type === '10-Q');
  const has8K = (filings || []).some((f) => f.filing_type === '8-K');
  const { count: metricsTotalCount } = await supabase
    .from('financial_metrics')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', company.id);

  if (!has10K) console.log('   ⚠️ No 10-K filings');
  else console.log('   ✅ 10-K present');
  if (!has10Q) console.log('   ⚠️ No 10-Q filings');
  else console.log('   ✅ 10-Q present');
  if (!has8K) console.log('   ⚠️ No 8-K filings');
  else console.log('   ✅ 8-K present');
  if ((metricsTotalCount ?? 0) < 10) console.log(`   ⚠️ Few metrics (${metricsTotalCount}) - XBRL extraction may have issues`);
  else console.log(`   ✅ Metrics: ${metricsTotalCount}`);
  if ((sectionsCount ?? 0) === 0) console.log('   ⚠️ No filing sections - narrative AI analysis may not have run');
  else console.log(`   ✅ Filing sections: ${sectionsCount}`);
  if ((embeddingsCount ?? 0) === 0) console.log('   ⚠️ No embeddings - RAG search may not work');
  else console.log(`   ✅ Embeddings: ${embeddingsCount}`);

  console.log('\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
