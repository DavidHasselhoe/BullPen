/**
 * Short, human company names ("Nebius", not "Nebius Group N.V. Class A
 * Ordinary Shares"). Beginners know companies by name, not by the listing's
 * legal and share-class wording. Client-safe: no I/O (display-names.ts adds
 * the database lookup on top for server routes).
 */

// Trailing legal/share-class noise, stripped repeatedly until none is left.
// Share-class words need a space before them, so "Bancshares" and
// "Bankshares" survive; a bare "Shares" only goes after "Class X", so fund
// names like "SPDR Gold Shares" keep theirs.
const TRAILING = new RegExp(
  '(?:,|\\s-)?\\s+(?:' + [
    '(?:sponsored\\s+)?(?:american\\s+)?depositary\\s+(?:shares?|receipts?)(?:\\s*\\(common stock\\))?',
    'ad[rs]',
    '(?:limited|subordinate)\\s+voting\\s+shares',
    '(?:ny|new\\s+york)\\s+regist(?:ered|ry)\\s+shares?',
    '(?:ordinary|common)\\s+shares?',
    'class [a-c]\\s+shares',
    'common stock',
    'non-?voting',
    'class [a-c]',
    'inc\\.?', 'incorporated', 'corporation', 'corp\\.?', 'company', 'and company', '& co\\.?', 'co\\.?',
    'plc', 'n\\.v\\.', 's\\.a\\.', 'se', 'ag', 'a/s', 'ltd\\.?', 'limited', 'holdings?', 'group', 'l\\.p\\.',
  ].join('|') + ')\\s*,?\\s*$',
  'i',
);

// Companies the public knows by their acronym, not their legal name.
const KNOWN_AS: Record<string, string> = { IBM: 'IBM', AMD: 'AMD' };

/** Pass the ticker when there is one, so IBM stays "IBM" rather than "International Business Machines". */
export function displayCompanyName(raw: string, ticker?: string): string {
  const known = ticker && KNOWN_AS[ticker.toUpperCase()];
  if (known) return known;
  let name = raw.trim().replace(/^the\s+/i, '');
  let prev;
  do {
    prev = name;
    // A dangling "&"/"and" is what's left of "McCormick & Company".
    name = name.replace(TRAILING, '').replace(/,\s*$/, '').replace(/\s+(?:&|and)$/i, '').trim();
  } while (name !== prev);
  return name || raw.trim();
}
