import { z } from 'zod';
import { DATE_FORMATS } from './types';

const toUpper = (v: unknown) => (typeof v === 'string' ? v.toUpperCase() : v);

const ColRef = z.number().int().min(0).nullable();

export const MappingSpecSchema = z.object({
  headerRowIndex: z.number().int().min(0).max(50),
  dataStartRowIndex: z.number().int().min(0),

  columns: z.object({
    transactionType: ColRef,
    tradeDate: ColRef,
    settlementDate: ColRef,
    symbol: ColRef,
    isin: ColRef,
    securityName: ColRef,
    quantity: ColRef,
    price: ColRef,
    priceCurrency: ColRef,
    grossAmount: ColRef,
    grossCurrency: ColRef,
    fees: ColRef,
    fxRate: ColRef,
    accountCurrency: ColRef,
  }),

  decimalSeparator: z.preprocess(toUpper, z.enum(['DOT', 'COMMA'])),
  thousandsSeparator: z.preprocess(toUpper, z.enum(['NONE', 'DOT', 'COMMA', 'SPACE', 'APOSTROPHE'])),
  negativeStyle: z.preprocess(toUpper, z.enum(['MINUS', 'PARENS', 'TRAILING_MINUS'])).default('MINUS'),
  dateFormat: z.preprocess(toUpper, z.enum(DATE_FORMATS)),
  dateAmbiguous: z.boolean().default(false),

  quantitySign: z.preprocess(toUpper, z.enum(['ALWAYS_POSITIVE', 'SIGNED'])).default('ALWAYS_POSITIVE'),

  // Must cover every distinct value supplied for the transaction-type column.
  transactionTypes: z
    .array(
      z.object({
        value: z.string().min(1).max(80),
        action: z.preprocess(toUpper, z.enum(['BUY', 'SELL', 'IGNORE'])),
      })
    )
    .min(1)
    .max(80),

  fileFormatLabel: z.string().max(60),
  localeHint: z.string().max(10).nullable(),
  confidence: z.number().min(0).max(1),
  notes: z.string().max(400).default(''),
});

export type MappingSpec = z.infer<typeof MappingSpecSchema>;

export class MappingSpecError extends Error {}

/** Strip markdown fences the model sometimes adds despite instructions. */
export function stripFences(raw: string): string {
  return raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
}

/** Find the first {...} JSON object in a blob — last-resort recovery if the model adds prose. */
export function extractJsonObject(raw: string): string {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return raw;
  return raw.slice(start, end + 1);
}

/**
 * Parses and validates the model's raw text output, then runs the
 * code-side guards zod can't express (cross-field consistency, coverage of
 * every distinct transaction-type value). Throws MappingSpecError with a
 * specific reason on any failure — the caller uses this to decide whether
 * to retry on a stronger model.
 */
export function parseMappingSpec(raw: string, columnCount: number, distinctTypeValues: string[]): MappingSpec {
  if (!raw || raw.trim().length === 0) {
    throw new MappingSpecError('Model returned empty response');
  }

  const stripped = stripFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    try {
      parsed = JSON.parse(extractJsonObject(stripped));
    } catch (innerErr) {
      throw new MappingSpecError(`JSON parse failed: ${innerErr}`);
    }
  }

  const result = MappingSpecSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new MappingSpecError(`Schema validation failed: ${issues}`);
  }
  const spec = result.data;

  // Guard 1: every non-null column index is within bounds.
  for (const [role, idx] of Object.entries(spec.columns)) {
    if (idx !== null && (idx < 0 || idx >= columnCount)) {
      throw new MappingSpecError(`Column "${role}" index ${idx} is out of bounds (file has ${columnCount} columns)`);
    }
  }

  // Guard 2: the required fields for a transaction file must be present.
  const { transactionType, tradeDate, quantity, price, symbol, isin, securityName } = spec.columns;
  if (transactionType === null || tradeDate === null || quantity === null || price === null) {
    throw new MappingSpecError('Missing one of the required columns: transactionType, tradeDate, quantity, price');
  }
  if (symbol === null && isin === null && securityName === null) {
    throw new MappingSpecError('No security identifier column found (symbol, isin, and securityName are all null)');
  }

  // Guard 3: no two roles point at the same index, except the three
  // currency roles, which may legitimately share one "Valuta"-style column.
  const currencyRoles = new Set(['priceCurrency', 'grossCurrency', 'accountCurrency']);
  const seen = new Map<number, string>();
  for (const [role, idx] of Object.entries(spec.columns)) {
    if (idx === null) continue;
    const existing = seen.get(idx);
    if (existing && !(currencyRoles.has(role) && currencyRoles.has(existing))) {
      throw new MappingSpecError(`Columns "${existing}" and "${role}" both point at index ${idx}`);
    }
    seen.set(idx, role);
  }

  // Guard 4: transactionTypes must cover every distinct value we supplied.
  // Anything uncovered defaults to IGNORE and is reported, never dropped.
  const covered = new Set(spec.transactionTypes.map((t) => t.value));
  const uncovered = distinctTypeValues.filter((v) => !covered.has(v));
  if (uncovered.length > 0) {
    spec.transactionTypes.push(...uncovered.map((value) => ({ value, action: 'IGNORE' as const })));
  }

  // Guard 5: at least one type must map to BUY, or nothing will ever import.
  if (!spec.transactionTypes.some((t) => t.action === 'BUY')) {
    throw new MappingSpecError('No transaction type maps to BUY');
  }

  return spec;
}
