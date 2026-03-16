// Logo Fetcher
// Fetches company logos from img.logo.dev API
// Deterministic, cached, legal

import { logger } from '@/lib/utils/logger';

/**
 * Fetches logo image from img.logo.dev API
 */
export interface LogoFetchResult {
  success: boolean;
  imageBuffer?: Buffer;
  mimeType?: string;
  source: 'logo.dev' | null;
  error?: string;
}

/**
 * Logo.dev API key. Server-only (LOGO_DEV_KEY). No fallback — never hardcode or use NEXT_PUBLIC_.
 */
function getLogoDevKey(): string {
  const key = process.env.LOGO_DEV_KEY;
  if (!key?.trim()) {
    throw new Error(
      'LOGO_DEV_KEY environment variable is required for logo fetching. Set it in .env.local.'
    );
  }
  return key.trim();
}

/**
 * Fetches company logo from img.logo.dev API
 * Downloads the image and returns it as a buffer for storage
 */
export async function fetchLogoFromLogoDev(ticker: string): Promise<LogoFetchResult> {
  try {
    // According to Logo.dev documentation: https://docs.logo.dev/logo-images/stock-tickers
    // The endpoint format is: https://img.logo.dev/ticker/{TICKER}?token={TOKEN}
    const apiKey = getLogoDevKey();
    const logoUrl = `https://img.logo.dev/ticker/${ticker.toUpperCase()}?token=${apiKey}`;
    
    // Fetch the logo image
    const response = await fetch(logoUrl, {
      headers: {
        'User-Agent': 'BullPen Analytics',
        'Accept': 'image/*',
      },
    });

    if (!response.ok) {
      // Log detailed error
      const errorText = await response.text().catch(() => 'Unable to read error response');
      logger.error(`[Logo Fetcher] Fetch failed for ${ticker}`, null, {
        status: response.status,
        statusText: response.statusText,
        url: logoUrl.replace(apiKey, '***'),
        errorText: errorText.substring(0, 200),
      });
      
      // 404 or other error - logo not available for this ticker
      if (response.status === 404) {
        return {
          success: false,
          source: null,
          error: `Logo not found on img.logo.dev for ticker ${ticker}`,
        };
      }
      
      // Rate limit or API key issues
      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          source: null,
          error: `Authentication failed. Please check your Logo.dev API key (LOGO_DEV_KEY).`,
        };
      }
      
      if (response.status === 429) {
        return {
          success: false,
          source: null,
          error: `Rate limit exceeded. Please wait before retrying.`,
        };
      }
      
      return {
        success: false,
        source: null,
        error: `Failed to fetch logo: ${response.status} ${response.statusText}`,
      };
    }

    // Get the image as a buffer
    const arrayBuffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);
    
    // Get content type from response
    const contentType = response.headers.get('content-type') || 'image/png';
    
    // Validate that we got an image
    if (!contentType.startsWith('image/')) {
      return {
        success: false,
        source: null,
        error: `Invalid content type: ${contentType}. Expected image/*`,
      };
    }

    // Validate buffer is not empty
    if (imageBuffer.length === 0) {
      return {
        success: false,
        source: null,
        error: 'Fetched logo is empty',
      };
    }

    return {
      success: true,
      imageBuffer,
      mimeType: contentType,
      source: 'logo.dev',
    };
  } catch (error) {
    logger.error(`[Logo Fetcher] Exception fetching logo for ${ticker}`, error);
    return {
      success: false,
      source: null,
      error: error instanceof Error ? error.message : 'Unknown error fetching logo',
    };
  }
}
