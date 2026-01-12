// Backfill Company Logos
// Fetches and stores logos for all existing companies

import dotenv from 'dotenv';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env.local') });

import { getCompaniesNeedingLogos } from '../lib/logos/logos-db';
import { ingestCompanyLogo } from '../lib/logos/logos-orchestrator';

/**
 * Backfills logos for all companies missing logos
 */
async function backfillLogos() {
  console.log('Starting logo backfill...\n');

  // Get all companies needing logos
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

  // Process companies with rate limiting
  for (let i = 0; i < companies.length; i++) {
    const company = companies[i];
    const progress = `[${i + 1}/${companies.length}]`;

    console.log(`${progress} Processing ${company.ticker} (${company.name})...`);

    try {
      const result = await ingestCompanyLogo(
        company.ticker,
        company.name,
        company.id,
        (step, details) => {
          // Log progress steps
          if (step.includes('completed') || step.includes('failed') || step.includes('Logo fetched')) {
            console.log(`  ${step}`, details ? JSON.stringify(details).substring(0, 60) : '');
          }
        }
      );

      if (result.success && result.logoUrl) {
        console.log(`  ✓ Logo ingested: ${result.logoUrl.substring(0, 60)}...`);
        successCount++;
      } else {
        console.log(`  ✗ Failed: ${result.error || 'Unknown error'}`);
        failCount++;
        errors.push({ ticker: company.ticker, error: result.error || 'Unknown error' });
      }
    } catch (error) {
      console.error(`  ✗ Error:`, error instanceof Error ? error.message : 'Unknown error');
      failCount++;
      errors.push({
        ticker: company.ticker,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Rate limiting: wait 500ms between requests (2 req/sec)
    if (i < companies.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log(''); // Blank line for readability
  }

  // Summary
  console.log('\n=== Backfill Summary ===');
  console.log(`Total companies: ${companies.length}`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);

  if (errors.length > 0) {
    console.log('\nErrors:');
    errors.forEach(({ ticker, error }) => {
      console.log(`  ${ticker}: ${error}`);
    });
  }

  console.log('\nBackfill complete!');
}

// Run backfill
backfillLogos()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
