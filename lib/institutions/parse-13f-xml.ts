/**
 * Parses a 13F-HR "INFORMATION TABLE" XML document into aggregated holdings.
 *
 * Regex-based, not a real XML parser — no XML dependency exists in this repo
 * (confirmed before writing this), and the information table is flat,
 * non-nested, machine-generated XML with a fixed small tag set, matching the
 * house style already used for HTML-table parsing in lib/edgar/edgar-watch.ts's
 * fetchFilingIndex(). Verified live against Berkshire Hathaway's 2026-08-14
 * 13F-HR (accession 0001193125-26-352200): uses a plain default namespace
 * (`xmlns="http://www.sec.gov/edgar/document/thirteenf/informationtable"`,
 * no prefix), so unprefixed tag matching works directly — no namespace
 * handling needed. If a future filer's XML turns out to use a namespace
 * prefix, this needs an optional `[a-z0-9]+:` prefix in the tag patterns;
 * not added speculatively since the one real filing checked doesn't need it.
 *
 * CRITICAL: a single filing can contain MULTIPLE <infoTable> entries for the
 * SAME CUSIP — verified live on the same Berkshire filing (89 raw <infoTable>
 * rows, only 29 distinct CUSIPs). This happens when a manager files on behalf
 * of multiple sub-accounts/other-managers, each reporting their own slice of
 * the same position. parseInfoTable() aggregates by CUSIP within one filing
 * (summing value + shares) so the stored holding reflects the manager's true
 * aggregate position, not an inflated per-sub-account row count.
 */

export interface Raw13FHolding {
  cusip: string;
  nameOfIssuer: string;
  valueUsd: number;
  shares: number;
  shareType: string | null;   // 'SH' | 'PRN'
  putCall: string | null;     // 'PUT' | 'CALL' | null for plain equity
}

function extractTag(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i');
  const m = re.exec(block);
  return m ? m[1].trim() : null;
}

/**
 * Parses <periodOfReport> (MM-DD-YYYY, e.g. "06-30-2026") from a 13F cover
 * page XML (primary_doc.xml — a separate file from the information table)
 * into an ISO date string. Returns null if absent/malformed rather than
 * throwing — callers should fall back to the filing date, which is close
 * but not exact (period_of_report is the quarter-end the filing covers,
 * filed up to 45 days later).
 */
export function parsePeriodOfReport(coverPageXml: string): string | null {
  const raw = extractTag(coverPageXml, 'periodOfReport');
  if (!raw) return null;
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(raw);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

/** Parses every <infoTable> block, aggregating multiple entries for the same CUSIP. */
export function parseInfoTable(xml: string): Raw13FHolding[] {
  const blocks = xml.match(/<infoTable>[\s\S]*?<\/infoTable>/gi) ?? [];
  const byCusip = new Map<string, Raw13FHolding>();

  for (const block of blocks) {
    const cusip = extractTag(block, 'cusip');
    const nameOfIssuer = extractTag(block, 'nameOfIssuer');
    const valueRaw = extractTag(block, 'value');
    const sshPrnamt = extractTag(block, 'sshPrnamt');
    if (!cusip || !nameOfIssuer || !valueRaw || !sshPrnamt) continue; // malformed row, skip rather than throw

    // <value> is already whole USD in the current SEC 13F XML schema
    // (schemaVersion X0202, the format in effect since 2023) — NOT
    // thousands, which was the pre-2023 convention. Verified live against
    // Berkshire Hathaway's 2026-08-14 filing: AAPL's raw <value> divided by
    // its <sshPrnamt> share count comes out to ~$289/share, a plausible
    // real AAPL price; treating the field as thousands (an easy mistake,
    // since it's the widely-cited older convention) inflated every holding
    // 1000x on the first ingestion run, caught by the Phase 1 validation
    // spot-check before this ever reached real users.
    const valueUsd = Number(valueRaw);
    const shares = Number(sshPrnamt);
    if (!isFinite(valueUsd) || !isFinite(shares)) continue;

    const shareType = extractTag(block, 'sshPrnamtType');
    const putCall = extractTag(block, 'putCall');

    const existing = byCusip.get(cusip);
    if (existing) {
      existing.valueUsd += valueUsd;
      existing.shares += shares;
    } else {
      byCusip.set(cusip, { cusip, nameOfIssuer, valueUsd, shares, shareType, putCall });
    }
  }

  return Array.from(byCusip.values());
}
