import type { DelimiterResult } from './types';
import { tokenizeRecords } from './grid';

const CANDIDATES = ['\t', ';', ',', '|'] as const;
/** Tie-break order when scores are equal or absent — tab and semicolon are
 *  the delimiters comma-only parsers get wrong, so they're checked first. */
const PRIORITY: Record<string, number> = { '\t': 0, ';': 1, ',': 2, '|': 3 };

/**
 * Sniffs the field delimiter by actually tokenizing a sample with each
 * candidate and scoring how consistent the resulting field count is —
 * rather than just counting character occurrences, which a quoted field
 * full of commas would throw off.
 */
export function sniffDelimiter(text: string): DelimiterResult {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Respect an explicit Excel directive, e.g. `sep=;` on line 1.
  const sepDirective = /^sep=(.)/i.exec(normalized);
  if (sepDirective) {
    return { delimiter: sepDirective[1], confidence: 1, scores: { [sepDirective[1]]: 1 } };
  }

  const sampleText = normalized.split('\n').slice(0, 30).join('\n');
  const scores: Record<string, number> = {};

  for (const delim of CANDIDATES) {
    const records = tokenizeRecords(sampleText, delim).slice(0, 30);
    if (records.length < 2) {
      scores[delim] = 0;
      continue;
    }
    const counts = new Map<number, number>();
    for (const r of records) {
      counts.set(r.fields.length, (counts.get(r.fields.length) ?? 0) + 1);
    }
    let modalCount = 0;
    let modalFields = 1;
    for (const [fields, count] of counts) {
      if (count > modalCount) {
        modalCount = count;
        modalFields = fields;
      }
    }
    if (modalFields <= 1) {
      scores[delim] = 0;
      continue;
    }
    const consistency = modalCount / records.length;
    scores[delim] = consistency * Math.min(modalFields, 40);
  }

  let best = CANDIDATES[0] as string;
  let bestScore = -1;
  for (const delim of CANDIDATES) {
    const score = scores[delim];
    if (score > bestScore || (score === bestScore && PRIORITY[delim] < PRIORITY[best])) {
      bestScore = score;
      best = delim;
    }
  }

  const maxPossible = Math.max(...Object.values(scores), 1);
  return { delimiter: best, confidence: bestScore / maxPossible, scores };
}
