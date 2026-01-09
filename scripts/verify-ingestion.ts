// Verify Ingestion Script
// Queries the database to show what was ingested

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';

async function main() {
  const supabase = createServerClient();

  console.log('🔍 Verifying BullPen Database\n');

  // Query company
  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('ticker', 'AAPL')
    .single();

  console.log('✅ Company:');
  console.log(`  Ticker: ${company?.ticker}`);
  console.log(`  Name: ${company?.name}`);
  console.log(`  CIK: ${company?.cik}`);
  console.log(`  ID: ${company?.id}\n`);

  // Query filings
  const { data: filings } = await supabase
    .from('filings')
    .select('*')
    .eq('company_id', company?.id)
    .order('filing_date', { ascending: false });

  console.log(`✅ Filings (${filings?.length}):`);
  filings?.forEach((filing, i) => {
    console.log(`  ${i + 1}. ${filing.filing_type} - ${filing.filing_date}`);
    console.log(`     Accession: ${filing.accession_number}`);
    console.log(`     Status: ${filing.processing_status}`);
    console.log(`     ID: ${filing.id}`);
  });
  console.log('');

  // Query sections for each filing
  for (const filing of filings || []) {
    const { data: sections } = await supabase
      .from('filing_sections')
      .select('*')
      .eq('filing_id', filing.id)
      .order('section_order');

    console.log(`✅ Sections for ${filing.accession_number} (${sections?.length}):`);
    sections?.forEach((section, i) => {
      console.log(`  ${i + 1}. ${section.section_type}`);
      console.log(`     Name: ${section.section_name}`);
      console.log(`     Length: ${section.content_length.toLocaleString()} chars`);
      console.log(`     Preview: ${section.content.substring(0, 100)}...`);
    });
    console.log('');
  }
}

main();
