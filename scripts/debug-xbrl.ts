// Debug XBRL Extraction
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';
import { fetchConceptFromSEC, extractMetricForPeriod } from '../lib/metrics/xbrl-fetcher';

async function main() {
  const supabase = createServerClient();

  // Get latest Apple filing
  const { data: filing } = await supabase
    .from('filings')
    .select('*, company:companies(*)')
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
  const periodEndDate = filing.period_end_date || filing.filing_date;

  console.log('Testing XBRL extraction:');
  console.log(`Company: ${company.name} (CIK: ${company.cik})`);
  console.log(`Filing: ${filing.filing_type} - ${filing.filing_date}`);
  console.log(`Period End: ${periodEndDate}`);
  console.log(`Accession: ${filing.accession_number}\n`);

  // Test revenue concept
  console.log('Testing "Revenues" concept...\n');
  console.log(`URL would be: https://data.sec.gov/api/xbrl/companyconcept/CIK${parseInt(company.cik, 10).toString().padStart(10, '0')}/Revenues.json\n`);
  
  try {
    const conceptData = await fetchConceptFromSEC(company.cik, 'Revenues');

    if (!conceptData) {
      console.log('❌ Concept data not found (returned null)');
      console.log('\nTrying alternative concept names...');
      
      // Try alternatives
      const alternatives = ['RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet'];
      for (const alt of alternatives) {
        console.log(`\nTrying "${alt}"...`);
        const altData = await fetchConceptFromSEC(company.cik, alt);
        if (altData) {
          console.log(`✅ Found with "${alt}"`);
          // Use this for testing
          const metric = extractMetricForPeriod(altData, periodEndDate, filing.filing_type as '10-K' | '10-Q');
          if (metric) {
            console.log(`\n✅ Metric extracted: ${metric.value} ${metric.unit}`);
          }
          return;
        }
      }
      return;
    }

    console.log('✅ Concept data retrieved');
    console.log(`Tag: ${conceptData.tag}`);
    console.log(`Label: ${conceptData.label}`);
    console.log(`Units available: ${Object.keys(conceptData.units || {}).join(', ')}\n`);

    // Show sample data
    const unitKey = Object.keys(conceptData.units || {})[0];
    if (unitKey) {
      const units = conceptData.units[unitKey];
      console.log(`Sample entries (first 5 of ${units.length}):`);
      units.slice(0, 5).forEach((u: any, i: number) => {
        console.log(`  ${i + 1}. Value: ${u.val}, End: ${u.end || u.instant}, Form: ${u.form}, FP: ${u.fp}`);
      });
      console.log('');

      // Try to extract for our period
      console.log(`Attempting to extract for period: ${periodEndDate}`);
      const metric = extractMetricForPeriod(conceptData, periodEndDate, filing.filing_type as '10-K' | '10-Q');
      
      if (metric) {
        console.log('✅ Extraction successful!');
        console.log(`Value: ${metric.value} ${metric.unit}`);
        console.log(`Period End: ${metric.periodEnd}`);
        console.log(`Period Type: ${metric.periodType}`);
      } else {
      console.log('❌ Extraction failed - no matching period found');
      console.log(`\nLooking for period: ${periodEndDate}`);
      console.log(`Filing type: ${filing.filing_type}\n`);
      
      // Show all periods, sorted by date
      const allPeriods = units
        .filter((u: any) => (u.form === filing.filing_type))
        .map((u: any) => ({
          end: u.end || u.instant,
          form: u.form,
          fp: u.fp,
          val: u.val,
          filed: u.filed,
        }))
        .sort((a: any, b: any) => b.end.localeCompare(a.end));
      
      console.log(`All ${filing.filing_type} periods (${allPeriods.length}, showing most recent 15):`);
      allPeriods.slice(0, 15).forEach((p: any) => {
        const match = p.end === periodEndDate ? ' ← LOOKING FOR THIS' : '';
        console.log(`  - ${p.end} (Value: ${p.val}, Filed: ${p.filed})${match}`);
      });
      
      // Try to find closest match
      const closest = allPeriods.find((p: any) => 
        p.end.startsWith(periodEndDate.substring(0, 7)) // Same year-month
      );
      
      if (closest) {
        console.log(`\n⚠️  Closest match: ${closest.end} (off by date)`);
      }
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
