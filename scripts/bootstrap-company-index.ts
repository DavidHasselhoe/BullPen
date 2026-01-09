#!/usr/bin/env tsx
/**
 * Bootstrap Company Index
 * Downloads SEC company_tickers.json and populates company_index table
 * Safe to run multiple times (idempotent)
 */

import { config } from 'dotenv';
import { resolve } from 'path';
// Load .env.local for environment variables
config({ path: resolve(process.cwd(), '.env.local') });

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
 * Handles duplicates by deduplicating by ticker (one ticker per entry)
 */
async function upsertCompanyIndex(entries: Array<{
  ticker: string;
  name: string;
  cik: string;
  normalized_ticker: string;
  normalized_name: string;
}>) {
  const supabase = createServerClient();
  
  // Deduplicate entries by ticker (if same ticker appears multiple times, keep first)
  const tickerMap = new Map<string, typeof entries[0]>();
  entries.forEach((entry) => {
    if (!tickerMap.has(entry.ticker)) {
      tickerMap.set(entry.ticker, entry);
    }
  });
  
  const uniqueEntries = Array.from(tickerMap.values());
  
  // Further deduplicate by CIK - if same CIK has multiple tickers, keep the first ticker
  const cikMap = new Map<string, typeof entries[0]>();
  uniqueEntries.forEach((entry) => {
    if (!cikMap.has(entry.cik)) {
      cikMap.set(entry.cik, entry);
    }
  });
  
  const finalEntries = Array.from(cikMap.values());
  
  console.log(`Upserting ${finalEntries.length} unique company index entries (from ${entries.length} raw entries)...`);
  
  // Process in smaller batches to avoid timeout
  const batchSize = 500;
  for (let i = 0; i < finalEntries.length; i += batchSize) {
    const batch = finalEntries.slice(i, i + batchSize);
    
    const { error } = await supabase
      .from('company_index')
      .upsert(batch, {
        onConflict: 'ticker',
        ignoreDuplicates: false,
      });

    if (error) {
      // If CIK conflict, try upserting one by one with onConflict for CIK
      console.warn(`Batch upsert failed (likely CIK conflict), falling back to individual inserts for batch ${i / batchSize + 1}...`);
      
      // Insert individually, skipping conflicts
      for (const entry of batch) {
        const { error: insertError } = await supabase
          .from('company_index')
          .upsert(entry, {
            onConflict: 'ticker',
            ignoreDuplicates: false,
          });
        
        // If CIK conflict, try updating by ticker instead
        if (insertError && insertError.message.includes('unique_cik')) {
          // Skip this entry - CIK already exists with different ticker
          continue;
        } else if (insertError) {
          console.warn(`Failed to upsert ${entry.ticker}: ${insertError.message}`);
        }
      }
    }
  }

  console.log(`Successfully processed ${finalEntries.length} entries`);
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
