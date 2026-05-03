// Input Validation & Sanitization
// Prevents XSS, SQL injection, and malicious input

/**
 * Validates ticker symbol format
 * Tickers are typically 1-5 uppercase letters/numbers
 */
export function validateTicker(ticker: string): { valid: boolean; normalized?: string; error?: string } {
  if (!ticker || typeof ticker !== 'string') {
    return { valid: false, error: 'Ticker must be a string' };
  }

  // Trim and uppercase
  const normalized = ticker.trim().toUpperCase();

  if (normalized.length === 0) {
    return { valid: false, error: 'Ticker must be between 1 and 10 characters' };
  }

  // Pair symbols like BTC/USD or XAU/USD (up to 10 chars total)
  if (/^[A-Z0-9]{1,7}\/[A-Z]{2,4}$/.test(normalized)) {
    return { valid: true, normalized };
  }

  // Plain tickers: AAPL, BRK.B, BTC-USD slugs (up to 10 chars)
  if (normalized.length > 10) {
    return { valid: false, error: 'Ticker must be between 1 and 10 characters' };
  }
  if (!/^[A-Z0-9.\-]+$/.test(normalized)) {
    return { valid: false, error: 'Ticker contains invalid characters' };
  }

  return { valid: true, normalized };
}

/**
 * Validates UUID format
 */
export function validateUUID(uuid: string): boolean {
  if (!uuid || typeof uuid !== 'string') {
    return false;
  }
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validates search query
 * Prevents injection and limits length
 */
export function validateSearchQuery(query: string): { valid: boolean; sanitized?: string; error?: string } {
  if (!query || typeof query !== 'string') {
    return { valid: false, error: 'Search query must be a string' };
  }

  const trimmed = query.trim();

  // Treat whitespace-only like an empty search (avoid 400 from bots / bad links)
  if (trimmed.length === 0) {
    return { valid: true, sanitized: '' };
  }

  if (trimmed.length > 100) {
    return { valid: false, error: 'Search query too long (max 100 characters)' };
  }

  // Remove potentially dangerous characters but allow normal search terms
  // Allow letters, numbers, spaces, and common punctuation
  const sanitized = trimmed.replace(/[<>]/g, ''); // Remove HTML brackets

  return { valid: true, sanitized };
}

/**
 * Validates numeric limit parameter
 */
export function validateLimit(limit: string | null, max: number = 100, defaultLimit: number = 15): number {
  if (!limit) {
    return defaultLimit;
  }

  const parsed = parseInt(limit, 10);
  
  if (isNaN(parsed) || parsed < 1) {
    return defaultLimit;
  }

  return Math.min(parsed, max); // Cap at max
}

/**
 * Sanitizes string to prevent XSS
 * React already escapes, but this is extra protection for API responses
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  return input
    .replace(/[<>]/g, '') // Remove HTML brackets
    .trim()
    .slice(0, 10000); // Limit length
}

/**
 * Validates email format (basic)
 */
export function validateEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
}
