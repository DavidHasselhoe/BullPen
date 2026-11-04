import Anthropic from '@anthropic-ai/sdk';

// Transcription, not interpretation: every price and share count lands in
// someone's cost basis, so this uses the most accurate model. Low effort is
// enough, the work is copying cells, not reasoning about them.
const PDF_MODEL = 'claude-opus-5-5';
const NO_TRANSACTIONS = 'NO_TRANSACTIONS';

const SYSTEM_PROMPT = `You transcribe brokerage statements and trade confirmations from PDF into CSV.

Find every table in the document that lists individual transactions (buys, sells, and any other activity rows in the same table). Output those rows as one CSV:
- The first line is a header row using the table's own column names.
- One CSV line per transaction row, across all pages. A table that continues on the next page is the same table: do not repeat its header.
- Copy every cell exactly as printed: the same dates, numbers, decimal and thousands separators, currency codes, signs, and wording. Do not convert, round, translate, or fill in anything that is not printed.
- If the same table repeats per account or per security, merge them and add a column for whatever distinguishes them (for example the account name or the security name printed above each table).
- Use a comma as the delimiter and wrap every field in double quotes, doubling any double quote inside a field.
- Leave out summaries, subtotals, totals, page headers and footers, and holdings or balance tables that are not transaction rows.

Output only the CSV text, with no code fences and no commentary. If the document has no transaction rows at all, output exactly ${NO_TRANSACTIONS}.`;

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

export interface PdfToCsvResult {
  csv: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Turns a PDF statement into CSV text that the normal import pipeline
 * (decode, delimiter sniff, AI column mapping, review grid) can take from
 * there, so a PDF gets the same review and fix-up step as any CSV.
 */
export async function pdfToCsv(bytes: Uint8Array): Promise<PdfToCsvResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new PdfExtractionError('PDF import is not available right now. Please upload a CSV export instead.', { model: PDF_MODEL, inputTokens: 0, outputTokens: 0 });
  }

  // Streamed: a long statement can produce tens of thousands of output
  // tokens, past what a non-streaming request allows before timing out.
  const message = await getAnthropic()
    .messages.stream({
      model: PDF_MODEL,
      max_tokens: 64000,
      output_config: { effort: 'low' },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from(bytes).toString('base64') } },
            { type: 'text', text: 'Transcribe the transaction rows in this document as CSV.' },
          ],
        },
      ],
    })
    .finalMessage();

  const usage = { model: PDF_MODEL, inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens };

  if (message.stop_reason === 'refusal') {
    throw new PdfExtractionError("We couldn't read this PDF. Please upload a CSV export from your broker instead.", usage);
  }
  // A cut-off transcription would silently drop the last transactions,
  // which is worse than refusing the file.
  if (message.stop_reason === 'max_tokens') {
    throw new PdfExtractionError('This PDF has more transactions than we can read in one go. Split it into smaller date ranges, or upload a CSV export.', usage);
  }

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()
    .replace(/^```[a-z]*\n?/i, '')
    .replace(/\n?```$/, '')
    .trim();

  if (!text || text === NO_TRANSACTIONS) {
    throw new PdfExtractionError("We couldn't find any buy or sell transactions in this PDF.", usage);
  }

  return { csv: text, ...usage };
}

/** The PDF couldn't be turned into transactions. Carries the tokens spent, so the caller can still log the cost. */
export class PdfExtractionError extends Error {
  constructor(
    message: string,
    readonly usage: { model: string; inputTokens: number; outputTokens: number }
  ) {
    super(message);
  }
}
