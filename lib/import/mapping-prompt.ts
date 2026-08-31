import type { GridProfile } from './profile-grid';
import type { DecodeResult } from './types';

export const MAPPING_SYSTEM_PROMPT = `You map the columns of a brokerage transaction export to a fixed schema. You never read or transform the data itself. You only identify WHICH COLUMN INDEX holds each field, and how numbers and dates in this file are formatted.

The file may be in any language. Column headers repeat: a header name is NOT a reliable key. Always answer with the zero-based COLUMN INDEX shown in brackets.

Critical rules:
- "price" is the per-unit trade price in the security's own currency. "grossAmount" is the total booked to the account, usually in the ACCOUNT currency, usually a different currency. They are different fields. Never map grossAmount to price.
- "priceCurrency" is the currency the PRICE column is denominated in — the security's OWN market currency, which for a foreign holding is usually NOT the account's settlement currency. When several columns share the same header (e.g. five columns all called "Valuta"), do NOT pick by proximity to the price column. Instead use this tell: the account/settlement currency column is constant (its "distinct" count is 1, since one account has one home currency across every row), while the true security/trade currency column VARIES across rows (multiple distinct values, e.g. USD | NOK | EUR) because different holdings trade in different currencies. Prefer the varying column for priceCurrency, and prefer a column paired with a "purchase value" / "trade value" / gross-value-in-security-currency field over one paired with the plain account-debit amount.
- transactionTypes must contain an entry for EVERY value listed under distinctValues for the transaction-type column. Deposits, withdrawals, dividends, dividend tax, interest, fees, platform fees, transfers, corporate actions, currency exchanges and share-count adjustments are all IGNORE. Only an actual purchase of securities is BUY and an actual disposal is SELL.
- decimalSeparator: if any numeric cell has a separator followed by a run of digits whose length is not exactly 3, that separator is the decimal separator.
- dateFormat: choose from the enumerated list. Set dateAmbiguous true only when both day-first and month-first readings are consistent with every date in the file.
- Do not invent a column. Use null when the file does not have that field.

Output ONLY a JSON object matching EXACTLY this shape and these key names — do not rename, add, remove, or restructure any key. Every value inside "columns" is either a zero-based column index (a number) or null. "transactionTypes" is an ARRAY with one entry per distinct value, never an object/map:

{
  "headerRowIndex": 0,
  "dataStartRowIndex": 1,
  "columns": {
    "transactionType": <index or null>,
    "tradeDate": <index or null>,
    "settlementDate": <index or null>,
    "symbol": <index or null>,
    "isin": <index or null>,
    "securityName": <index or null>,
    "quantity": <index or null>,
    "price": <index or null>,
    "priceCurrency": <index or null>,
    "grossAmount": <index or null>,
    "grossCurrency": <index or null>,
    "fees": <index or null>,
    "fxRate": <index or null>,
    "accountCurrency": <index or null>
  },
  "decimalSeparator": "DOT" or "COMMA",
  "thousandsSeparator": "NONE" or "DOT" or "COMMA" or "SPACE" or "APOSTROPHE",
  "negativeStyle": "MINUS" or "PARENS" or "TRAILING_MINUS",
  "dateFormat": one of "YYYY-MM-DD","YYYY/MM/DD","DD.MM.YYYY","DD/MM/YYYY","DD-MM-YYYY","MM/DD/YYYY","MM-DD-YYYY","DD.MM.YY","MM/DD/YY","DD/MM/YY","DD-MMM-YYYY","MMM DD, YYYY","YYYYMMDD",
  "dateAmbiguous": true or false,
  "quantitySign": "ALWAYS_POSITIVE" or "SIGNED",
  "transactionTypes": [
    { "value": "<the exact distinct value from the file>", "action": "BUY" or "SELL" or "IGNORE" }
  ],
  "fileFormatLabel": "<short human label, e.g. \\"Nordnet transactions (Norwegian)\\">",
  "localeHint": "<BCP-47 locale or null, e.g. \\"nb-NO\\">",
  "confidence": <number 0 to 1>,
  "notes": "<any caveat, or empty string>"
}

No prose, no markdown fences, no extra keys, no renamed keys.`;

function formatColumn(col: GridProfile['columns'][number]): string {
  const lines: string[] = [];
  const flags = [col.looksNumeric && 'numeric', col.looksDate && 'date', col.looksIsin && 'isin-like'].filter(Boolean).join(' ');
  lines.push(`[${col.index}] "${col.header}"  ${flags}  ${col.distinctCount} distinct  nonEmpty=${(col.nonEmptyRatio * 100).toFixed(0)}%`);
  if (col.distinctValues) {
    lines.push(`     ALL VALUES: ${col.distinctValues.join(' | ')}`);
  } else {
    lines.push(`     e.g. ${col.samples.join(' | ')}`);
  }
  return lines.join('\n');
}

export function buildMappingUserPrompt(fileName: string, decode: DecodeResult, delimiter: string, profile: GridProfile): string {
  const parts: string[] = [];
  const delimLabel = delimiter === '\t' ? 'TAB' : delimiter === ';' ? 'SEMICOLON' : delimiter === ',' ? 'COMMA' : 'PIPE';
  parts.push(`FILE: ${fileName}  ·  ${profile.rowCount} data rows  ·  ${profile.columns.length} columns  ·  ${decode.encoding}  ·  ${delimLabel}-delimited`);
  parts.push('');
  parts.push('COLUMNS');
  parts.push(...profile.columns.map(formatColumn));

  const dupEntries = Object.entries(profile.hints.duplicateHeaders);
  if (dupEntries.length > 0) {
    parts.push('');
    for (const [name, positions] of dupEntries) {
      parts.push(`NOTE duplicate header "${name}" at indices [${positions.join(', ')}]`);
    }
  }

  parts.push('');
  parts.push('SAMPLE ROWS (index-aligned, cells truncated)');
  profile.sampleRows.forEach((row, i) => {
    parts.push(`row ${profile.sampleRowIndices[i]} | ${row.join(' | ')}`);
  });

  return parts.join('\n');
}
