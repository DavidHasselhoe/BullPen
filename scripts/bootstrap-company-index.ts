#!/usr/bin/env tsx
/**
 * Bootstrap Company Index
 * Downloads SEC company_tickers.json and populates company_index table
 * Safe to run multiple times (idempotent)
 */

import { createServerClient } from '../lib/supabase/client';

interface SECCompanyTicker {
  cik_str: number;
  ticker: string;
  title: string;
}

interface SECCompanyTickers {
  [key: string]: SECCompanyTicker;
}

/**
 * Normalizes ticker to lowercase
 */
function normalizeTicker(ticker: string): string {
  return ticker.trim().toLowerCase();
}

/**
 * Normalizes company name for search
 * Removes punctuation, converts to lowercase
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,\-'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Downloads company tickers from SEC
 */
async function fetchSECCompanyTickers(): Promise<SECCompanyTickers> {
  const url = 'https://www.sec.gov/files/company_tickers.json';
  
  console.log(`Downloading company tickers from ${url}...`);
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'BullPen/1.0 (contact@bullpen.io)', // SEC requires User-Agent
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch SEC company tickers: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as SECCompanyTickers;
  console.log(`Downloaded ${Object.keys(data).length} company tickers`);
  
  return data;
}

/**
 * Inserts or updates company index entries
 */
async function upsertCompanyIndex(entries: Array<{
  ticker: string;
  name: string;
  cik: string;
  normalized_ticker: string;
  normalized_name: string;
}>) {
  const supabase = createServerClient();
  
  console.log(`Upserting ${entries.length} company index entries...`);
  
  const { error } = await supabase
    .from('company_index')
    .upsert(entries, {
      onConflict: 'ticker',
      ignoreDuplicates: false,
    });

  if (error) {
    throw new Error(`Failed to upsert company index: ${error.message}`);
  }

  console.log(`Successfully upserted ${entries.length} entries`);
}

/**
 * Main bootstrap function
 */
async function bootstrap() {
  try {
    console.log('Starting company index bootstrap...\n');

    // Download SEC company tickers
    const tickers = await fetchSECCompanyTickers();

    // Transform to company_index format
    const entries = Object.values(tickers).map((item) => ({
      ticker: item.ticker.toUpperCase().trim(),
      name: item.title.trim(),
      cik: item.cik_str.toString().padStart(10, '0'), // CIK must be 10 digits
      normalized_ticker: normalizeTicker(item.ticker),
      normalized_name: normalizeName(item.title),
    }));

    console.log(`Processed ${entries.length} entries`);

    // Batch insert (Supabase handles batching automatically)
    // Insert in chunks of 1000 to avoid timeouts
    const chunkSize = 1000;
    for (let i = 0; i < entries.length; i += chunkSize) {
      const chunk = entries.slice(i, i + chunkSize);
      await upsertCompanyIndex(chunk);
      console.log(`Processed chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(entries.length / chunkSize)}`);
    }

    console.log('\n✅ Company index bootstrap completed successfully!');
    console.log(`Total entries: ${entries.length}`);
  } catch (error) {
    console.error('\n❌ Bootstrap failed:', error);
    process.exit(1);
  }
}

// Run bootstrap if called directly
bootstrap().catch((error) => {
  console.error('Bootstrap error:', error);
  process.exit(1);
});

export { bootstrap, fetchSECCompanyTickers, normalizeTicker, normalizeName };
