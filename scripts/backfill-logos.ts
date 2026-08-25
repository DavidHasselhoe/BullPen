// Backfill Company Logos
// Fetches and stores logos (TwelveData first, logo.dev fallback) for every
// company row missing a logo_url.
//
// Usage: npm run backfill-logos

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { getCompaniesNeedingLogos } from '../lib/logos/logos-db';
import { resolveAndPersistLogo } from '../lib/logos/resolve-logo';

async function backfillLogos() {
  console.log('Starting logo backfill...\n');

  const companiesResult = await getCompaniesNeedingLogos();

  if (!companiesResult.success || !companiesResult.companies) {
    console.error('Failed to fetch companies:', companiesResult.error);
    process.exit(1);
  }

  const companies = companiesResult.companies;
  console.log(`Found ${companies.length} companies needing logos\n`);

  if (companies.length === 0) {
    console.log('All companies already have logos. Exiting.');
    return;
  }

  let successCount = 0;
  let failCount = 0;
  const errors: Array<{ ticker: string; error: string }> = [];

  for (let i = 0; i < companies.length; i++) {
    const company = companies[i];
    const progress = `[${i + 1}/${companies.length}]`;

    try {
      const result = await resolveAndPersistLogo(company.ticker, company.id);

      if (result.success && result.url) {
        console.log(`${progress} ✓ ${company.ticker} (${result.source}) → ${result.url}`);
        successCount++;
      } else {
        console.log(`${progress} ✗ ${company.ticker}: ${result.error ?? 'Unknown error'}`);
        failCount++;
        errors.push({ ticker: company.ticker, error: result.error ?? 'Unknown error' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.log(`${progress} ✗ ${company.ticker}: ${message}`);
      failCount++;
      errors.push({ ticker: company.ticker, error: message });
    }

    // Rate limiting: wait 300ms between requests.
    if (i < companies.length - 1) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  console.log('\n=== Backfill Summary ===');
  console.log(`Total companies: ${companies.length}`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);

  if (errors.length > 0) {
    console.log('\nErrors:');
    errors.forEach(({ ticker, error }) => console.log(`  ${ticker}: ${error}`));
  }

  console.log('\nBackfill complete!');
}

backfillLogos()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
