// Logo Orchestrator
// Coordinates logo fetching, storage, and database updates using img.logo.dev API

import { fetchLogoFromLogoDev } from './logo-fetcher';
import { uploadLogoToStorage } from './logos-storage';
import { logger } from '@/lib/utils/logger';
import { updateCompanyLogo } from './logos-db';
import { logoExistsInStorage, getStorageLogoUrl } from './logos-storage';

export interface LogoIngestionResult {
  success: boolean;
  logoUrl?: string | null;
  source?: 'logo.dev' | null;
  error?: string;
}

export type LogoProgressCallback = (step: string, details?: any) => void;

/**
 * Ingests logo for a company using img.logo.dev API
 * Fetches, stores, and links logo
 */
export async function ingestCompanyLogo(
  ticker: string,
  companyName: string,
  companyId: string,
  onProgress?: LogoProgressCallback
): Promise<LogoIngestionResult> {
  try {
    onProgress?.('Fetching logo from img.logo.dev', { ticker, companyName });

    // Step 1: Fetch logo from img.logo.dev
    const fetchResult = await fetchLogoFromLogoDev(ticker);

    if (!fetchResult.success || !fetchResult.imageBuffer || !fetchResult.mimeType) {
      onProgress?.('Logo not found on img.logo.dev', { ticker, error: fetchResult.error });
      return {
        success: false,
        logoUrl: null,
        source: null,
        error: fetchResult.error || 'Logo not found',
      };
    }

    onProgress?.('Logo fetched', { 
      source: fetchResult.source, 
      size: fetchResult.imageBuffer.length,
      mimeType: fetchResult.mimeType
    });

    // Step 2: Upload to Supabase Storage
    onProgress?.('Uploading to storage', { 
      ticker,
      bufferSize: fetchResult.imageBuffer.length,
      mimeType: fetchResult.mimeType 
    });
    
    const uploadResult = await uploadLogoToStorage(
      ticker,
      fetchResult.imageBuffer,
      fetchResult.mimeType
    );

    if (!uploadResult.success || !uploadResult.publicUrl) {
      logger.error(`[Logo Orchestrator] Upload failed for ${ticker}`, null, {
        error: uploadResult.error,
        ticker,
        bufferSize: fetchResult.imageBuffer.length,
        mimeType: fetchResult.mimeType,
      });
      
      onProgress?.('Upload failed', { 
        error: uploadResult.error,
        ticker,
        details: 'Check console logs for more information'
      });
      
      return {
        success: false,
        logoUrl: null,
        source: null,
        error: uploadResult.error || 'Failed to upload logo to storage',
      };
    }

    onProgress?.('Logo uploaded', { url: uploadResult.publicUrl });

    // Step 3: Update database
    onProgress?.('Updating database', { ticker });
    const dbUpdateResult = await updateCompanyLogo(
      companyId,
      uploadResult.publicUrl,
      'brand' // img.logo.dev provides brand logos
    );

    if (!dbUpdateResult.success) {
      onProgress?.('Database update failed', { error: dbUpdateResult.error });
      return {
        success: false,
        logoUrl: uploadResult.publicUrl, // URL exists but DB update failed
        source: fetchResult.source,
        error: dbUpdateResult.error || 'Failed to update database',
      };
    }

    onProgress?.('Logo ingestion completed', { ticker, url: uploadResult.publicUrl });

    return {
      success: true,
      logoUrl: uploadResult.publicUrl,
      source: fetchResult.source,
    };
  } catch (error) {
    onProgress?.('Logo ingestion error', { error: error instanceof Error ? error.message : 'Unknown error' });
    return {
      success: false,
      logoUrl: null,
      source: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Ensures a logo exists in storage for the given ticker.
 * If missing: fetches from Logo.dev, uploads to Supabase. No DB update, no company required.
 * Returns the storage URL for display.
 */
export async function ensureLogoForTicker(ticker: string): Promise<{ success: boolean; logoUrl?: string; error?: string }> {
  try {
    const normalizedTicker = ticker?.trim().toUpperCase();
    if (!normalizedTicker) {
      return { success: false, error: 'Missing ticker' };
    }

    // Already in storage - return URL
    const exists = await logoExistsInStorage(normalizedTicker);
    if (exists) {
      return { success: true, logoUrl: getStorageLogoUrl(normalizedTicker) };
    }

    // Fetch from Logo.dev and upload
    const fetchResult = await fetchLogoFromLogoDev(normalizedTicker);
    if (!fetchResult.success || !fetchResult.imageBuffer || !fetchResult.mimeType) {
      return { success: false, error: fetchResult.error || 'Logo not found' };
    }

    const uploadResult = await uploadLogoToStorage(
      normalizedTicker,
      fetchResult.imageBuffer,
      fetchResult.mimeType
    );

    if (!uploadResult.success || !uploadResult.publicUrl) {
      return { success: false, error: uploadResult.error || 'Upload failed' };
    }

    return { success: true, logoUrl: uploadResult.publicUrl };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
