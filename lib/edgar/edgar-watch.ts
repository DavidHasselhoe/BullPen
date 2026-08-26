/**
 * SEC EDGAR polling for "the moment a company's earnings 8-K goes public."
 *
 * WHY THIS EXISTS: TwelveData's /earnings only backfills (confirmed 2026-08-26
 * — actual results show up well after the fact, not at release time), and
 * nothing else in this codebase watches for a filing landing in real time.
 * Verified live against NVIDIA (CIK 1045810) before building this: every
 * quarterly earnings 8-K back to 2020 was filed same-day as the release,
 * tagged items "2.02,9.01" (Item 2.02 = Results of Operations), with the
 * actual press release and CFO commentary attached as separate .htm exhibits
 * (e.g. q1fy27pr.htm, q1fy27cfocommentary.htm) alongside the 8-K's own body
 * document (nvda-20260520.htm). The May 2026 filing landed at 16:21:19 ET —
 * about 20 minutes after the 4:00pm close — so polling this feed IS "the
 * moment it's public," not a laggy proxy for it.
 *
 * data.sec.gov requires a descriptive User-Agent identifying the requester
 * (SEC's fair-access policy: https://www.sec.gov/os/webmaster-faq#developers)
 * — SEC_EDGAR_USER_AGENT should be "<app name> <contact email>". No auth,
 * no API key, no rate-limit tier: this is the same public feed every EDGAR
 * scraper/terminal ultimately reads from.
 */

const DEFAULT_USER_AGENT = 'BullPen contact@bullpen.no';

function userAgent(): string {
  return process.env.SEC_EDGAR_USER_AGENT || DEFAULT_USER_AGENT;
}

function padCik(cik: string | number): string {
  return String(cik).replace(/\D/g, '').padStart(10, '0');
}

async function edgarFetch(url: string): Promise<Response> {
  return fetch(url, {
    headers: { 'User-Agent': userAgent(), Accept: 'application/json, text/html' },
  });
}

export interface EdgarFiling {
  form: string;
  filingDate: string; // YYYY-MM-DD
  accessionNumber: string; // e.g. "0001045810-26-000051"
  primaryDocument: string;
  items: string; // comma-separated, e.g. "2.02,9.01"
}

interface SubmissionsResponse {
  name?: string;
  filings?: {
    recent?: {
      form?: string[];
      filingDate?: string[];
      accessionNumber?: string[];
      primaryDocument?: string[];
      items?: string[];
    };
  };
}

/** Raw recent-filings list for a CIK, newest first (SEC's own order). */
export async function fetchRecentFilings(cik: string | number): Promise<EdgarFiling[]> {
  const paddedCik = padCik(cik);
  const res = await edgarFetch(`https://data.sec.gov/submissions/CIK${paddedCik}.json`);
  if (!res.ok) throw new Error(`SEC submissions fetch failed: ${res.status} for CIK ${paddedCik}`);
  const body = (await res.json()) as SubmissionsResponse;
  const r = body.filings?.recent;
  if (!r?.form) return [];
  return r.form.map((form, i) => ({
    form,
    filingDate: r.filingDate?.[i] ?? '',
    accessionNumber: r.accessionNumber?.[i] ?? '',
    primaryDocument: r.primaryDocument?.[i] ?? '',
    items: r.items?.[i] ?? '',
  }));
}

/**
 * Finds the newest 8-K with Item 2.02 (Results of Operations) filed on or
 * after `notBeforeDate` (YYYY-MM-DD, inclusive) — the "did the earnings 8-K
 * land yet" check a poller calls on an interval. Returns null when nothing
 * new is found yet, never throws on a transient fetch error (a poller should
 * just try again next tick, not crash the whole watch).
 */
