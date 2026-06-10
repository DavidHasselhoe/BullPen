/**
 * Curated starter set for the Dividend Calculator quick-pick — a clean mix of
 * well-known dividend payers and notably high-yield names. Tickers only; live
 * yields are computed by the calculator, so nothing here goes stale.
 */
export interface DividendPick {
  ticker: string;
  name: string;
  /** Flags the notably high-yield names so the UI can group/badge them. */
  highYield?: boolean;
}

export const DIVIDEND_QUICK_PICKS: DividendPick[] = [
  { ticker: 'SCHD', name: 'Schwab US Dividend ETF' },
  { ticker: 'KO', name: 'Coca-Cola' },
  { ticker: 'PEP', name: 'PepsiCo' },
  { ticker: 'JNJ', name: 'Johnson & Johnson' },
  { ticker: 'PG', name: 'Procter & Gamble' },
  { ticker: 'XOM', name: 'Exxon Mobil' },
  { ticker: 'ABBV', name: 'AbbVie' },
  { ticker: 'O', name: 'Realty Income', highYield: true },
  { ticker: 'VZ', name: 'Verizon', highYield: true },
  { ticker: 'MO', name: 'Altria', highYield: true },
  { ticker: 'T', name: 'AT&T', highYield: true },
  { ticker: 'PFE', name: 'Pfizer', highYield: true },
];
