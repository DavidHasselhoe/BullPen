/**
 * Parses a 13F-HR "INFORMATION TABLE" XML document into aggregated holdings.
 *
 * Regex-based, not a real XML parser — no XML dependency exists in this repo
 * (confirmed before writing this), and the information table is flat,
 * non-nested, machine-generated XML with a fixed small tag set, matching the
 * house style already used for HTML-table parsing in lib/edgar/edgar-watch.ts's
 * fetchFilingIndex().
 *
 * Namespace prefixes are NOT consistent across filers — Berkshire Hathaway's
 * filing agent emits a plain default namespace (`<infoTable>`, no prefix),
 * but Bridgewater's emits everything prefixed (`<ns1:infoTable>`,
 * `<ns1:cusip>`, ...). Verified live: the unprefixed-only version of this
 * parser silently returned zero holdings for Bridgewater/Third
 * Point/Baupost's filings during Phase 1 validation, caught immediately
 * because "0 positions" is an impossible result for an active fund's 13F,
 * not a subtly-wrong number like the earlier value-scale bug. Every tag
 * pattern here now tolerates an optional `prefix:` before the tag name.
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

const PREFIX = '(?:[a-zA-Z0-9]+:)?';

/** SEC XML text content escapes &, <, >, etc. — decode standard XML entities
 *  (named + numeric) so e.g. "ELI LILLY &amp; CO" renders as "ELI LILLY & CO"
 *  instead of the literal escaped text. Single-pass so "&amp;lt;" (a literal
 *  "&lt;" in the source data) can't get double-decoded into "<". */
export function decodeXmlEntities(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (match, entity: string) => {
    switch (entity) {
      case 'amp': return '&';
      case 'lt': return '<';
      case 'gt': return '>';
      case 'quot': return '"';
      case 'apos': return "'";
      default:
        if (entity.startsWith('#x')) return String.fromCharCode(parseInt(entity.slice(2), 16));
        if (entity.startsWith('#')) return String.fromCharCode(Number(entity.slice(1)));
        return match;
    }
  });
}

function extractTag(block: string, tag: string): string | null {
  const re = new RegExp(`<${PREFIX}${tag}>([^<]*)</${PREFIX}${tag}>`, 'i');
  const m = re.exec(block);
  return m ? decodeXmlEntities(m[1].trim()) : null;
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
  const blockRe = new RegExp(`<${PREFIX}infoTable>[\\s\\S]*?</${PREFIX}infoTable>`, 'gi');
  const blocks = xml.match(blockRe) ?? [];
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