export async function findEarnings8K(cik: string | number, notBeforeDate: string): Promise<EdgarFiling | null> {
  try {
    const filings = await fetchRecentFilings(cik);
    const hit = filings.find(
      (f) => f.form === '8-K' && f.items.split(',').includes('2.02') && f.filingDate >= notBeforeDate
    );
    return hit ?? null;
  } catch (err) {
    console.error(`[edgar-watch] findEarnings8K failed for CIK ${cik}:`, err);
    return null;
  }
}

export interface EdgarFilingFile {
  name: string;
  size: string; // bytes as a string, per SEC's index.json shape; "" for non-file rows
}

/** Every file in a filing's directory (the 8-K body, exhibits, XBRL, etc). */
export async function fetchFilingIndex(cik: string | number, accessionNumber: string): Promise<EdgarFilingFile[]> {
  const paddedCik = padCik(cik);
  const accNoDash = accessionNumber.replace(/-/g, '');
  const res = await edgarFetch(`https://www.sec.gov/Archives/edgar/data/${Number(paddedCik)}/${accNoDash}/index.json`);
  if (!res.ok) throw new Error(`SEC filing index fetch failed: ${res.status} for ${accessionNumber}`);
  const body = (await res.json()) as { directory?: { item?: EdgarFilingFile[] } };
  return body.directory?.item ?? [];
}

/**
 * Best-guess pick of the actual press release exhibit out of a filing's file
 * list — deliberately NOT hardcoded to a filename pattern like "q2fy27pr.htm"
 * (that pattern held for every NVDA quarter checked, but isn't guaranteed to
 * hold forever, and this needs to work for other tickers' 8-Ks too, whatever
 * their own naming convention is). Excludes the 8-K's own primaryDocument
 * (the cover/body page, not the release) and every non-.htm support file
 * (XBRL .xsd/.xml, images, .css/.js, the raw .txt dump, index pages), then
 * picks the largest remaining .htm file — the real press release is reliably
 * the biggest document in the filing (NVDA's ran 270KB+ vs the 8-K body's
 * ~27KB), while a same-day CFO commentary exhibit (also large) is a
 * legitimate secondary source `fetchExhibitText` can be pointed at
 * separately if guidance commentary isn't in the press release itself.
 */
export function pickPressReleaseFile(files: EdgarFilingFile[], primaryDocument: string): EdgarFilingFile | null {
  const candidates = files.filter(
    (f) => f.name.toLowerCase().endsWith('.htm') && f.name !== primaryDocument && !/index/i.test(f.name)
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((biggest, f) => (Number(f.size) > Number(biggest.size) ? f : biggest));
}

/** Same idea as pickPressReleaseFile, but specifically for a CFO-commentary-
 *  style guidance exhibit (name contains "commentary") — NVIDIA's own
 *  convention, used as a hint rather than a requirement; callers should
 *  treat a miss here as "no separate commentary doc, guidance must be in the
 *  press release itself" rather than an error. */
export function pickCommentaryFile(files: EdgarFilingFile[]): EdgarFilingFile | null {
  return files.find((f) => f.name.toLowerCase().endsWith('.htm') && /commentary/i.test(f.name)) ?? null;
}

/**
 * Fetches one exhibit and returns it as plain text — HTML tags stripped,
 * block-level boundaries (`<p>`, `<tr>`, `<div>`, `<br>`) converted to
 * newlines first so numbers in adjacent table cells don't get smashed
 * together (e.g. a revenue row's label and value read as one run-on token).
 * Good enough for an LLM extraction prompt, not meant to preserve exact
 * table structure.
 */
export async function fetchExhibitText(cik: string | number, accessionNumber: string, fileName: string): Promise<string> {
  const paddedCik = padCik(cik);
  const accNoDash = accessionNumber.replace(/-/g, '');
  const res = await edgarFetch(`https://www.sec.gov/Archives/edgar/data/${Number(paddedCik)}/${accNoDash}/${fileName}`);
  if (!res.ok) throw new Error(`SEC exhibit fetch failed: ${res.status} for ${fileName}`);
  const html = await res.text();
  return html
    .replace(/<(br|\/p|\/tr|\/div|\/li)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
