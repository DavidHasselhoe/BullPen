import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '@/lib/supabase/client';

async function checkIntelStatus() {
  const supabase = createServerClient();

  console.log('🔍 Checking Intel (INTC) status...\n');

  // Check company record
  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('*')
    .eq('ticker', 'INTC')
    .single();

  if (companyError) {
    console.error('❌ Error fetching company:', companyError.message);
    return;
  }

  if (!company) {
    console.log('❌ Intel (INTC) not found in companies table');
    return;
  }

  console.log('✅ Company found:');
  console.log(`   ID: ${company.id}`);
  console.log(`   Name: ${company.name}`);
  console.log(`   CIK: ${company.cik}`);
  console.log(`   Fiscal Year End: ${company.fiscal_year_end || 'NOT SET'}`);
  console.log(`   Has Data: ${company.has_data || false}\n`);

  // Check company_index
  const { data: index, error: indexError } = await supabase
    .from('company_index')
    .select('*')
    .eq('ticker', 'INTC')
    .single();

  if (indexError && indexError.code !== 'PGRST116') {
    console.error('❌ Error fetching company_index:', indexError.message);
  } else if (index) {
    console.log('✅ Company Index:');
    console.log(`   Has Data: ${index.has_data || false}`);
    console.log(`   Last Updated: ${index.updated_at || 'N/A'}\n`);
  } else {
    console.log('⚠️  Company Index not found\n');
  }

  // Check filings
  const { data: filings, error: filingsError } = await supabase
    .from('filings')
    .select('id, filing_type, filing_date, period_end_date, processing_status, fiscal_year, fiscal_quarter')
    .eq('company_id', company.id)
    .order('filing_date', { ascending: false })
    .limit(10);

  if (filingsError) {
    console.error('❌ Error fetching filings:', filingsError.message);
  } else {
    console.log(`📄 Filings (${filings?.length || 0} found):`);
    if (!filings || filings.length === 0) {
      console.log('   ⚠️  No filings found');
    } else {
      filings.forEach((filing) => {
        console.log(`   - ${filing.filing_type} | ${filing.filing_date} | Status: ${filing.processing_status}`);
        if (filing.period_end_date) {
          console.log(`     Period End: ${filing.period_end_date} | FY: ${filing.fiscal_year || 'N/A'} | Q: ${filing.fiscal_quarter || 'N/A'}`);
        }
      });
    }
    console.log();
  }

  // Check metrics
  const { data: metrics, error: metricsError } = await supabase
    .from('financial_metrics')
    .select('metric_type, period_type, value, fiscal_year, fiscal_quarter, period_end_date')
    .eq('company_id', company.id)
    .order('period_end_date', { ascending: false })
    .limit(20);

  if (metricsError) {
    console.error('❌ Error fetching metrics:', metricsError.message);
  } else {
    console.log(`📊 Financial Metrics (${metrics?.length || 0} found):`);
    if (!metrics || metrics.length === 0) {
      console.log('   ⚠️  No metrics found');
    } else {
      const grouped = new Map<string, any[]>();
      metrics.forEach((m) => {
        const key = `${m.metric_type}_${m.period_type}`;
        if (!grouped.has(key)) {
          grouped.set(key, []);
        }
        grouped.get(key)!.push(m);
      });

      grouped.forEach((values, key) => {
        const [metricType, periodType] = key.split('_');
        console.log(`   ${metricType} (${periodType}):`);
        values.slice(0, 3).forEach((m) => {
          console.log(`     - ${m.value} | FY${m.fiscal_year || 'N/A'} Q${m.fiscal_quarter || 'N/A'} | ${m.period_end_date || 'N/A'}`);
        });
        if (values.length > 3) {
          console.log(`     ... and ${values.length - 3} more`);
        }
      });
    }
    console.log();
  }

  // Summary
  console.log('📋 Summary:');
  console.log(`   Company exists: ✅`);
  console.log(`   Has data flag: ${company.has_data ? '✅' : '❌'}`);
  console.log(`   Filings: ${filings?.length || 0}`);
  console.log(`   Metrics: ${metrics?.length || 0}`);
  console.log(`   Fiscal Year End: ${company.fiscal_year_end || '❌ NOT SET'}`);
}

checkIntelStatus().catch(console.error);
