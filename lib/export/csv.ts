/**
 * One CSV writer for every export in the app.
 *
 * There used to be two, written independently. The holdings one was careful
 * (escaped every cell, prepended a BOM, emitted CRLF); the screener one quoted
 * only the company name, shipped no BOM, and joined on "\n". This module is the
 * holdings implementation, generalised, so a fix lands in one place.
 */

/** RFC 4180: quote a field only when it contains a delimiter, quote or newline. */
export function csvEscape(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Fixed-decimal number, or '' for null/undefined/NaN/Infinity. */
export function csvNum(value: number | null | undefined, dp = 2): string {
  return value == null || !Number.isFinite(value) ? '' : value.toFixed(dp);
}

/**
 * Share counts carry up to 6 decimals (fractional shares, crypto), but trailing
 * zeros on a whole number read as fake precision, so 10 stays "10".
 */
export function csvShares(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '' : String(Number(value.toFixed(6)));
}

export interface CsvDocument {
  headers: string[];
  rows: (string | number | null | undefined)[][];
  /**
   * Lines written above the header as `# key: value` comments. Spreadsheets
   * show them as text in column A and every CSV parser worth using can skip
   * them, which is a fair trade for a file that says when it was exported and
   * what was in scope. Without this a screener export is untraceable the moment
   * it leaves the browser.
   */
  meta?: Record<string, string>;
}

/**
 * Strips IEEE-754 display noise without choosing a decimal place.
 *
 * Column values arrive as raw JS numbers, so a percent computed as
 * 0.63663 * 100 serialises as "63.663000000000004" and a yield as
 * "0.23831299999999997". Rounding to a fixed dp would be wrong across columns
 * that legitimately span market caps and sub-percent yields; 12 significant
 * digits is past the precision any of this data actually carries, so it clears
 * the artefact and leaves every real digit alone.
 */
export function cleanNumber(value: number): number {
  return Number.isFinite(value) ? Number(value.toPrecision(12)) : value;
}

function cell(value: string | number | null | undefined): string {
  if (value == null) return '';
  return typeof value === 'number' ? String(cleanNumber(value)) : String(value);
}

export function buildCsv({ headers, rows, meta }: CsvDocument): string {
  const lines: string[] = [];
  if (meta) {
    for (const [key, value] of Object.entries(meta)) {
      if (value) lines.push(csvEscape(`# ${key}: ${value}`));
    }
    lines.push('');
  }
  lines.push(headers.map((h) => csvEscape(h)).join(','));
  for (const row of rows) {
    lines.push(row.map((value) => csvEscape(cell(value))).join(','));
  }
  return lines.join('\r\n');
}

/**
 * Hands the browser a file.
 *
 * The BOM is what makes Excel read the file as UTF-8 instead of the system
 * codepage; without it accented company names arrive mojibaked. The anchor is
 * appended to the document and the object URL is revoked on a later tick
 * because revoking synchronously after .click() cancels the download in
 * Firefox and Safari.
 */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadCsv(filename: string, content: string): void {
  downloadBlob(filename, new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' }));
}

/** `bullpen-holdings-2026-09-12`, the stem shared by both formats. */
export function exportStem(kind: string): string {
  return `bullpen-${kind}-${new Date().toISOString().slice(0, 10)}`;
}
