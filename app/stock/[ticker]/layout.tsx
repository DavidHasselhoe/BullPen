import type { Metadata } from 'next';
import { createServerClient } from '@/lib/supabase/client';

/**
 * The page itself (page.tsx) is a client component, which can't export
 * generateMetadata — this sibling server layout is the minimal way to give
 * every stock page its own title/description instead of the app-wide
 * default. /stock/* is excluded from crawling in robots.ts (live,
 * credit-costing data isn't worth indexing), so the value here is tab
 * titles and link-preview quality when a page gets shared, not search
 * ranking.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string }>;
}): Promise<Metadata> {
  const { ticker: rawTicker } = await params;
  const ticker = rawTicker.toUpperCase();

  const supabase = createServerClient();
  const { data } = await supabase
    .from('companies')
    .select('name')
    .eq('ticker', ticker)
    .maybeSingle<{ name: string | null }>();

  const name = data?.name;
  const title = name ? `${name} (${ticker}) Stock Price` : `${ticker} Stock Price`;
  const description = name
    ? `Real-time price, financials, and AI-powered analysis for ${name} (${ticker}) on BullPen.`
    : `Real-time price, financials, and AI-powered analysis for ${ticker} on BullPen.`;

  return { title, description };
}

export default function StockLayout({ children }: { children: React.ReactNode }) {
  return children;
}
