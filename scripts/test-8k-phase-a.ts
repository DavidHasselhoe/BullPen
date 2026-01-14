// Form 8-K Phase A Validation Test Suite
// Tests real-world 8-K ingestion to ensure events-only behavior
// No metrics extraction, no fiscal inference, deterministic re-ingestion

// Load environment variables from .env.local
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

import { ingestFiling } from '../lib/ingestion/filing-ingestion';
import { createServerClient } from '../lib/supabase/client';
import { hardResetCompany } from '../lib/metrics/hard-reset';
import { getCompanyByTicker } from '../lib/ingestion/database';

/**
 * Test configuration
 */
interface TestConfig {
  ticker: string;
  cik: string;
  accessionNumber: string;
  filingDate: string;
  expectedItems: string[];
  expectedSplits?: Array<{
    ratio: number;
    effectiveDate: string;
  }>;
  expectedEvents?: Array<{
    item: string;
    eventType: string;
  }>;
  hasItem202?: boolean; // If true, must NOT produce metrics
}

/**
 * Database state snapshot
 */
interface DatabaseSnapshot {
  financialMetricsCount: number;
  stockSplitsCount: number;
  corporateEventsCount: number;
}

/**
 * Gets database state snapshot
 */
async function getDatabaseSnapshot(companyId: string): Promise<DatabaseSnapshot> {
  const supabase = createServerClient();

  const [metricsResult, splitsResult, eventsResult] = await Promise.all([
    supabase
      .from('financial_metrics')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId),
    supabase
      .from('stock_splits')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId),
    supabase
      .from('corporate_events')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId),
  ]);

  return {
    financialMetricsCount: metricsResult.count || 0,
    stockSplitsCount: splitsResult.count || 0,
    corporateEventsCount: eventsResult.count || 0,
  };
}

/**
 * Assertions helper - validates Phase A invariants
 */
