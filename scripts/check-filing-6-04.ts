// Check the filing that produced the 6.04 EPS value
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';

async function main() {
  const filingId = 'd3417a28-9522-4615-8cb1-e435dd557f20';
  
  console.log('🔍 Checking filing that produced 6.04 EPS...\n');
  
  const supabase = createServerClient();
  
  // Get filing details
  const { data: filing } = await supabase
    .from('filings')
    .select('*')
    .eq('id', filingId)
    .single();
  
  if (!filing) {
    console.error('❌ Filing not found');
    return;
  }
  
  console.log('Filing Details:');
  console.log(`  Filing Type: ${filing.filing_type}`);
  console.log(`  Accession Number: ${filing.accession_number}`);
  console.log(`  Filing Date: ${filing.filing_date}`);
  console.log(`  Period End Date: ${filing.period_end_date}`);
  console.log(`  Period Type: ${filing.period_type || 'null'}`);
  console.log(`  Fiscal Year: ${filing.fiscal_year || 'null'}`);
  console.log(`  Fiscal Quarter: ${filing.fiscal_quarter || 'null'}`);
  console.log('');
  
  // Get all metrics for this filing
  const { data: metrics } = await supabase
    .from('financial_metrics')
    .select('*')
    .eq('filing_id', filingId)
    .in('metric_type', ['eps_basic', 'eps_diluted'])
    .order('period_end_date', { ascending: false });
  
  if (metrics && metrics.length > 0) {
    console.log(`Found ${metrics.length} EPS metrics:\n`);
    metrics.forEach(m => {
      console.log(`  ${m.metric_type}:`);
      console.log(`    Value: ${m.value}`);
      console.log(`    Period Type: ${m.period_type}`);
      console.log(`    Period End: ${m.period_end_date}`);
      console.log(`    Fiscal Year: ${m.fiscal_year}`);
      console.log(`    Fiscal Quarter: ${m.fiscal_quarter}`);
      console.log(`    Split Adjusted: ${m.split_adjusted}`);
      console.log('');
    });
  } else {
    console.log('No EPS metrics found for this filing');
  }
  
  // Check if there's a 10-K for FY2024
  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('id', filing.company_id)
    .single();
  
  if (company) {
    console.log(`\nChecking for FY2024 10-K for ${company.name} (${company.ticker})...\n`);
    
    const { data: annualFilings } = await supabase
      .from('filings')
      .select('*')
      .eq('company_id', filing.company_id)
      .eq('filing_type', '10-K')
      .eq('fiscal_year', 2024)
      .order('filing_date', { ascending: false });
    
    if (annualFilings && annualFilings.length > 0) {
      console.log(`Found ${annualFilings.length} FY2024 10-K filing(s):\n`);
      for (const f of annualFilings) {
        console.log(`  ${f.filing_type} - ${f.accession_number}`);
        console.log(`    Filing Date: ${f.filing_date}`);
        console.log(`    Period End: ${f.period_end_date}`);
        console.log(`    Period Type: ${f.period_type || 'null'}`);
        
        // Get EPS metrics for this 10-K
        const { data: annualMetrics } = await supabase
          .from('financial_metrics')
          .select('*')
          .eq('filing_id', f.id)
          .in('metric_type', ['eps_basic', 'eps_diluted']);
        
        if (annualMetrics && annualMetrics.length > 0) {
          console.log(`    EPS Metrics: ${annualMetrics.length}`);
          annualMetrics.forEach((m: any) => {
            console.log(`      ${m.metric_type}: ${m.value} (${m.period_type}, Q${m.fiscal_quarter || 'null'})`);
          });
        } else {
          console.log(`    ⚠️  No EPS metrics found for this 10-K`);
        }
        console.log('');
      }
    } else {
      console.log('⚠️  No FY2024 10-K filing found');
    }
  }
}

main().catch(console.error);
