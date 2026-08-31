import { createHash } from 'node:crypto';
import { decodeBytes } from './decode';
import { sniffDelimiter } from './delimiter';
import { parseGrid } from './grid';
import { profileGrid } from './profile-grid';
import { inferMappingSpec } from './infer-mapping';
import { applyMapping } from './apply-mapping';
import type { Grid, RawTransaction, IgnoredRow, RowError, ConsistencyReport } from './types';
import type { MappingSpec } from './mapping-schema';

export interface ParsedImport {
  fileName: string;
  encoding: string;
  delimiter: string;
  grid: Grid;
  spec: MappingSpec;
  specSource: 'ai' | 'heuristic';
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  transactions: RawTransaction[];
  ignored: IgnoredRow[];
  rowErrors: RowError[];
  consistency: ConsistencyReport;
  contentHash: string;
}

const MAX_FILE_ROWS = 5000;

export class ImportParseError extends Error {}

/**
 * The Phase 1 orchestrator: raw bytes in, a fully-resolved-format
 * ParsedImport out. Symbol resolution and DB writes are deliberately NOT
 * part of this function — those are per-security and per-transaction steps
 * that belong to the caller (resolve-security.ts, plan-replay.ts).
 */
export async function parseImportFile(
  bytes: Uint8Array,
  fileName: string,
  opts?: { useAi?: boolean }
): Promise<ParsedImport> {
  const contentHash = createHash('sha256').update(bytes).digest('hex');

  const decode = decodeBytes(bytes);
  const delim = sniffDelimiter(decode.text);
  const grid = parseGrid(decode.text, delim.delimiter);

  if (grid.rows.length === 0) {
    throw new ImportParseError('No data rows found in this file.');
  }
  if (grid.rows.length > MAX_FILE_ROWS) {
    throw new ImportParseError(`This file has ${grid.rows.length} rows, which is more than the ${MAX_FILE_ROWS} we can process in one import.`);
  }

  const profile = profileGrid(grid);

  const transactionTypeGuess = profile.columns.find((c) => c.header.toLowerCase().includes('type') || c.distinctCount <= 40);
  // The real distinct-value set for whichever column the mapper picks isn't
  // known until after inference — but for the mandatory 100%-coverage guard
  // we need it up front. Every low-cardinality column's distinct values are
  // already in the profile, so once we have the spec we re-derive the exact
  // set from the actual chosen column rather than this guess.
  void transactionTypeGuess;

  const distinctTypeValuesFor = (colIndex: number | null): string[] => {
    if (colIndex === null) return [];
    const col = profile.columns[colIndex];
    return col.distinctValues ?? Array.from(new Set(grid.rows.map((r) => r[colIndex]).filter(Boolean)));
  };

  // First pass: profile without knowing the type column yet, using every
  // low-cardinality column's full distinct set (already computed). Infer
  // the mapping; then re-validate transactionTypes coverage against the
  // ACTUAL chosen column (parseMappingSpec's guard 4 needs this to add any
  // values the model's sample missed for that specific column).
  const anyLowCardinalityValues = profile.columns.flatMap((c) => c.distinctValues ?? []);
  const inferred = await inferMappingSpec(fileName, decode, delim.delimiter, profile, anyLowCardinalityValues, opts);

  const realDistinctTypeValues = distinctTypeValuesFor(inferred.spec.columns.transactionType);
  const covered = new Set(inferred.spec.transactionTypes.map((t) => t.value));
  for (const v of realDistinctTypeValues) {
    if (!covered.has(v)) inferred.spec.transactionTypes.push({ value: v, action: 'IGNORE' });
  }

  const applied = applyMapping(grid, inferred.spec);

  return {
    fileName,
    encoding: decode.encoding,
    delimiter: delim.delimiter,
    grid,
    spec: inferred.spec,
    specSource: inferred.source,
    model: inferred.model,
    inputTokens: inferred.inputTokens,
    outputTokens: inferred.outputTokens,
    transactions: applied.transactions,
    ignored: applied.ignored,
    rowErrors: applied.rowErrors,
    consistency: applied.consistency,
    contentHash,
  };
}