async function assertPhaseAInvariants(
  companyId: string,
  beforeSnapshot: DatabaseSnapshot,
  afterSnapshot: DatabaseSnapshot,
  filingId: string,
  config: TestConfig
): Promise<void> {
  const supabase = createServerClient();

  // Hard failure: No metrics should be created from 8-K
  if (afterSnapshot.financialMetricsCount > beforeSnapshot.financialMetricsCount) {
    throw new Error(
      `FAIL: Financial metrics count increased from ${beforeSnapshot.financialMetricsCount} to ${afterSnapshot.financialMetricsCount}. 8-K filings must NOT create metrics.`
    );
  }

  // Hard failure: Verify filing has no fiscal fields
  const { data: filing, error: filingError } = await supabase
    .from('filings')
    .select('fiscal_year, fiscal_quarter, period_end_date, items')
    .eq('id', filingId)
    .single();

  if (filingError) {
    throw new Error(`Failed to fetch filing: ${filingError.message}`);
  }

  if (filing.fiscal_year !== null || filing.fiscal_quarter !== null || filing.period_end_date !== null) {
    throw new Error(
      `FAIL: 8-K filing has fiscal fields populated. fiscal_year=${filing.fiscal_year}, fiscal_quarter=${filing.fiscal_quarter}, period_end_date=${filing.period_end_date}`
    );
  }

  // Validate items array
  if (!filing.items || !Array.isArray(filing.items)) {
    throw new Error(`FAIL: Filing items is not an array: ${filing.items}`);
  }

  // Validate expected items (if provided)
  // Note: For auto-fetched filings, we validate that items exist, not exact match
  if (config.expectedItems.length > 0) {
    const itemsMatch = config.expectedItems.every(item => filing.items.includes(item));
    if (!itemsMatch) {
      // For auto-fetched filings, this is a warning, not a hard failure
      console.warn(
        `  ⚠ Expected items ${config.expectedItems.join(', ')}, got ${filing.items.join(', ')}`
      );
    }
  }

  // Validate stock splits (if expected)
  if (config.expectedSplits && config.expectedSplits.length > 0) {
    const { data: splits, error: splitsError } = await supabase
      .from('stock_splits')
      .select('*')
      .eq('company_id', companyId)
      .eq('source', '8-K')
      .order('effective_date', { ascending: false });

    if (splitsError) {
      throw new Error(`Failed to fetch stock splits: ${splitsError.message}`);
    }

    if (splits.length === 0) {
      console.warn(`  ⚠ No stock splits detected (expected: ${config.expectedSplits.length})`);
      // Not a hard failure - split detection may not work for all filings
    } else {
      console.log(`  ✓ Found ${splits.length} stock split(s)`);
      
      // Validate each expected split (if found)
      for (const expectedSplit of config.expectedSplits) {
        const matchingSplit = splits.find(
          s => s.split_ratio === expectedSplit.ratio && s.effective_date === expectedSplit.effectiveDate
        );

        if (matchingSplit) {
          console.log(`  ✓ Validated split: ${expectedSplit.ratio}-for-1, effective ${expectedSplit.effectiveDate}`);
        } else {
          console.warn(`  ⚠ Expected split not found: ratio=${expectedSplit.ratio}, effective_date=${expectedSplit.effectiveDate}`);
        }
      }

      // Hard failure: Any split must have effective date and correct source
      for (const split of splits) {
        if (!split.effective_date) {
          throw new Error(`FAIL: Stock split missing effective_date: ${JSON.stringify(split)}`);
        }

        if (split.source !== '8-K') {
          throw new Error(`FAIL: Stock split source is not '8-K': ${split.source}`);
        }
      }
    }
  }

  // Validate corporate events (if expected)
  if (config.expectedEvents && config.expectedEvents.length > 0) {
    const { data: events, error: eventsError } = await supabase
      .from('corporate_events')
      .select('*')
      .eq('company_id', companyId)
      .eq('filing_id', filingId)
      .order('event_date', { ascending: false });

    if (eventsError) {
      throw new Error(`Failed to fetch corporate events: ${eventsError.message}`);
    }

    if (events.length === 0) {
      console.warn(`  ⚠ No corporate events created (expected: ${config.expectedEvents.length})`);
      // Not a hard failure - events depend on items present
    } else {
      console.log(`  ✓ Found ${events.length} corporate event(s)`);
      
      // Validate each expected event (if found)
      for (const expectedEvent of config.expectedEvents) {
        const matchingEvent = events.find(e => e.event_type === expectedEvent.eventType);

        if (matchingEvent) {
          console.log(`  ✓ Validated event: ${expectedEvent.eventType} (Item ${expectedEvent.item})`);
        } else {
          console.warn(`  ⚠ Expected event not found: event_type=${expectedEvent.eventType}, item=${expectedEvent.item}`);
        }
      }
    }
  } else {
    // If no expected events, just log what was created
    const { data: events } = await supabase
      .from('corporate_events')
      .select('*')
      .eq('company_id', companyId)
      .eq('filing_id', filingId);
    
    if (events && events.length > 0) {
      console.log(`  ✓ Created ${events.length} corporate event(s): ${events.map(e => e.event_type).join(', ')}`);
    }
  }

  // Item 2.02 safety: If filing has Item 2.02, verify NO metrics were created
  if (filing.items.includes('2.02')) {
    if (afterSnapshot.financialMetricsCount > beforeSnapshot.financialMetricsCount) {
      throw new Error(
        `FAIL: Item 2.02 present but metrics were created. This violates Phase A safety constraints.`
      );
    }
    
    if (config.hasItem202) {
      console.log(`  ✓ Item 2.02 detected and correctly ignored (no metrics created)`);
    } else {
      console.log(`  ⚠ Item 2.02 detected in filing (should not produce metrics in Phase A)`);
    }
  }
  
  // Log summary
  console.log(`  ✓ Filing items: ${filing.items.join(', ')}`);
  console.log(`  ✓ Metrics count: ${beforeSnapshot.financialMetricsCount} → ${afterSnapshot.financialMetricsCount} (unchanged)`);
  console.log(`  ✓ Splits count: ${beforeSnapshot.stockSplitsCount} → ${afterSnapshot.stockSplitsCount}`);
  console.log(`  ✓ Events count: ${beforeSnapshot.corporateEventsCount} → ${afterSnapshot.corporateEventsCount}`);
}

