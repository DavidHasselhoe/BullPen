/**
 * Which AI assistant sent a visit, if any, from the referrer and utm_source
 * PostHog already sees. Answers from these tools are a growing way people
 * find a finance site (docs/research/2026-10-08-seo-trial-conversion), and in
 * PostHog they otherwise hide among hundreds of referring domains, or as
 * "direct" when the app strips the referrer but keeps ChatGPT's utm_source.
 *
 * ponytail: a hand-kept list. A new assistant shows up as an unknown
 * referring domain until it is added here.
 */
const SOURCES: [RegExp, string][] = [
  [/(^|\.)(chatgpt\.com|chat\.openai\.com|openai\.com)$/, 'chatgpt'],
  [/(^|\.)perplexity\.ai$/, 'perplexity'],
  [/(^|\.)(gemini\.google\.com|bard\.google\.com)$/, 'gemini'],
  [/(^|\.)(copilot\.microsoft\.com|copilot\.cloud\.microsoft)$/, 'copilot'],
  [/(^|\.)claude\.ai$/, 'claude'],
  [/(^|\.)(grok\.com|x\.ai)$/, 'grok'],
  [/(^|\.)meta\.ai$/, 'meta-ai'],
  [/(^|\.)(chat\.deepseek\.com|deepseek\.com)$/, 'deepseek'],
  [/(^|\.)(you\.com|phind\.com|poe\.com|kagi\.com)$/, 'other-ai'],
];

const UTM_WORDS: Record<string, string> = {
  chatgpt: 'chatgpt',
  openai: 'chatgpt',
  perplexity: 'perplexity',
  gemini: 'gemini',
  copilot: 'copilot',
  claude: 'claude',
};

/** The assistant's name, e.g. 'chatgpt', or null for any other visit. */
export function aiSource(referrer: string, utmSource: string | null): string | null {
  let host = '';
  try {
    host = referrer ? new URL(referrer).hostname.toLowerCase() : '';
  } catch {
    host = '';
  }
  const utm = (utmSource ?? '').trim().toLowerCase();
  for (const [re, name] of SOURCES) {
    if ((host && re.test(host)) || (utm && re.test(utm))) return name;
  }
  // utm_source is free text ("chatgpt", "perplexity"). Only names nothing else
  // uses: "meta" is also what Facebook ads are tagged with.
  return UTM_WORDS[utm] ?? null;
}
