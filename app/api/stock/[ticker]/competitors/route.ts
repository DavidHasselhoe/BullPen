import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { getCached, setCached } from '@/lib/cache/market-data-cache';
import { createServerClient } from '@/lib/supabase/client';
import { withRateLimit, addSecurityHeaders, getSessionForApiRoute } from '@/lib/security/api-security';
import { logAiCall } from '@/lib/billing/log-ai-call';
import { getCompanyProfile, type CompanyProfile } from '@/lib/twelvedata/twelvedata-client';

export const dynamic = 'force-dynamic';

export interface CompetitorEntry {
  ticker: string;
  name: string;
  logoUrl: string | null;
}

const TTL_SECONDS = 30 * 24 * 60 * 60;
const TICKER_RE   = /^[A-Z0-9]{1,7}$/;

// Correct known rebrands the model may return with stale symbols
const REBRAND_MAP: Record<string, string> = {
  FB:   'META',
  TWTR: 'X',
  BABA: 'BABA', // stays but included for clarity
  GOOG: 'GOOGL',
};

const SYSTEM_PROMPT = `You are a financial data API. You will be given a company's real name, sector, industry, and business description, followed by its ticker symbol. Return ONLY a JSON array of exactly 5 ticker symbols for the most relevant publicly-traded competitors to that company. Rules:
- Base your answer on what the company actually does per the description provided — not on assumptions from the ticker symbol or a generic sector label alone
- Competitors must offer genuinely comparable products or services to genuinely comparable customers, not merely share a broad sector/industry tag
- Use CURRENT ticker symbols as of 2025 (e.g. META not FB, GOOGL not GOOG)
- Listed on NYSE or NASDAQ
- Comparable market scale — no micro-caps for mega-caps
- Do NOT include the input ticker itself
- If you are not confident a candidate is a real, currently-listed competitor, omit it rather than guess
- No markdown, no explanation — only the JSON array, e.g. ["AMD","INTC","QCOM","TSM","AVGO"]`;

/** Grounds the prompt in the company's real business so the model can't hallucinate
 * peers purely from the ticker symbol (observed on recently-listed/renamed names
 * like NBIS, where an ungrounded prompt returned unrelated biotech tickers). */
async function getCompanyContext(sym: string): Promise<string> {
  try {
    const cachedProfile = await getCached<{ profile: CompanyProfile }>(`profile:${sym}`);
    const profile = cachedProfile?.profile ?? (await getCompanyProfile(sym));
    const lines = [
      profile.name ? `Name: ${profile.name}` : null,
      profile.sector ? `Sector: ${profile.sector}` : null,
      profile.industry ? `Industry: ${profile.industry}` : null,
      profile.description ? `Description: ${profile.description.slice(0, 500)}` : null,
    ].filter(Boolean);
    return lines.join('\n');
  } catch {
    return '';
  }
}

async function handler(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> },
): Promise<NextResponse> {
  const { ticker } = await params;
  const sym = ticker.toUpperCase();
  const key = `competitors:${sym}`;

  try {
    const cached = await getCached<CompetitorEntry[]>(key);
    if (cached) {
      return addSecurityHeaders(
        NextResponse.json({ competitors: cached }, {
          headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600' },
        }),
      );
    }

    const context = await getCompanyContext(sym);
    const prompt = context
      ? `${context}\nTicker: ${sym}\n\nList this company's competitors.`
      : `Competitors for: ${sym}`;

    const result = await generateText({
      model: openai('gpt-4o'),
      system: SYSTEM_PROMPT,
      prompt,
      maxTokens: 80,
      temperature: 0,
    });

    // Log usage (no quota — this route is cached 30 days; cost is minimal)
    const session = await getSessionForApiRoute();
    void logAiCall({
      userId: session?.userId ?? null,
      feature: 'competitors',
      model: 'gpt-4o',
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      metadata: { ticker: sym },
    });

    // Extract [...] defensively in case model prepends explanation text
    const jsonStr = result.text.match(/\[[\s\S]*\]/)?.[0] ?? result.text.trim();
    const parsed: unknown = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) throw new Error('Not an array');

    const tickers: string[] = (parsed as unknown[])
      .filter((t): t is string => typeof t === 'string')
      .map((t) => REBRAND_MAP[t.trim().toUpperCase()] ?? t.trim().toUpperCase())
      .filter((t) => TICKER_RE.test(t) && t !== sym)
      .slice(0, 5);

    if (tickers.length === 0) {
      // Not cached — next visit retries
      return addSecurityHeaders(NextResponse.json({ competitors: [] }));
    }

    // Single batch DB lookup
    const supabase = createServerClient();
    const { data: rows } = await supabase
      .from('companies')
      .select('ticker, name, logo_url')
      .in('ticker', tickers);

    const dbMap = new Map((rows ?? []).map((r) => [r.ticker, r]));

    const competitors: CompetitorEntry[] = tickers.map((t) => ({
      ticker:  t,
      name:    dbMap.get(t)?.name    ?? t,
      logoUrl: dbMap.get(t)?.logo_url ?? null,
    }));

    await setCached(key, sym, 'competitors', competitors, TTL_SECONDS);

    return addSecurityHeaders(
      NextResponse.json({ competitors }, {
        headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600' },
      }),
    );
  } catch (err) {
    console.error('[competitors]', err);
    return addSecurityHeaders(NextResponse.json({ competitors: [] }));
  }
}

export const GET = withRateLimit(handler, { windowMs: 60_000, maxRequests: 20 });