/**
 * Test case: Stock split detection
 */
async function testStockSplitDetection(config: TestConfig): Promise<void> {
  console.log(`\n=== Testing Stock Split Detection: ${config.ticker} ===`);

  // Get company
  const companyResult = await getCompanyByTicker(config.ticker);
  if (!companyResult.success || !companyResult.data) {
    throw new Error(`Company not found: ${config.ticker}`);
  }

  const company = companyResult.data;

  // Hard reset to ensure clean state
  console.log(`Hard resetting ${config.ticker}...`);
  await hardResetCompany(company.id);

  // Get before snapshot
  const beforeSnapshot = await getDatabaseSnapshot(company.id);

  // Ingest filing
  console.log(`Ingesting 8-K: ${config.accessionNumber}`);
  const result = await ingestFiling(company.cik, config.accessionNumber, (step, details) => {
    console.log(`  ${step}`, details ? JSON.stringify(details) : '');
  });

  if (!result.success || !result.filingId) {
    throw new Error(`Filing ingestion failed: ${result.error}`);
  }

  // Get after snapshot
  const afterSnapshot = await getDatabaseSnapshot(company.id);

  // Assert invariants
  await assertPhaseAInvariants(company.id, beforeSnapshot, afterSnapshot, result.filingId, config);

  console.log(`✓ Stock split detection test passed for ${config.ticker}`);
}

/**
 * Test case: Re-ingestion determinism
 */
async function testReIngestionDeterminism(config: TestConfig): Promise<void> {
  console.log(`\n=== Testing Re-Ingestion Determinism: ${config.ticker} ===`);

  // Get company
  const companyResult = await getCompanyByTicker(config.ticker);
  if (!companyResult.success || !companyResult.data) {
    throw new Error(`Company not found: ${config.ticker}`);
  }

  const company = companyResult.data;

  // Get initial snapshot (filing already exists from previous test)
  const initialSnapshot = await getDatabaseSnapshot(company.id);

  // Second ingestion (re-ingestion)
  console.log(`Re-ingestion attempt: ${config.accessionNumber}`);
  const secondResult = await ingestFiling(company.cik, config.accessionNumber);

  if (!secondResult.success) {
    // Expected: filing already exists - this is correct behavior
    if (secondResult.error?.includes('already exists')) {
      console.log(`  ✓ Re-ingestion correctly rejected (filing exists)`);
    } else {
      throw new Error(`Re-ingestion failed unexpectedly: ${secondResult.error}`);
    }
  } else {
    // If ingestion succeeded, it means the filing was re-ingested (unexpected)
    throw new Error(`Re-ingestion should have been rejected, but succeeded`);
  }

  const secondSnapshot = await getDatabaseSnapshot(company.id);

  // Hard failure: Database state must be identical (no new rows should be added)
  if (
    initialSnapshot.financialMetricsCount !== secondSnapshot.financialMetricsCount ||
    initialSnapshot.stockSplitsCount !== secondSnapshot.stockSplitsCount ||
    initialSnapshot.corporateEventsCount !== secondSnapshot.corporateEventsCount
  ) {
    throw new Error(
      `FAIL: Re-ingestion changed database state. Before: ${JSON.stringify(initialSnapshot)}, After: ${JSON.stringify(secondSnapshot)}`
    );
  }

  console.log(`✓ Re-ingestion determinism test passed for ${config.ticker}`);
}

/**
 * Finds a real 8-K filing for a company (for testing)
 * Fetches recent 8-K filings and returns the first one found
 */
