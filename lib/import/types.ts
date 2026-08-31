/**
 * Shared types for the AI-powered transaction import pipeline. Zero
 * dependencies so every module here stays importable from a plain `tsx`
 * script, not just from the Next.js server runtime.
 */

export type TransactionAction = 'BUY' | 'SELL';

export interface Grid {
  /** Raw header cells, duplicates preserved verbatim (e.g. five "Valuta" columns). */
  header: string[];
  /** Display-disambiguated header labels: "Valuta", "Valuta (2)", ... */
  headerLabels: string[];
  /** Always positional. Never collapsed into Record<string,string> — a
   *  repeated header name would silently overwrite itself. */
  rows: string[][];
  /** rows[i] came from this 1-based physical line of the original file. */
  sourceLines: number[];
  columnCount: number;
  /** Indices into `rows` that were padded or truncated to columnCount. */
  ragged: number[];
}

export interface DecodeResult {
  text: string;
  encoding: 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252';
  hadBom: boolean;
}

export interface DelimiterResult {
  delimiter: string;
  confidence: number;
  scores: Record<string, number>;
}

export type NumberDecimalSeparator = 'DOT' | 'COMMA';
export type NumberThousandsSeparator = 'NONE' | 'DOT' | 'COMMA' | 'SPACE' | 'APOSTROPHE';
export type NegativeStyle = 'MINUS' | 'PARENS' | 'TRAILING_MINUS';

export interface NumberStyle {
  decimal: NumberDecimalSeparator;
  thousands: NumberThousandsSeparator;
}

export const DATE_FORMATS = [
  'YYYY-MM-DD', 'YYYY/MM/DD', 'DD.MM.YYYY', 'DD/MM/YYYY', 'DD-MM-YYYY',
  'MM/DD/YYYY', 'MM-DD-YYYY', 'DD.MM.YY', 'MM/DD/YY', 'DD/MM/YY',
  'DD-MMM-YYYY', 'MMM DD, YYYY', 'YYYYMMDD',
] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

export interface RawTransaction {
  sourceLine: number;
  action: TransactionAction;
  date: string | null; // YYYY-MM-DD once parsed
  rawDate: string;
  quantity: number | null;
  rawQuantity: string;
  price: number | null;
  rawPrice: string;
  /** sha1(isin ?? `${normalizedName}|${priceCurrency}`) — dedupe key for resolution. */
  securityKey: string;
  isin: string | null;
  rawSymbol: string | null;
  name: string | null;
  priceCurrency: string | null;
  grossAmount: number | null;
  grossCurrency: string | null;
}

export interface RowError {
  sourceLine: number;
  code: 'bad_date' | 'bad_quantity' | 'bad_price' | 'missing_identifier' | 'future_date';
}

export interface IgnoredRow {
  sourceLine: number;
  typeValue: string;
}

export interface ConsistencyReport {
  checked: number;
  failed: number;
  verdict: 'ok' | 'suspect' | 'insufficient_data';
}
