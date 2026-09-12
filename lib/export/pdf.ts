/**
 * PDF export, sharing its row model with the CSV writer.
 *
 * jsPDF and its autotable plugin are ~350KB together and are only ever needed
 * after a user clicks Export, so they are imported inside the function rather
 * than at module scope. `lib/market-data/index-sync.ts` does the same with
 * `xlsx` for the same reason; keep it that way, because a static import here
 * pulls the whole thing into the screener and holdings page bundles.
 */

import { cleanNumber, downloadBlob } from './csv';

export interface PdfDocument {
  /** Shown large at the top of page 1. */
  title: string;
  /** `key: value` pairs printed under the title (date, currency, filters). */
  meta?: Record<string, string>;
  headers: string[];
  rows: (string | number | null | undefined)[][];
  /**
   * Columns whose values are numeric and should sit right-aligned. Indices into
   * `headers`. Left-aligned is the default, which is right for names and dates
   * and wrong for every figure.
   */
  numericColumns?: number[];
  /** Landscape is the sane default for anything past ~8 columns. */
  orientation?: 'portrait' | 'landscape';
}

/** Signal Emerald, matching DESIGN.md's brand value, as the RGB jsPDF wants. */
const BRAND: [number, number, number] = [4, 120, 87];
const INK: [number, number, number] = [23, 23, 23];
const MUTED: [number, number, number] = [115, 115, 115];

export async function downloadPdf(filename: string, doc: PdfDocument): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const orientation = doc.orientation ?? (doc.headers.length > 8 ? 'landscape' : 'portrait');
  const pdf = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 40;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.setTextColor(...INK);
  pdf.text(doc.title, margin, 46);

  let y = 62;
  if (doc.meta) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(...MUTED);
    for (const [key, value] of Object.entries(doc.meta)) {
      if (!value) continue;
      pdf.text(`${key}: ${value}`, margin, y);
      y += 12;
    }
  }

  const columnStyles: Record<number, { halign: 'right' }> = {};
  for (const i of doc.numericColumns ?? []) columnStyles[i] = { halign: 'right' };

  autoTable(pdf, {
    head: [doc.headers],
    // Same cleaning as the CSV, so the two formats can never disagree about a
    // figure (63.663000000000004 in one and 63.663 in the other).
    body: doc.rows.map((r) =>
      r.map((c) => (c == null ? '' : typeof c === 'number' ? String(cleanNumber(c)) : String(c)))
    ),
    startY: y + 8,
    margin: { left: margin, right: margin, bottom: 44 },
    styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 4, textColor: INK, lineColor: [229, 229, 229], lineWidth: 0.5 },
    headStyles: { fillColor: BRAND, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles,
    // Without this a long company name forces one very wide column and squeezes
    // every figure; 'linebreak' wraps the name instead.
    tableWidth: 'auto',
    overflow: 'linebreak',
    didDrawPage: () => {
      const page = pdf.getNumberOfPages();
      const height = pdf.internal.pageSize.getHeight();
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(...MUTED);
      pdf.text('bullpen.no', margin, height - 24);
      pdf.text(`Page ${page}`, pageWidth - margin, height - 24, { align: 'right' });
      // Not advice, and it has to survive the file being forwarded on.
      pdf.text('Informational only, not financial advice.', pageWidth / 2, height - 24, { align: 'center' });
    },
  });

  downloadBlob(filename, pdf.output('blob'));
}