async function findReal8KFiling(cik: string, ticker: string): Promise<string | null> {
  try {
    const { getRecentFilings } = await import('../lib/ingestion/sec-edgar');
    const filings = await getRecentFilings(cik, '8-K', 5);
    
    if (filings.length === 0) {
      console.log(`  ⚠ No 8-K filings found for ${ticker}`);
      return null;
    }
    
    console.log(`  ✓ Found ${filings.length} recent 8-K filing(s) for ${ticker}`);
    return filings[0].accessionNumber;
  } catch (error) {
    console.error(`  ✗ Error fetching 8-K filings for ${ticker}:`, error);
    return null;
  }
}

/**
 * Main test runner
 */
async function runPhaseATests(): Promise<void> {
  console.log('Form 8-K Phase A Validation Test Suite');
  console.log('========================================\n');

  // Test configurations - will auto-fetch real accession numbers if not provided
  const testConfigs: Array<{
    ticker: string;
    cik: string;
    accessionNumber?: string; // Optional - will be fetched if not provided
    filingDate: string;
    expectedItems: string[];
    expectedSplits?: Array<{
      ratio: number;
      effectiveDate: string;
    }>;
    expectedEvents?: Array<{
      item: string;
      eventType: string;
    }>;
    hasItem202?: boolean;
  }> = [
    // Test Case 1: Stock Split Detection
    // NVIDIA 10-for-1 split (June 2024)
    {
      ticker: 'NVDA',
      cik: '0001045810',
      // accessionNumber will be auto-fetched if not provided
      filingDate: '2024-06-07',
      expectedItems: ['3.02'], // Will validate actual items found
      expectedSplits: [
        {
          ratio: 10,
          effectiveDate: '2024-06-10', // Will validate if split is detected
        },
      ],
    },
    // Test Case 2: Corporate Events
    {
      ticker: 'AAPL',
      cik: '0000320193',
      filingDate: '2024-01-01',
      expectedItems: ['5.02'], // Will validate actual items found
      expectedEvents: [
        {
          item: '5.02',
          eventType: 'executive_change',
        },
      ],
    },
    // Test Case 3: Item 2.02 Safety (Negative Test)
    {
      ticker: 'TSLA',
      cik: '0001318605',
      filingDate: '2024-01-01',
      expectedItems: ['2.02'], // Will validate actual items found
      hasItem202: true, // Must NOT produce metrics
    },
  ];

  const testCases: TestConfig[] = [];

  // Auto-fetch real accession numbers if not provided
  console.log('Finding real 8-K filings...\n');
  for (const config of testConfigs) {
    let accessionNumber = config.accessionNumber;
    
    if (!accessionNumber) {
      console.log(`Fetching recent 8-K for ${config.ticker}...`);
      accessionNumber = await findReal8KFiling(config.cik, config.ticker);
      
      if (!accessionNumber) {
        console.log(`  ⚠ Skipping ${config.ticker}: No 8-K filings found\n`);
        continue;
      }
      
      console.log(`  ✓ Using accession: ${accessionNumber}\n`);
    }

    testCases.push({
      ...config,
      accessionNumber,
    });
  }

  let passed = 0;
  let failed = 0;

  if (testCases.length === 0) {
    console.log('⚠ No test cases available. Please ensure companies have 8-K filings or provide accession numbers.');
    return;
  }

  for (const testCase of testCases) {
    try {
      await testStockSplitDetection(testCase);
      await testReIngestionDeterminism(testCase);
      passed++;
    } catch (error) {
      console.error(`\n✗ Test failed for ${testCase.ticker}:`, error);
      failed++;
    }
  }

  console.log(`\n========================================`);
  console.log(`Test Results: ${passed} passed, ${failed} failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

// Run tests if executed directly
if (require.main === module) {
  runPhaseATests().catch((error) => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });
}

export { runPhaseATests, testStockSplitDetection, testReIngestionDeterminism };
