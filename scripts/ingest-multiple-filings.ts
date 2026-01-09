// Ingest multiple historical filings for a company
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';
import { getRecentFilings } from '../lib/ingestion/sec-edgar';
import { ingestFiling } from '../lib/ingestion/filing-ingestion';

async function main() {
  const ticker = process.argv[2]?.toUpperCase() || 'AAPL';
  const filingType = (process.argv[3] || '10-K') as '10-K' | '10-Q';
  const count = parseInt(process.argv[4] || '5', 10);

  console.log(`📥 Ingesting ${count} ${filingType} filings for ${ticker}...\n`);

  const supabase = createServerClient();

  // Get company
  const { data: company } = await supabase
    .from('companies')
    .select('id, name, ticker, cik')
    .eq('ticker', ticker)
    .single();

  if (!company) {
    console.error(`❌ Company ${ticker} not found`);
    process.exit(1);
  }

  console.log(`Found: ${company.name} (${company.ticker}) - CIK: ${company.cik}\n`);

  // Get recent filings from SEC
  console.log(`📋 Fetching recent ${filingType} filings from SEC...`);
  const filings = await getRecentFilings(company.cik, filingType, count * 2); // Get extra to account for ones we might already have

  if (filings.length === 0) {
    console.error(`❌ No ${filingType} filings found`);
    process.exit(1);
  }

  console.log(`Found ${filings.length} filings from SEC\n`);

  // Check which ones we already have
  const existingAccessions = new Set<string>();
  const { data: existing } = await supabase
    .from('filings')
    .select('accession_number')
    .eq('company_id', company.id)
    .in('accession_number', filings.map(f => f.accessionNumber));

  if (existing) {
    existing.forEach(f => existingAccessions.add(f.accession_number));
  }

  // Filter to only new filings
  const newFilings = filings.filter(f => !existingAccessions.has(f.accessionNumber)).slice(0, count);

  if (newFilings.length === 0) {
    console.log(`✅ All ${count} most recent ${filingType} filings are already ingested`);
    process.exit(0);
  }

  console.log(`Ingesting ${newFilings.length} new ${filingType} filing(s)...\n`);

  // Ingest each filing
  for (let i = 0; i < newFilings.length; i++) {
    const filing = newFilings[i];
    console.log(`\n[${i + 1}/${newFilings.length}] Processing ${filingType} - ${filing.filingDate} (${filing.reportDate || 'N/A'})...`);
    console.log(`  Accession: ${filing.accessionNumber}`);

    try {
      const result = await ingestFiling(company.cik, filing.accessionNumber, (step, details) => {
        if (step.includes('completed')) {
          console.log(`  ✓ ${step}`);
        }
      });

      if (result.success) {
        console.log(`  ✅ Successfully ingested`);
      } else {
        console.log(`  ❌ Failed: ${result.errors?.join(', ') || 'Unknown error'}`);
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Delay to respect rate limits
    if (i < newFilings.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log(`\n✅ Done! Ingested ${newFilings.length} ${filingType} filing(s).`);
  console.log(`\nNext step: Extract metrics using:`);
  console.log(`  npx tsx scripts/extract-all-metrics.ts ${ticker}`);
}

main();
