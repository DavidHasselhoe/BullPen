import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { getCached, setCached } from '@/lib/cache/market-data-cache';
import { createServerClient } from '@/lib/supabase/client';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';

export const dynamic = 'force-dynamic';

export interface CompetitorEntry {
  ticker: string;
  name: string;
  logoUrl: string | null;
}

const TTL_SECONDS = 30 * 24 * 60 * 60;
const TICKER_RE   = /^[A-Z0-9]{1,7}$/;

const SYSTEM_PROMPT = `You are a financial data API. Return ONLY a JSON array of exactly 5 ticker symbols for the most relevant publicly-traded competitors to the given company. Rules:
- Listed on NYSE or NASDAQ
- Comparable market scale — no micro-caps for mega-caps
- Do NOT include the input ticker itself
- No markdown, no explanation — only the JSON array, e.g. ["AMD","INTC","QCOM","TSM","AVGO"]`;

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

    const { text } = await generateText({
      model: openai('gpt-4o-mini'),
      system: SYSTEM_PROMPT,
      prompt: `Competitors for: ${sym}`,
      maxTokens: 60,
      temperature: 0,
    });

    // Extract [...] defensively in case model prepends explanation text
    const jsonStr = text.match(/\[[\s\S]*\]/)?.[0] ?? text.trim();
    const parsed: unknown = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) throw new Error('Not an array');

    const tickers: string[] = (parsed as unknown[])
      .filter((t): t is string => typeof t === 'string')
      .map((t) => t.trim().toUpperCase())
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
