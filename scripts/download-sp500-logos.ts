/**
 * Script to download and upload S&P 500 company logos
 * Fetches logos from img.logo.dev API and uploads them to Supabase Storage
 * 
 * Usage: npm run download-sp500-logos
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';
import { fetchLogoFromLogoDev } from '../lib/logos/logo-fetcher';
import { uploadLogoToStorage } from '../lib/logos/logos-storage';
import { updateCompanyLogo } from '../lib/logos/logos-db';

// S&P 500 ticker symbols (as of 2024)
const SP500_TICKERS = [
  'AAPL', 'MSFT', 'AMZN', 'NVDA', 'GOOGL', 'GOOG', 'META', 'TSLA', 'BRK.B', 'UNH',
  'XOM', 'JNJ', 'JPM', 'V', 'PG', 'MA', 'HD', 'CVX', 'ABBV', 'LLY',
  'AVGO', 'COST', 'MRK', 'PEP', 'ADBE', 'WMT', 'TMO', 'CSCO', 'ABT', 'ACN',
  'NFLX', 'MCD', 'CRM', 'NKE', 'DIS', 'TXN', 'PM', 'ORCL', 'NEE', 'AMD',
  'LIN', 'QCOM', 'AMGN', 'RTX', 'HON', 'AMAT', 'GE', 'INTU', 'ISRG', 'BKNG',
  'AXP', 'CAT', 'ADI', 'SPGI', 'VZ', 'ADP', 'CMCSA', 'SBUX', 'DE', 'LOW',
  'MU', 'BLK', 'PANW', 'TJX', 'ELV', 'GILD', 'REGN', 'MO', 'KLAC', 'C',
  'SNPS', 'ANET', 'NOW', 'MDLZ', 'SHW', 'CDNS', 'ETN', 'MCHP', 'APH', 'EW',
  'CI', 'WM', 'APH', 'ZTS', 'CB', 'BSX', 'PSA', 'GM', 'NXPI', 'FCX',
  'HCA', 'EQIX', 'APD', 'AON', 'TTD', 'PCAR', 'CL', 'TTWO', 'VMC', 'IDXX',
  'PH', 'ROST', 'ITW', 'FAST', 'DHI', 'CTSH', 'MCO', 'IQV', 'PPG', 'AFL',
  'AIG', 'WBD', 'DGX', 'RCL', 'TEL', 'FERG', 'CME', 'WST', 'FTNT', 'OTIS',
  'EBAY', 'MTD', 'DFS', 'CTAS', 'PAYX', 'NOC', 'AWK', 'HES', 'TDG', 'BBY',
  'ZBH', 'RJF', 'CHD', 'AOS', 'HSIC', 'KMB', 'KEYS', 'SJM', 'HIG', 'CNC',
  'AMT', 'FLT', 'XEL', 'SWK', 'ALGN', 'AKAM', 'DTE', 'MRO', 'HWM', 'DOV',
  'EXPD', 'NSC', 'IRM', 'PHM', 'TSCO', 'ANSS', 'BR', 'PFG', 'STX', 'VRSK',
  'WDC', 'FTV', 'EG', 'NDAQ', 'WY', 'FANG', 'CEG', 'TFX', 'TECH', 'FDS',
  'EMN', 'GWW', 'TXT', 'RMD', 'LDOS', 'LYB', 'WAT', 'CDW', 'EFX', 'HAL',
  'IFF', 'IEX', 'EXAS', 'VICI', 'POOL', 'FMC', 'EME', 'AAL', 'LNT', 'WLK',
  'GPC', 'L', 'FTI', 'FIS', 'FFIV', 'BKR', 'HOLX', 'WAB', 'STLD', 'WSO',
  'J', 'LVS', 'PKI', 'LECO', 'WRB', 'CBOE', 'CF', 'GRMN', 'UAL', 'TREX',
  'DRI', 'JKHY', 'CMS', 'FNF', 'MOH', 'TMUS', 'SNA', 'MAS', 'ZBRA', 'JBL',
  'MOS', 'TPG', 'ABMD', 'BRO', 'HRL', 'GL', 'NWSA', 'EXPD', 'NVR', 'BALL',
  'ON', 'MKTX', 'ENPH', 'XYL', 'TER', 'ZION', 'FOXA', 'ALB', 'SSNC', 'BEN',
  'CSL', 'ODFL', 'CLH', 'RBC', 'TOL', 'WRK', 'HPE', 'PKG', 'CRL', 'ZBRA',
  'ALLE', 'RGA', 'HST', 'DVA', 'DISH', 'VRTX', 'RE', 'NWS', 'AMCR', 'KMX',
  'PODD', 'TRMB', 'FRC', 'NDSN', 'LBRDK', 'LBRDA', 'LSXMK', 'LSXMA', 'LSXMB',
  'BIO', 'NWL', 'PARA', 'FOX', 'EVRG', 'FITB', 'Z', 'CZR', 'MGM', 'RCL',
  'UHS', 'CPB', 'HAS', 'WHR', 'JWN', 'M', 'GPS', 'ANF', 'URBN', 'DKS',
  'BBWI', 'LEG', 'PVH', 'HBI', 'RL', 'WSM', 'W', 'RH', 'TPX', 'SHOO',
  'FL', 'BOOT', 'CROX', 'ONON', 'DKS', 'ASO', 'BBWI', 'BGS', 'CAL', 'CPRT',
  'CPRT', 'DECK', 'ETSY', 'FIVE', 'FTDR', 'GES', 'HOV', 'KSS', 'LULU', 'NWL',
  'OLLI', 'PIR', 'PLNT', 'POST', 'PRTY', 'RL', 'SKX', 'TGTX', 'TUP', 'VSTO',
  'W', 'WWD', 'YETI', 'YUMC', 'ZUMZ'
];

interface ProgressCallback {
  (step: string, details?: unknown): void;
}

async function downloadAndUploadLogo(
  ticker: string,
  companyId: string,
  companyName: string,
  onProgress?: ProgressCallback
): Promise<{ success: boolean; error?: string }> {
  try {
    onProgress?.(`Fetching logo for ${ticker}`, { ticker, companyName });

    // Step 1: Fetch logo from img.logo.dev
    const fetchResult = await fetchLogoFromLogoDev(ticker);

    if (!fetchResult.success || !fetchResult.imageBuffer || !fetchResult.mimeType) {
      onProgress?.(`Logo not found for ${ticker}`, { ticker, error: fetchResult.error });
      return {
        success: false,
        error: fetchResult.error || 'Logo not found',
      };
    }

    onProgress?.(`Logo fetched for ${ticker}`, {
      ticker,
      source: fetchResult.source,
      size: fetchResult.imageBuffer.length,
    });

    // Step 2: Upload to Supabase Storage
    onProgress?.(`Uploading logo for ${ticker}`, { ticker });
    const uploadResult = await uploadLogoToStorage(
      ticker,
      fetchResult.imageBuffer,
      fetchResult.mimeType
    );

    if (!uploadResult.success || !uploadResult.publicUrl) {
      onProgress?.(`Upload failed for ${ticker}`, { ticker, error: uploadResult.error });
      return {
        success: false,
        error: uploadResult.error || 'Failed to upload logo',
      };
    }

    onProgress?.(`Logo uploaded for ${ticker}`, { ticker, url: uploadResult.publicUrl });

    // Step 3: Update database (optional - only if company exists)
    if (companyId) {
      onProgress?.(`Updating database for ${ticker}`, { ticker });
      const dbUpdateResult = await updateCompanyLogo(
        companyId,
        uploadResult.publicUrl,
        'brand'
      );

      if (!dbUpdateResult.success) {
        onProgress?.(`Database update failed for ${ticker}`, {
          ticker,
          error: dbUpdateResult.error,
        });
        // Don't fail the whole process if DB update fails
        // The logo is still in storage and can be linked later
      }
    }

    onProgress?.(`Completed ${ticker}`, { ticker, url: uploadResult.publicUrl });
    return {
      success: true,
    };
  } catch (error) {
    onProgress?.(`Error processing ${ticker}`, {
      ticker,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function getCompanyIdFromTicker(ticker: string): Promise<string | null> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('companies')
      .select('id, name')
      .eq('ticker', ticker.toUpperCase())
      .single();

    if (error || !data) {
      return null;
    }

    return data.id;
  } catch (error) {
    console.error(`Error fetching company ID for ${ticker}:`, error);
    return null;
  }
}

async function main() {
  console.log('Starting S&P 500 logo download...');
  console.log(`Total tickers: ${SP500_TICKERS.length}`);

  const results: Array<{
    ticker: string;
    success: boolean;
    error?: string;
  }> = [];

  let successCount = 0;
  let failCount = 0;

  // Process in batches to avoid overwhelming the API
  const BATCH_SIZE = 10;
  const DELAY_BETWEEN_BATCHES = 2000; // 2 seconds

  for (let i = 0; i < SP500_TICKERS.length; i += BATCH_SIZE) {
    const batch = SP500_TICKERS.slice(i, i + BATCH_SIZE);
    console.log(`\nProcessing batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} tickers)...`);

    const batchPromises = batch.map(async (ticker) => {
      // Get company ID if company exists in database
      const companyId = await getCompanyIdFromTicker(ticker);
      
      const result = await downloadAndUploadLogo(
        ticker,
        companyId || '',
        ticker, // Use ticker as name if we don't have company name
        (step, details) => {
          console.log(`[${ticker}] ${step}`, details || '');
        }
      );

      return { ticker, ...result };
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Count successes and failures
    batchResults.forEach((result) => {
      if (result.success) {
        successCount++;
      } else {
        failCount++;
      }
    });

    console.log(
      `Batch complete. Progress: ${i + batch.length}/${SP500_TICKERS.length} | Success: ${successCount} | Failed: ${failCount}`
    );

    // Delay between batches (except for the last batch)
    if (i + BATCH_SIZE < SP500_TICKERS.length) {
      console.log(`Waiting ${DELAY_BETWEEN_BATCHES}ms before next batch...`);
      await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
    }
  }

  // Print summary
  console.log('\n=== Summary ===');
  console.log(`Total tickers processed: ${SP500_TICKERS.length}`);
  console.log(`Successful: ${successCount}`);
  console.log(`Failed: ${failCount}`);

  if (failCount > 0) {
    console.log('\nFailed tickers:');
    results
      .filter((r) => !r.success)
      .forEach((r) => {
        console.log(`  - ${r.ticker}: ${r.error || 'Unknown error'}`);
      });
  }

  console.log('\nLogo download complete!');
}

// Run the script
main()
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });

export { main as downloadSP500Logos };
