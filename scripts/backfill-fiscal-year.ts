// Backfill fiscal_year for quarterly metrics that have NULL fiscal_year
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';
import { calculateFiscalYear } from '../lib/metrics/fiscal-calendar';

async function main() {
  const supabase = createServerClient();
  
  console.log('🔄 Backfilling fiscal_year for quarterly metrics...\n');
  
  // Get all quarterly metrics with NULL fiscal_year
  const { data: metrics, error: fetchError } = await supabase
    .from('financial_metrics')
    .select('id, period_end_date, company_id, fiscal_year, fiscal_quarter, period_type')
    .eq('period_type', 'quarterly')
    .is('fiscal_year', null)
    .limit(100);
  
  if (fetchError) {
    console.error('Error fetching metrics:', fetchError);
    return;
  }
  
  if (!metrics || metrics.length === 0) {
    console.log('✅ No metrics need fiscal_year backfill.\n');
    return;
  }
  
  console.log(`Found ${metrics.length} metrics with NULL fiscal_year\n`);
  
  let updated = 0;
  let errors = 0;
  
  for (const metric of metrics) {
    try {
      // Get company fiscal year end
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .select('fiscal_year_end_month, fiscal_year_end_day, fiscal_year_end')
        .eq('id', metric.company_id)
        .single();
      
      if (companyError || !company) {
        console.log(`⚠️  Could not find company for metric ${metric.id}`);
        errors++;
        continue;
      }
      
      let fiscalYearEnd: { month: number; day: number } | null = null;
      
      // Try fiscal_year_end_month/day first
      if (company.fiscal_year_end_month && company.fiscal_year_end_day) {
        fiscalYearEnd = {
          month: company.fiscal_year_end_month,
          day: company.fiscal_year_end_day,
        };
      } else if (company.fiscal_year_end) {
        // Parse from MM-DD string format
        const [monthStr, dayStr] = company.fiscal_year_end.split('-');
        const month = parseInt(monthStr, 10);
        const day = parseInt(dayStr, 10);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          fiscalYearEnd = { month, day };
        }
      }
      
      if (!fiscalYearEnd) {
        console.log(`⚠️  Could not determine fiscal year end for company ${metric.company_id}`);
        errors++;
        continue;
      }
      
      // Calculate fiscal year from period_end_date
      const periodEndDate = new Date(metric.period_end_date);
      const fiscalYear = calculateFiscalYear(periodEndDate, fiscalYearEnd);
      
      // Update the metric
      const { error: updateError } = await supabase
        .from('financial_metrics')
        .update({ fiscal_year: fiscalYear })
        .eq('id', metric.id);
      
      if (updateError) {
        console.log(`❌ Error updating metric ${metric.id}:`, updateError.message);
        errors++;
      } else {
        updated++;
        console.log(`✅ Updated ${metric.id}: ${metric.period_end_date} → FY${fiscalYear}`);
      }
    } catch (error) {
      console.log(`❌ Error processing metric ${metric.id}:`, error);
      errors++;
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Errors: ${errors}`);
  console.log(`   Total: ${metrics.length}\n`);
}

main().catch(console.error);
