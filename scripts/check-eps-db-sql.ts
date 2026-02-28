// Check EPS metrics in database using SQL
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';

async function main() {
  const companyId = '1b09229f-48c1-4427-9d42-ccc27a7d9237'; // NVIDIA
  
  console.log('🔍 Checking EPS metrics in database using SQL queries\n');
  
  const supabase = createServerClient();
  
  // Query 1: Check all EPS metrics for NVIDIA
  console.log('Query 1: All EPS metrics for NVIDIA\n');
  const { data: allEPS, error: error1 } = await supabase.rpc('exec_sql', {
    query: `
      SELECT 
        metric_type,
        period_type,
        value,
        unit,
        period_end_date,
        fiscal_year,
        fiscal_quarter,
        split_adjusted,
        ingested_at,
        filing_id
      FROM financial_metrics
      WHERE company_id = '${companyId}'
        AND metric_type IN ('eps_basic', 'eps_diluted')
      ORDER BY period_end_date DESC
      LIMIT 10;
    `
  });
  
  if (error1) {
    // If RPC doesn't exist, use regular query
    console.log('RPC not available, using regular query...\n');
    const { data: regular, error: regularError } = await supabase
      .from('financial_metrics')
      .select('metric_type, period_type, value, unit, period_end_date, fiscal_year, fiscal_quarter, split_adjusted, ingested_at, filing_id')
      .eq('company_id', companyId)
      .in('metric_type', ['eps_basic', 'eps_diluted'])
      .order('period_end_date', { ascending: false })
      .limit(10);
    
    if (regularError) {
      console.error('Error:', regularError);
      return;
    }
    
    if (regular && regular.length > 0) {
      console.log(`Found ${regular.length} EPS metrics:\n`);
      regular.forEach(m => {
        console.log(`  ${m.metric_type} (${m.period_type}): ${m.value} ${m.unit}`);
        console.log(`    Period: ${m.period_end_date}, FY${m.fiscal_year}, Q${m.fiscal_quarter}`);
        console.log(`    Split Adjusted: ${m.split_adjusted}`);
        console.log(`    Filing ID: ${m.filing_id}`);
        console.log('');
      });
    }
  } else if (allEPS) {
    console.log('Query results:', allEPS);
  }
  
  // Query 2: Check specifically for 2025-10-26
  console.log('\nQuery 2: EPS metrics for period_end_date = 2025-10-26\n');
  const { data: specific2025, error: error2 } = await supabase
    .from('financial_metrics')
    .select('*')
    .eq('company_id', companyId)
    .in('metric_type', ['eps_basic', 'eps_diluted'])
    .eq('period_end_date', '2025-10-26');
  
  if (error2) {
    console.error('Error:', error2);
  } else if (specific2025 && specific2025.length > 0) {
    console.log(`Found ${specific2025.length} EPS metrics for 2025-10-26:\n`);
    specific2025.forEach(m => {
      console.log(`  ✅ ${m.metric_type}: ${m.value} ${m.unit}`);
      console.log(`     Period Type: ${m.period_type}`);
      console.log(`     Fiscal Year: ${m.fiscal_year}, Quarter: ${m.fiscal_quarter}`);
      console.log(`     Split Adjusted: ${m.split_adjusted}`);
      console.log(`     Filing ID: ${m.filing_id}`);
      console.log('');
    });
  } else {
    console.log('❌ No EPS metrics found for 2025-10-26\n');
  }
  
  // Query 3: Check for recent filings
  console.log('Query 3: Recent filings for NVIDIA\n');
  const { data: filings, error: error3 } = await supabase
    .from('filings')
    .select('id, filing_type, accession_number, period_end_date, filing_date')
    .eq('company_id', companyId)
    .eq('filing_type', '10-Q')
    .order('filing_date', { ascending: false })
    .limit(5);
  
  if (error3) {
    console.error('Error:', error3);
  } else if (filings && filings.length > 0) {
    console.log(`Found ${filings.length} recent 10-Q filings:\n`);
    filings.forEach(f => {
      console.log(`  Filing: ${f.filing_type} - ${f.accession_number}`);
      console.log(`    Period End: ${f.period_end_date}`);
      console.log(`    Filing Date: ${f.filing_date}`);
      console.log(`    Filing ID: ${f.id}`);
      console.log('');
    });
  }
  
  // Query 4: Check if there are any metrics for the most recent filing
  if (filings && filings.length > 0) {
    const mostRecentFiling = filings[0];
    console.log(`Query 4: All metrics for filing ${mostRecentFiling.accession_number}\n`);
    const { data: filingMetrics, error: error4 } = await supabase
      .from('financial_metrics')
      .select('*')
      .eq('filing_id', mostRecentFiling.id)
      .order('metric_type', { ascending: true });
    
    if (error4) {
      console.error('Error:', error4);
    } else if (filingMetrics && filingMetrics.length > 0) {
      console.log(`Found ${filingMetrics.length} metrics for this filing:\n`);
      filingMetrics.forEach(m => {
        const isEPS = m.metric_type === 'eps_basic' || m.metric_type === 'eps_diluted';
        const marker = isEPS ? '⭐' : '  ';
        console.log(`${marker} ${m.metric_type} (${m.period_type}): ${m.value} ${m.unit}`);
        if (isEPS) {
          console.log(`     Period End: ${m.period_end_date}`);
          console.log(`     Fiscal Year: ${m.fiscal_year}, Quarter: ${m.fiscal_quarter}`);
          console.log(`     Split Adjusted: ${m.split_adjusted}`);
        }
        console.log('');
      });
    } else {
      console.log('⚠️  No metrics found for this filing\n');
    }
  }
}

main().catch(console.error);
