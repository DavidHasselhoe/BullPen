import type { Grid } from './types';

interface TokenizedRecord {
  fields: string[];
  /** 1-based physical line number of this record's FIRST line in the
   *  original file — the number a user would see if they opened the file
   *  in a text editor. Tracked separately from the record index because a
   *  quoted field can contain a real newline, which must still advance the
   *  physical line count without ending the record. */
  startLine: number;
}

/**
 * Quote-aware tokenizer: a single character state machine over the whole
 * text, not `split('\n')` first. Handles RFC4180 `""` escapes and embedded
 * newlines inside quoted fields. Line-ending normalization (`\r\n`/`\r` ->
 * `\n`) must happen before calling this, and is safe to do globally — a
 * literal `\r` inside a quoted field is vanishingly rare in practice.
 */
export function tokenizeRecords(text: string, delimiter: string): TokenizedRecord[] {
  const records: TokenizedRecord[] = [];
  let fields: string[] = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let recordStartLine = 1;
  let sawAnyField = false;

  const pushField = () => {
    fields.push(field);
    field = '';
  };
  const pushRecord = () => {
    pushField();
    // Skip fully-empty trailing records (e.g. a trailing newline at EOF).
    if (fields.length > 1 || fields[0] !== '') {
      records.push({ fields, startLine: recordStartLine });
    }
    fields = [];
    sawAnyField = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
      continue;
    }

    if (ch === '"' && field === '') {
      inQuotes = true;
      sawAnyField = true;
      continue;
    }
    if (ch === delimiter) {
      pushField();
      sawAnyField = true;
      continue;
    }
    if (ch === '\n') {
      if (!sawAnyField && field === '') {
        // Blank line between records — don't emit an empty record, but do
        // advance the "next record starts here" line marker.
        line++;
        recordStartLine = line;
        continue;
      }
      pushRecord();
      line++;
      recordStartLine = line;
      continue;
    }
    field += ch;
    sawAnyField = true;
  }

  // Final record if the file doesn't end with a newline.
  if (sawAnyField || field !== '') {
    pushRecord();
  }

  return records;
}

/**
 * Builds a positional Grid from decoded text. Duplicate header names (e.g.
 * "Valuta" appearing five times in a Nordnet export) are preserved verbatim
 * in `header` — rows stay `string[][]`, never collapsed into an object that
 * would silently overwrite repeated keys.
 */
export function parseGrid(text: string, delimiter: string): Grid {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const records = tokenizeRecords(normalized, delimiter);

  if (records.length === 0) {
    return { header: [], headerLabels: [], rows: [], sourceLines: [], columnCount: 0, ragged: [] };
  }

  const [headerRecord, ...dataRecords] = records;
  const header = headerRecord.fields.map((h) => h.trim());
  const columnCount = header.length;

  const seen = new Map<string, number>();
  const headerLabels = header.map((h) => {
    const count = (seen.get(h) ?? 0) + 1;
    seen.set(h, count);
    return count === 1 ? h : `${h} (${count})`;
  });

  const rows: string[][] = [];
  const sourceLines: number[] = [];
  const ragged: number[] = [];

  dataRecords.forEach((rec, idx) => {
    let fields = rec.fields;
    if (fields.length !== columnCount) {
      ragged.push(idx);
      if (fields.length < columnCount) {
        fields = [...fields, ...new Array(columnCount - fields.length).fill('')];
      } else {
        fields = fields.slice(0, columnCount);
      }
    }
    rows.push(fields);
    sourceLines.push(rec.startLine);
  });

  return { header, headerLabels, rows, sourceLines, columnCount, ragged };
}
