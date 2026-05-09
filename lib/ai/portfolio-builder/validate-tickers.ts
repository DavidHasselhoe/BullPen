import { createServerClient } from '@/lib/supabase/client';
import type { PortfolioHolding } from './schema';

export interface TickerValidationResult {
  validHoldings: PortfolioHolding[];
  invalidTickers: string[];
  /** ticker → logo_url (where available) so the frontend can render without a second round-trip */
  logoMap: Record<string, string | null>;
}

/**
 * Validates each holding's ticker against the company_index table (canonical "every known ticker"
 * source). Tickers absent from company_index are flagged as invalid so the API route can ask the
 * model to substitute them. Logo URLs are pulled in from the companies table in the same RPC.
 */
export async function validateTickers(
  holdings: PortfolioHolding[]
): Promise<TickerValidationResult> {
  const tickers = holdings.map((h) => h.ticker.toUpperCase());
  const supabase = createServerClient();

  const [{ data: indexed }, { data: enriched }] = await Promise.all([
    supabase.from('company_index').select('ticker').in('ticker', tickers),
    supabase.from('companies').select('ticker, logo_url').in('ticker', tickers),
  ]);

  const knownTickers = new Set((indexed ?? []).map((r) => r.ticker.toUpperCase()));
  const logoMap: Record<string, string | null> = {};
  for (const row of enriched ?? []) {
    logoMap[row.ticker.toUpperCase()] = row.logo_url ?? null;
  }

  const validHoldings: PortfolioHolding[] = [];
  const invalidTickers: string[] = [];

  for (const h of holdings) {
    const tk = h.ticker.toUpperCase();
    if (knownTickers.has(tk)) {
      validHoldings.push({ ...h, ticker: tk });
    } else {
      invalidTickers.push(tk);
    }
  }

  return { validHoldings, invalidTickers, logoMap };
}
