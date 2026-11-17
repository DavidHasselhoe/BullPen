/**
 * "Describe a theme" watchlist fill: up to 5 stocks from our own database that
 * match a free-text theme. Two cheap Haiku passes, no web search:
 *   1. Shortlist: the whole $1B+ catalogue (ticker|name|industry, prompt-cached)
 *      plus the theme -> up to 20 candidate tickers.
 *   2. Pick: those candidates with their business descriptions -> at most 5
 *      whose description shows real exposure, each with a one-line reason.
 * The model never adds a ticker: every answer is filtered against the set it
 * was shown. Picks only, no sizing or risk (that's the Portfolio Builder).
 */

import { generateText, type LanguageModelUsage } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { createServerClient } from '@/lib/supabase/client';
import { logAiCall } from '@/lib/billing/log-ai-call';
import { getCompanyProfile } from '@/lib/twelvedata/twelvedata-client';
import { tryReserveOrganicCredits } from '@/lib/twelvedata/credit-budget';
import { languageName, isSupportedLanguage } from '@/lib/i18n/language-names';
import { displayCompanyName } from '@/lib/market-data/company-name';

export const AI_PICK_MODEL = 'claude-haiku-5-5';
export const AI_PICK_MIN_MARKET_CAP = 1_000_000_000;
export const AI_PICK_MAX = 5;
export const AI_THEME_MAX_CHARS = 120;
const SHORTLIST_MAX = 20;
const CATALOGUE_TTL_MS = 6 * 60 * 60 * 1000;

export interface AiPick {
  ticker: string;
  name: string;
  logoUrl: string | null;
  reason: string;
}

interface CatalogueRow {
  ticker: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  market_cap: number | null;
  logo_url: string | null;
}

// ponytail: per-instance memory cache; a cold lambda pays ~3 Supabase pages once.
let catalogueCache: { at: number; rows: CatalogueRow[]; text: string } | null = null;

async function loadCatalogue() {
  if (catalogueCache && Date.now() - catalogueCache.at < CATALOGUE_TTL_MS) return catalogueCache;
  const supabase = createServerClient();
  const rows: CatalogueRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('screener_stats')
      .select('ticker, name, sector, industry, market_cap, logo_url')
      .gte('market_cap', AI_PICK_MIN_MARKET_CAP)
      .order('ticker')
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as CatalogueRow[]));
    if (!data || data.length < 1000) break;
  }
  // Stable order and format so the cached prompt prefix stays byte-identical.
  const text = rows.map((r) => `${r.ticker}|${r.name ?? ''}|${r.industry ?? r.sector ?? ''}`).join('\n');
  catalogueCache = { at: Date.now(), rows, text };
  return catalogueCache;
}

const SHORTLIST_SYSTEM = `You help an investing app find stocks that fit a theme a user describes. Below is the complete list of stocks you may choose from, one per line as TICKER|Company name|Industry.

Return up to ${SHORTLIST_MAX} tickers from this list that plausibly have real business exposure to the user's theme, most likely first. Think about which companies actually make the products, own the assets or sell the services the theme is about, not which ones merely share a broad sector. Cast a slightly wide net: a later step reads each company's business description and drops the weak ones.

Only use tickers that appear in the list. If nothing fits, return an empty array. Reply with only a JSON array of ticker strings, e.g. ["AAA","BBB"].

STOCK LIST:
`;

function pickSystem(language: string) {
  return `You choose stocks for a watchlist theme an investor described. You get candidate companies with their business descriptions. Keep at most ${AI_PICK_MAX} whose description shows direct, material exposure to the theme. Being in a related sector is not enough: for "AI power infrastructure", a utility that only sells electricity to homes does not qualify, while a company that builds data-center power systems, sells power under contracts to data centers, or makes grid equipment for them does. If fewer than ${AI_PICK_MAX} truly fit, return fewer. If none fit, return [].

Order them best fit first. For each, write one short plain sentence (about 15 words, never over 120 characters) on how the business ties to the theme, written in ${language}, for a beginner investor. Use the description for facts but write about the company itself: never say "its description", "the description" or similar. No hype, no price talk, no advice to buy, no dashes to join clauses.

Reply with only JSON: [{"ticker":"AAA","reason":"..."}]`;
}

/**
 * The LAST parseable JSON array in the model's text, [] if none. Haiku sometimes
 * answers, notices a mistake and answers again ("Wait, some of those aren't in
 * the list ... Final answer: [...]"), so the final array is the one it meant.
 */
export function parseJsonArray(text: string): unknown[] {
  for (let start = text.lastIndexOf('['); start >= 0; start = text.lastIndexOf('[', start - 1)) {
    for (let end = text.lastIndexOf(']'); end > start; end = text.lastIndexOf(']', end - 1)) {
      try {
        const parsed = JSON.parse(text.slice(start, end + 1));
        if (Array.isArray(parsed)) return parsed;
      } catch { /* try a shorter span */ }
    }
    if (start === 0) break;
  }
  return [];
}

