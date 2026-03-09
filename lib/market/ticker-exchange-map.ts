/**
 * Maps stock tickers to their primary exchange codes.
 * Used for "My Holdings" mode to filter Market Hours to relevant exchanges.
 *
 * Fallback: US tickers (most common) → NYSE, NASDAQ.
 * Nordic/European tickers mapped where known.
 */

// Tickers that trade on non-US exchanges (extend as needed)
const TICKER_TO_EXCHANGE: Record<string, string> = {
  // Nordic
  'YAR': 'OSE',
  'DNB': 'OSE',
  'EQNR': 'OSE',
  'NHY': 'OSE',
  'TEL': 'OSE',
  'VOLV-B': 'STO',
  'ERIC-B': 'STO',
  'SEB-A': 'STO',
  'SAND': 'STO',
  'ASSA-B': 'STO',
  'AZN': 'LSE', // UK primary
  'HSBA': 'LSE',
  'GSK': 'LSE',
  'BP': 'LSE',
  'SAP': 'XETRA',
  'SIE': 'XETRA',
  'ALV': 'XETRA',
  'MC': 'EPA',
  'SAN': 'BME',
  'ENI': 'BIT',
  'OR': 'EPA',
  'NESN': 'SIX',
  'ROG': 'SIX',
  'NOVN': 'SIX',
};

/** US exchanges - default for most BullPen tickers (SEC filers) */
const US_EXCHANGES = ['NYSE', 'NASDAQ'];

/**
 * Returns exchange codes for a ticker. Most US-listed stocks trade on NYSE or NASDAQ.
 */
export function getExchangesForTicker(ticker: string): string[] {
  const normalized = ticker.toUpperCase();
  const exchange = TICKER_TO_EXCHANGE[normalized];
  if (exchange) {
    return [exchange];
  }
  // Default: US exchanges (most BullPen companies are US SEC filers)
  return US_EXCHANGES;
}

/**
 * Returns unique exchange codes for a list of tickers.
 */
export function getExchangesForTickers(tickers: string[]): string[] {
  const seen = new Set<string>();
  for (const ticker of tickers) {
    for (const ex of getExchangesForTicker(ticker)) {
      seen.add(ex);
    }
  }
  return Array.from(seen);
}
