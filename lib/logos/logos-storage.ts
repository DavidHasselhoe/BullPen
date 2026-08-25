// Logo Storage Operations
// Handles uploading logos to Supabase Storage

import { createServerClient } from '../supabase/client';

export interface StorageUploadResult {
  success: boolean;
  publicUrl?: string;
  path?: string;
  error?: string;
}

const LOGO_BUCKET = 'company-logos';

/** Every extension `uploadLogoToStorage` has ever written for a ticker. */
const KNOWN_LOGO_EXTENSIONS = ['png', 'jpg', 'jpeg', 'svg'];

/**
 * Removes any other-extension objects for a ticker after a successful upload,
 * so a ticker whose source (TwelveData vs logo.dev) or content-type changes
 * across runs doesn't leave an orphaned duplicate (e.g. `bac.svg` lingering
 * after a later run stores `bac.png`). Best-effort — a stray file left behind
 * on failure doesn't break anything, it just means the bucket stays slightly
 * less tidy until the next successful upload for that ticker.
 */
async function removeStaleLogoVariants(ticker: string, keepExtension: string): Promise<void> {
  const base = ticker.toLowerCase();
  const stalePaths = KNOWN_LOGO_EXTENSIONS.filter((ext) => ext !== keepExtension).map(
    (ext) => `${base}.${ext}`
  );
  if (stalePaths.length === 0) return;

  try {
    const supabase = createServerClient();
    await supabase.storage.from(LOGO_BUCKET).remove(stalePaths);
  } catch {
    // Non-fatal — cleanup is opportunistic, not required for correctness.
  }
}

/**
 * Returns the public URL for a company logo in Supabase Storage (read-only).
 * Built from NEXT_PUBLIC_SUPABASE_URL only — does NOT use the service-role client,
 * so market movers and other hot paths work when SUPABASE_SERVICE_ROLE_KEY is unset
 * (e.g. misconfigured Vercel env). Matches getPublicUrl() shape from @supabase/supabase-js.
 */
export function getStorageLogoUrl(ticker: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ?? '';
  if (!base) return '';
  const fileName = `${ticker.toLowerCase()}.jpg`;
  return `${base}/storage/v1/object/public/${LOGO_BUCKET}/${fileName}`;
}

/**
 * Uploads logo image to Supabase Storage
 * Supports PNG, JPG, and SVG formats
 */
export async function uploadLogoToStorage(
  ticker: string,
  imageBuffer: Buffer,
  mimeType: string
): Promise<StorageUploadResult> {
  const supabase = createServerClient();

  try {
    // Determine file extension from mime type
    let extension = 'png'; // Default
    if (mimeType.includes('svg')) {
      extension = 'svg';
    } else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
      extension = 'jpg';
    } else if (mimeType.includes('png')) {
      extension = 'png';
    }

    const fileName = `${ticker.toLowerCase()}.${extension}`;

    // Convert Buffer to Blob for Supabase Storage
    // Supabase Storage accepts Blob, File, ArrayBuffer, or Buffer
    // But Buffer sometimes needs to be converted to Blob for better compatibility
    const blob = new Blob([imageBuffer], { type: mimeType });

    // Upload to Supabase Storage
    const { error } = await supabase.storage
      .from(LOGO_BUCKET)
      .upload(fileName, blob, {
        contentType: mimeType,
        upsert: true,
        cacheControl: 'public, max-age=31536000',
      });

    if (error) {
      // Log detailed error for debugging
      console.error(`[Logo Storage] Upload failed for ${ticker}:`, {
        error: error.message,
        code: error.statusCode || error.status || 'unknown',
        fileName,
        bucket: LOGO_BUCKET,
        mimeType,
        bufferSize: imageBuffer.length,
      });

      // If bucket doesn't exist, create it
      if (error.message.includes('Bucket not found') || error.message.includes('does not exist') || error.statusCode === '404' || error.status === '404') {
        // Note: Bucket creation requires admin privileges
        // This should be done manually or via migration script
        return {
          success: false,
          error: `Storage bucket '${LOGO_BUCKET}' does not exist. Please create it in Supabase Dashboard > Storage.`,
        };
      }

      // Check for permission errors
      if (error.message.includes('new row violates row-level security') || error.message.includes('permission denied') || error.statusCode === '401' || error.statusCode === '403' || error.status === '401' || error.status === '403') {
        return {
          success: false,
          error: `Permission denied. Please check Supabase Storage RLS policies for bucket '${LOGO_BUCKET}'. Ensure authenticated users can upload files.`,
        };
      }

      return {
        success: false,
        error: `${error.message} (Code: ${error.statusCode || error.status || 'unknown'})`,
      };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(LOGO_BUCKET)
      .getPublicUrl(fileName);

    if (!urlData?.publicUrl) {
      return {
        success: false,
        error: 'Failed to generate public URL',
      };
    }

    // Clean up any other-extension leftovers for this ticker so the bucket
    // never holds two objects for the same company.
    await removeStaleLogoVariants(ticker, extension);

    return {
      success: true,
      publicUrl: urlData.publicUrl,
      path: fileName,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Checks if logo already exists in storage
 */
export async function logoExistsInStorage(ticker: string): Promise<boolean> {
  const supabase = createServerClient();

  try {
    // Check for any extension (png, jpg, svg)
    const extensions = ['png', 'jpg', 'svg'];
    const fileName = ticker.toLowerCase();
    const bucket = 'company-logos';

    for (const ext of extensions) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list('', {
          search: `${fileName}.${ext}`,
        });

      if (!error && data?.some((file) => file.name === `${fileName}.${ext}`)) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}
