// Test Ingestion Script
// Run with: npx tsx scripts/test-ingestion.ts

// Load environment variables from .env.local
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

import {
  ingestLatestFiling,
  ingestFiling,
  ingestRecentFilings,
} from '../lib/ingestion/filing-ingestion';
import { getCompanyInfo, getRecentFilings } from '../lib/ingestion/sec-edgar';

/**
 * Test companies with known good CIKs
 */
const TEST_COMPANIES = {
  AAPL: '0000320193',
  MSFT: '0000789019',
  GOOGL: '0001652044',
  TSLA: '0001318605',
};

/**
 * Main test function
 */
async function main() {
  console.log('🚀 BullPen Ingestion Pipeline Test\n');

  // Get command line arguments
  const args = process.argv.slice(2);
  const command = args[0];
  const param1 = args[1];
  const param2 = args[2];

  try {
    switch (command) {
      case 'info':
        await testCompanyInfo(param1 || TEST_COMPANIES.AAPL);
        break;

      case 'list':
        await testListFilings(
          param1 || TEST_COMPANIES.AAPL,
          param2 || '10-K'
        );
        break;

      case 'ingest-latest':
        await testIngestLatest(
          param1 || TEST_COMPANIES.AAPL,
          param2 || '10-K'
        );
        break;

      case 'ingest':
        if (!param1 || !param2) {
          console.error('Usage: npm run test-ingest ingest <CIK> <ACCESSION_NUMBER>');
          process.exit(1);
        }
        await testIngestSpecific(param1, param2);
        break;

      case 'ingest-recent':
        await testIngestRecent(
          param1 || TEST_COMPANIES.AAPL,
          param2 || '8-K',
          args[3] ? parseInt(args[3], 10) : 3
        );
        break;

      default:
        printUsage();
        break;
    }
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

/**
 * Test: Fetch company information
 */
async function testCompanyInfo(cik: string) {
  console.log(`📊 Fetching company info for CIK: ${cik}\n`);

  const info = await getCompanyInfo(cik);

  console.log('Company Information:');
  console.log(`  Name:      ${info.name}`);
  console.log(`  CIK:       ${info.cik}`);
  console.log(`  Ticker:    ${info.ticker || 'N/A'}`);
  console.log(`  Exchanges: ${info.exchanges?.join(', ') || 'N/A'}`);
  console.log('\n✅ Company info retrieved successfully');
}

/**
 * Test: List recent filings
 */
async function testListFilings(cik: string, filingType: string) {
  console.log(`📋 Fetching recent ${filingType} filings for CIK: ${cik}\n`);

  const filings = await getRecentFilings(cik, filingType, 5);

  if (filings.length === 0) {
    console.log('No filings found');
    return;
  }

  console.log(`Found ${filings.length} filings:\n`);
  filings.forEach((filing, index) => {
    console.log(`${index + 1}. ${filing.form} - ${filing.filingDate}`);
    console.log(`   Accession: ${filing.accessionNumber}`);
    console.log(`   Report Date: ${filing.reportDate}`);
    console.log('');
  });

  console.log('✅ Filings list retrieved successfully');
}

/**
 * Test: Ingest latest filing
 */
async function testIngestLatest(cik: string, filingType: string) {
  console.log(`🔄 Ingesting latest ${filingType} filing for CIK: ${cik}\n`);

  const result = await ingestLatestFiling(cik, filingType, (step, details) => {
    console.log(`  → ${step}`, details ? `(${JSON.stringify(details)})` : '');
  });

  console.log('\n' + '='.repeat(60));

  if (result.success) {
    console.log('✅ Ingestion completed successfully!\n');
    console.log('Results:');
    console.log(`  Filing ID:        ${result.filingId}`);
    console.log(`  Company ID:       ${result.companyId}`);
    console.log(`  Sections Created: ${result.sectionsCreated}`);
    if (result.details) {
      console.log(`\nDetails:`);
      console.log(`  Company:      ${result.details.companyName} (${result.details.ticker})`);
      console.log(`  Filing Type:  ${result.details.filingType}`);
      console.log(`  Accession:    ${result.details.accessionNumber}`);
      if (result.details.sectionStats) {
        console.log(`\nSection Statistics:`);
        console.log(`  Total Sections:  ${result.details.sectionStats.totalSections}`);
        console.log(`  Total Length:    ${result.details.sectionStats.totalLength.toLocaleString()} chars`);
        console.log(`  Average Length:  ${result.details.sectionStats.averageLength.toLocaleString()} chars`);
        console.log(`  Section Types:   ${result.details.sectionStats.sectionTypes.join(', ')}`);
      }
    }
  } else {
    console.log('❌ Ingestion failed!\n');
    console.log(`Error: ${result.error}`);
    process.exit(1);
  }
}

/**
 * Test: Ingest recent filings (e.g. last N 8-Ks)
 */
async function testIngestRecent(cik: string, filingType: string, count: number) {
  console.log(`🔄 Ingesting last ${count} ${filingType} filing(s) for CIK: ${cik}\n`);

  const results = await ingestRecentFilings(cik, filingType, count, (step, details) => {
    console.log(`  → ${step}`, details ? `(${JSON.stringify(details)})` : '');
  });

  console.log('\n' + '='.repeat(60));

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success);
  const alreadyExists = failed.filter((r) => r.error?.includes('already exists')).length;

  console.log(`\nResults: ${succeeded} ingested, ${alreadyExists} already in DB, ${failed.length - alreadyExists} errors`);
  if (failed.length > 0 && alreadyExists < failed.length) {
    failed.forEach((r, i) => {
      if (!r.error?.includes('already exists')) {
        console.log(`  ❌ ${i + 1}. ${r.error}`);
      }
    });
    if (failed.some((r) => !r.error?.includes('already exists'))) {
      process.exit(1);
    }
  }
  console.log('✅ Ingest recent completed');
}

/**
 * Test: Ingest specific filing
 */
async function testIngestSpecific(cik: string, accessionNumber: string) {
  console.log(`🔄 Ingesting filing ${accessionNumber}\n`);

  const result = await ingestFiling(cik, accessionNumber, (step, details) => {
    console.log(`  → ${step}`, details ? `(${JSON.stringify(details)})` : '');
  });

  console.log('\n' + '='.repeat(60));

  if (result.success) {
    console.log('✅ Ingestion completed successfully!\n');
    console.log('Results:');
    console.log(`  Filing ID:        ${result.filingId}`);
    console.log(`  Company ID:       ${result.companyId}`);
    console.log(`  Sections Created: ${result.sectionsCreated}`);
  } else {
    console.log('❌ Ingestion failed!\n');
    console.log(`Error: ${result.error}`);
    process.exit(1);
  }
}

/**
 * Print usage instructions
 */
function printUsage() {
  console.log('Usage: npx tsx scripts/test-ingestion.ts <command> [options]\n');
  console.log('Commands:');
  console.log('  info [CIK]                      - Fetch company information');
  console.log('  list [CIK] [FILING_TYPE]        - List recent filings');
  console.log('  ingest-latest [CIK] [FILING_TYPE] - Ingest latest filing');
  console.log('  ingest-recent [CIK] [FILING_TYPE] [COUNT] - Ingest last N filings (default: 3)');
  console.log('  ingest <CIK> <ACCESSION_NUMBER> - Ingest specific filing');
  console.log('\nExamples:');
  console.log('  npx tsx scripts/test-ingestion.ts info 0000320193');
  console.log('  npx tsx scripts/test-ingestion.ts list 0000320193 8-K');
  console.log('  npx tsx scripts/test-ingestion.ts ingest-latest 0000320193 8-K');
  console.log('  npx tsx scripts/test-ingestion.ts ingest-recent 0000320193 8-K 5');
  console.log('  npx tsx scripts/test-ingestion.ts ingest 0000320193 0000320193-23-000077');
  console.log('\nTest Companies:');
  Object.entries(TEST_COMPANIES).forEach(([ticker, cik]) => {
    console.log(`  ${ticker}: ${cik}`);
  });
}

// Run main function
main();
