import type { GridProfile } from './profile-grid';
import type { MappingSpec } from './mapping-schema';
import { DATE_FORMATS } from './types';

/**
 * Deterministic, no-AI column mapper. Used when ANTHROPIC_API_KEY is
 * missing, when both AI attempts fail, and for `--no-ai` deterministic
 * fixture regression tests. Multilingual keyword matching plus the same
 * content-shape signals (looksDate/looksNumeric/looksIsin) the AI prompt is
 * given. It won't handle a language nobody has added keywords for, which is
 * exactly the gap AI mapping exists to close — this is the floor, not the
 * target.
 */

const KEYWORDS: Record<string, string[]> = {
  transactionType: ['transaction type', 'transaksjonstype', 'transaktionstyp', 'type', 'buchungstext', 'action'],
  tradeDate: ['trade date', 'handelsdag', 'handelsdatum', 'transaction date', 'date', 'datum', 'trade day'],
  settlementDate: ['settlement date', 'oppgjørsdag', 'oppgjorsdag', 'valuta datum'],
  symbol: ['ticker', 'symbol', 'stock'],
  isin: ['isin'],
  securityName: ['security', 'verdipapir', 'wertpapier', 'company', 'name', 'instrument', 'description'],
  quantity: ['quantity', 'antall', 'anzahl', 'shares', 'units', 'qty', 'stk'],
  price: ['price', 'kurs', 'preis', 'unit price', 'rate'],
  fees: ['fee', 'avgift', 'gebühr', 'gebuhr', 'commission', 'kurtasje'],
  fxRate: ['exchange rate', 'vekslingskurs', 'wechselkurs', 'fx rate', 'valutakurs'],
};

const BUY_WORDS = ['buy', 'bought', 'kjøpt', 'kjopt', 'kauf', 'gekauft', 'purchase', 'köp', 'kop'];
const SELL_WORDS = ['sell', 'sold', 'salg', 'verkauf', 'verkauft', 'sale', 'sälj', 'salj'];

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

function findByKeyword(columns: GridProfile['columns'], role: keyof typeof KEYWORDS, exclude: Set<number>): number | null {
  const words = KEYWORDS[role];
  for (const col of columns) {
    if (exclude.has(col.index)) continue;
    const header = normalize(col.header);
    if (words.some((w) => header === normalize(w) || header.includes(normalize(w)))) {
      return col.index;
    }
  }
  return null;
}

/** Currency columns are almost never uniquely named — fall back to a short,
 *  low-cardinality, all-uppercase-letters column (NOK/USD/EUR-shaped). */
function findCurrencyColumn(columns: GridProfile['columns'], exclude: Set<number>, nearIndex: number | null): number | null {
  const candidates = columns.filter(
    (c) => !exclude.has(c.index) && c.distinctValues && c.distinctValues.every((v) => /^[A-Z]{3}$/.test(v))
  );
  if (candidates.length === 0) return null;
  if (nearIndex === null) return candidates[0].index;
  return candidates.reduce((best, c) => (Math.abs(c.index - nearIndex) < Math.abs(best.index - nearIndex) ? c : best)).index;
}

export function heuristicMapping(profile: GridProfile, distinctTypeValues: string[]): MappingSpec {
  const { columns } = profile;
  const used = new Set<number>();

  const claim = (role: keyof typeof KEYWORDS): number | null => {
    const idx = findByKeyword(columns, role, used);
    if (idx !== null) used.add(idx);
    return idx;
  };

  const transactionType = claim('transactionType');
  const tradeDate = claim('tradeDate') ?? columns.find((c) => c.looksDate && !used.has(c.index))?.index ?? null;
  if (tradeDate !== null) used.add(tradeDate);
  const settlementDate = claim('settlementDate');
  const isin = claim('isin') ?? columns.find((c) => c.looksIsin && !used.has(c.index))?.index ?? null;
  if (isin !== null) used.add(isin);
  const securityName = claim('securityName');
  const symbol = claim('symbol');
  const quantity = claim('quantity') ?? columns.find((c) => c.looksNumeric && !used.has(c.index))?.index ?? null;
  if (quantity !== null) used.add(quantity);
  const price = claim('price') ?? columns.find((c) => c.looksNumeric && !used.has(c.index))?.index ?? null;
  if (price !== null) used.add(price);
  const fees = claim('fees');
  const fxRate = claim('fxRate');

  const priceCurrency = findCurrencyColumn(columns, used, price);
  if (priceCurrency !== null) used.add(priceCurrency);
  const grossCurrency = findCurrencyColumn(columns, used, null);
  if (grossCurrency !== null) used.add(grossCurrency);

  const decimalSeparator = profile.hints.decimalSeparatorGuess === 'COMMA' ? 'COMMA' : 'DOT';

  const transactionTypes = distinctTypeValues.map((value) => {
    const normalized = normalize(value);
    const action = BUY_WORDS.some((w) => normalized.includes(w))
      ? ('BUY' as const)
      : SELL_WORDS.some((w) => normalized.includes(w))
        ? ('SELL' as const)
        : ('IGNORE' as const);
    return { value, action };
  });
  if (!transactionTypes.some((t) => t.action === 'BUY')) {
    // Nothing recognized as a buy — the heuristic mapper has failed this
    // file. Let the caller's zod/guard layer catch it rather than silently
    // producing a spec that imports nothing.
  }

  const dateSamples = tradeDate !== null ? profile.sampleRows.map((r) => r[tradeDate]).filter(Boolean) : [];
  const isoDate = dateSamples.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));

  return {
    headerRowIndex: 0,
    dataStartRowIndex: 0,
    columns: {
      transactionType,
      tradeDate,
      settlementDate,
      symbol,
      isin,
      securityName,
      quantity,
      price,
      priceCurrency,
      grossAmount: null,
      grossCurrency,
      fees,
      fxRate,
      accountCurrency: null,
    },
    decimalSeparator,
    thousandsSeparator: 'NONE',
    negativeStyle: 'MINUS',
    dateFormat: (isoDate ? 'YYYY-MM-DD' : DATE_FORMATS[2]) as MappingSpec['dateFormat'], // DD.MM.YYYY default
    dateAmbiguous: !isoDate,
    quantitySign: 'ALWAYS_POSITIVE',
    transactionTypes,
    fileFormatLabel: 'Unrecognized format (heuristic mapping)',
    localeHint: null,
    confidence: 0.3,
    notes: 'Produced by the deterministic fallback mapper, not AI.',
  };
}
