/**
 * Dow 30 constituent tickers.
 * Source: State Street's DIA ETF daily holdings disclosure (it holds all 30 Dow Jones Industrial Average stocks).
 * Auto-synced weekly by scripts/sync-index-constituents.ts — do not hand-edit,
 * changes will be overwritten on the next sync run.
 * Last synced: 2026-10-20
 */
export const DOW30_TICKERS: string[] = [
  'AAPL', 'AMGN', 'AMZN', 'AXP', 'BA', 'CAT', 'CRM', 'CSCO', 'CVX', 'DIS',
  'GOOGL', 'GS', 'HD', 'HON', 'IBM', 'JNJ', 'JPM', 'KO', 'MCD', 'MMM',
  'MRK', 'MSFT', 'NKE', 'NVDA', 'PG', 'SHW', 'TRV', 'UNH', 'V', 'WMT',
];
