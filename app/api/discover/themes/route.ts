/**
 * GET /api/discover/themes
 *
 * Card metadata for the "Investing Ideas" theme grid on /discover: title,
 * tagline, company count, and a handful of logos per theme. Deliberately
 * separate from /api/discover/feed — theme cards carry no live price, so
 * coupling to the feed's Promise.allSettled/LivePriceContext machinery would
 * buy nothing. This is one cheap indexed `IN` query, cached at the CDN edge;
 * no Redis layer needed for a payload this static.
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { addSecurityHeaders } from '@/lib/security/api-security';
import { THEME_DISPLAY_ORDER } from '@/lib/discover/theme-config';

/** Logos shown per card before the row starts truncating with a "+N companies" tail. */
const LOGOS_PER_CARD = 5;

interface CompanyMeta { name: string; logo_url: string | null }

export interface ThemeCardData {
  slug: string;
  title: string;
  tagline: string;
  count: number;
  logos: Array<{ ticker: string; name: string; logoUrl: string | null }>;
}

export async function GET(): Promise<NextResponse> {
  const allTickers = [...new Set(THEME_DISPLAY_ORDER.flatMap((t) => t.tickers))];

  const supabase = createServerClient();
  const { data } = await supabase
    .from('companies')
    .select('ticker, name, logo_url')
    .in('ticker', allTickers)
    .returns<Array<{ ticker: string; name: string; logo_url: string | null }>>();

  const meta = new Map<string, CompanyMeta>((data ?? []).map((c) => [c.ticker, { name: c.name, logo_url: c.logo_url }]));

  const themes: ThemeCardData[] = THEME_DISPLAY_ORDER.map((theme) => ({
    slug: theme.slug,
    title: theme.title,
    tagline: theme.tagline,
    count: theme.tickers.length,
    logos: theme.tickers.slice(0, LOGOS_PER_CARD).map((ticker) => ({
      ticker,
      name: meta.get(ticker)?.name ?? ticker,
      logoUrl: meta.get(ticker)?.logo_url ?? null,
    })),
  }));

  const response = NextResponse.json({ success: true, themes });
  response.headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return addSecurityHeaders(response);
}
