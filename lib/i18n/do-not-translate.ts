/**
 * Tokens the catalog translation script (scripts/translate-locales.ts) must
 * pass through unchanged in every target language. Two categories:
 *  - Brand: feature names stay English everywhere for brand consistency
 *    (a French user should still recognize "Ask Bull" if they've seen it
 *    referenced in English-language content elsewhere).
 *  - Domain: standard financial abbreviations that are the same term in
 *    every one of these 7 languages' financial press — translating "P/E"
 *    would produce something a beginner investor wouldn't recognize from
 *    any other source they read.
 *
 * Deliberately NOT here: "AI". Unlike the tickers/abbreviations above, "AI"
 * has well-established native abbreviations in German ("KI") and French
 * ("IA") — forcing it to stay literal "AI" produced translations Haiku
 * correctly localized (e.g. "KI-Tiefenanalyse") that the validator then
 * rejected for not containing the substring "AI". Verified live 2026-08-26
 * on deepDiveTitle/deepDiveTickerTitle in de/tools.json.
 */
export const DO_NOT_TRANSLATE = [
  // Brand
  'BullPen',
  'BullPen Pro',
  'Bull',
  'Ask Bull',
  'Pro',
  // Financial abbreviations
  'P/E',
  'P/S',
  'P/B',
  'EPS',
  'ROE',
  'ROIC',
  'ROA',
  'EBITDA',
  'FCF',
  'TTM',
  'YoY',
  'CAGR',
  'ETF',
  'IPO',
  'SEC',
  '10-K',
  '10-Q',
  '8-K',
  'GAAP',
  'RSI',
  'MACD',
  'SMA',
  'EMA',
  'S&P 500',
  'SPY',
  'SPY: S&P 500',
  'VIX',
  'HYG/LQD',
  'SPY/TLT',
] as const;