function logUsage(userId: string | null, feature: string, usage: LanguageModelUsage, metadata: Record<string, unknown>) {
  void logAiCall({
    userId,
    feature,
    model: AI_PICK_MODEL,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cache: {
      noCacheTokens: usage.inputTokenDetails?.noCacheTokens,
      cacheReadTokens: usage.inputTokenDetails?.cacheReadTokens,
      cacheWriteTokens: usage.inputTokenDetails?.cacheWriteTokens,
    },
    metadata,
  });
}

/** Descriptions for the shortlist; fetches /profile (10 credits) for a miss only when the budget admits it. */
async function loadDescriptions(tickers: string[]): Promise<Map<string, string>> {
  const supabase = createServerClient();
  const { data } = await supabase.from('company_descriptions').select('ticker, description').in('ticker', tickers);
  const map = new Map((data ?? []).map((r: { ticker: string; description: string }) => [r.ticker, r.description]));
  const missing = tickers.filter((t) => !map.has(t));
  const fetched = await Promise.all(missing.map(async (ticker) => {
    if (!(await tryReserveOrganicCredits(10))) return null;
    try {
      const p = await getCompanyProfile(ticker);
      return p.description && p.description.length >= 40 ? { ticker, description: p.description } : null;
    } catch {
      return null;
    }
  }));
  const rows = fetched.filter((r): r is { ticker: string; description: string } => r !== null);
  if (rows.length) {
    void supabase.from('company_descriptions').upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() }))).then(() => {});
    for (const r of rows) map.set(r.ticker, r.description);
  }
  return map;
}

/**
 * Logs the shortlist call as `watchlist_ai_fill_shortlist` and the pick call as
 * `watchlist_ai_fill` only when it returned picks, so the quota counts one
 * generation per useful result and an empty one is free.
 */
export async function pickStocksForTheme(userId: string | null, theme: string, locale: string): Promise<AiPick[]> {
  const catalogue = await loadCatalogue();
  const byTicker = new Map(catalogue.rows.map((r) => [r.ticker, r]));
  const meta = { theme };

  const shortlistRes = await generateText({
    model: anthropic(AI_PICK_MODEL),
    messages: [
      {
        role: 'system',
        content: SHORTLIST_SYSTEM + catalogue.text,
        providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
      },
      { role: 'user', content: `Theme: ${theme}` },
    ],
    // Our own system message, there only to carry the cache breakpoint.
    allowSystemInMessages: true,
    maxOutputTokens: 3000, // thinking counts toward this cap on Haiku 5.5
    providerOptions: { anthropic: { effort: 'low' } },
  });
  logUsage(userId, 'watchlist_ai_fill_shortlist', shortlistRes.usage, meta);

  const shortlist = [...new Set(
    parseJsonArray(shortlistRes.text)
      .map((t) => (typeof t === 'string' ? t.trim().toUpperCase() : ''))
      .filter((t) => byTicker.has(t))
  )].slice(0, SHORTLIST_MAX);
  if (shortlist.length === 0) return [];

  // Relevance has to come from what the business does, so a candidate we can't
  // describe is dropped rather than judged on its name.
  const descriptions = await loadDescriptions(shortlist);
  const described = shortlist.filter((t) => descriptions.has(t));
  if (described.length === 0) return [];
  const candidates = described.map((t) => {
    const r = byTicker.get(t)!;
    const cap = r.market_cap ? `$${(r.market_cap / 1e9).toFixed(1)}B` : 'unknown';
    return `${t} | ${r.name ?? t} | ${r.sector ?? ''} / ${r.industry ?? ''} | market cap ${cap}\n${descriptions.get(t)!.slice(0, 900)}`;
  }).join('\n\n');

  const pickRes = await generateText({
    model: anthropic(AI_PICK_MODEL),
    system: pickSystem(isSupportedLanguage(locale) ? languageName(locale) : 'English'),
    prompt: `Theme: ${theme}\n\nCANDIDATES:\n${candidates}`,
    maxOutputTokens: 3000,
    providerOptions: { anthropic: { effort: 'low' } },
  });

  const allowed = new Set(described);
  const seen = new Set<string>();
  const picks: AiPick[] = [];
  for (const item of parseJsonArray(pickRes.text)) {
    if (!item || typeof item !== 'object') continue;
    const ticker = String((item as { ticker?: unknown }).ticker ?? '').trim().toUpperCase();
    const reason = String((item as { reason?: unknown }).reason ?? '').trim();
    if (!allowed.has(ticker) || seen.has(ticker)) continue;
    seen.add(ticker);
    const row = byTicker.get(ticker)!;
    picks.push({ ticker, name: displayCompanyName(row.name ?? ticker, ticker), logoUrl: row.logo_url, reason });
    if (picks.length === AI_PICK_MAX) break;
  }

  logUsage(userId, picks.length ? 'watchlist_ai_fill' : 'watchlist_ai_fill_no_match', pickRes.usage, { ...meta, picks: picks.map((p) => p.ticker) });
  return picks;
}
