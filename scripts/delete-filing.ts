// Delete Filing Script
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';

const accessionNumber = process.argv[2];

if (!accessionNumber) {
  console.error('Usage: npx tsx scripts/delete-filing.ts <ACCESSION_NUMBER>');
  process.exit(1);
}

async function main() {
  const supabase = createServerClient();

  const { error } = await supabase
    .from('filings')
    .delete()
    .eq('accession_number', accessionNumber);

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  console.log(`✅ Deleted filing: ${accessionNumber}`);
}

main();
