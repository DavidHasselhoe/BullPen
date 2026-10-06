/**
 * Which followed company a headline is about, read from the headline itself.
 *
 * The news feed's `related` field is the ticker that was queried, not what the
 * story covers (an Nvidia headline came back tagged AAPL), so it cannot pick
 * the logo. A headline names its company by ticker ("INTC, AMD, MU ...") or by
 * name ("Costco Is Down 10%"), and that is what this matches. No match means no
 * logo, never a guess.
 */

export interface FollowedCompany {
  symbol: string;
  name: string | null;
}

const SUFFIX = /\b(incorporated|inc|corporation|corp|company|co|holdings|holding|group|plc|ltd|limited|class [a-c]|common stock|n\.?v|s\.?a|ag|se)\b\.?/gi;
/** First words too generic to stand for one company on their own. */
const GENERIC = new Set(['advanced', 'american', 'general', 'united', 'first', 'international', 'national', 'global', 'the', 'new']);

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function nameKeys(name: string): string[] {
  const clean = name.replace(SUFFIX, ' ').replace(/[,.]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const keys = [clean];
  const first = clean.split(' ')[0];
  if (first.length >= 4 && !GENERIC.has(first.toLowerCase()) && first !== clean) keys.push(first);
  return keys;
}

export function matchFollowed(headline: string, followed: FollowedCompany[]): FollowedCompany | null {
  for (const c of followed) {
    // Tickers are matched case-sensitively and as whole words: "AMD" yes, "amd" or "T" in "TSLA" no.
    const sym = c.symbol.split('/')[0];
    if (sym.length >= 2 && new RegExp(`(^|[^A-Za-z0-9$])\\$?${escape(sym)}(?![A-Za-z0-9])`).test(headline)) return c;
    for (const key of c.name ? nameKeys(c.name) : []) {
      if (new RegExp(`\\b${escape(key)}(?![A-Za-z])`, 'i').test(headline)) return c;
    }
  }
  return null;
}
