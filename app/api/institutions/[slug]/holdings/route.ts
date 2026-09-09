/**
 * GET /api/institutions/[slug]/holdings?quarter=YYYY-MM-DD
 *
 * Pro-gated. Dual gate, deliberately: route-level isPro() check here AND
 * the RLS policy on institutional_filings/institutional_holdings (migration
 * 127) — this repo's security audit found daily_briefs/ai_stock_picks
 * enforcing a Pro gate in the API route only, bypassable via a direct
 * PostgREST call, and fixed it after the fact. Here it's designed in from
 * the start: this route is the primary gate (service-role client, simpler
 * joins), RLS is the backstop for any other access path.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { getCached, setCached } from '@/lib/cache/market-data-cache';
import { getTier, isPro } from '@/lib/billing/tier';
import { isInstitutionalFundSlug } from '@/lib/institutions/fund-list';
import { computeHoldingsDiff, type DiffableHolding, type HoldingsDiff } from '@/lib/institutions/compute-diff';

const CACHE_TTL_SECONDS = 12 * 60 * 60;

interface HoldingRow {
  symbol: string | null;
  name_of_issuer: string;
  cusip: string;
  value_usd: number;
  shares: number;
  portfolio_pct: number | null;
}

interface FilingRow {
  id: string;
  period_of_report: string;
  filed_date: string;
  total_value_usd: number | null;
  total_positions: number | null;
}

interface HoldingsResponse {
  fund: { slug: string; displayName: string; managerName: string | null; description: string | null };
  filing: { periodOfReport: string; filedDate: string; totalValueUsd: number | null; totalPositions: number | null };
  holdings: DiffableHolding[];
  diff: HoldingsDiff | null;
  /** Share count per quarter, newest first, for the few positions the
   *  takeaway sentence may name. Empty when there is no useful history. */
  sharesHistory: Record<string, number[]>;
  availableQuarters: string[];
}

const PAGE_SIZE = 1000; // PostgREST's default max-rows cap — must page past it explicitly or a >1000-position fund (Citadel, Renaissance Tech) silently loses everything past row 1000

/**
 * Fetches every holdings row for a filing, paging past PostgREST's default
 * 1000-row response cap. A single unbounded `.select()` was silently
 * truncating large funds — verified live: Citadel's 7166-position filing
 * only ever returned 1000 rows, understating total value and corrupting
 * every "% of Portfolio" figure derived from it. `.order('cusip')` makes the
 * pagination itself deterministic (`.range()` without a stable order can
 * skip or repeat rows across pages) — cusip is unique per filing since
 * migration 129's constraint, so this can't drop or duplicate a row.
 */
async function fetchAllHoldings(
  supabase: ReturnType<typeof createServerClient>,
  filingId: string
): Promise<HoldingRow[]> {
  const rows: HoldingRow[] = [];
  let offset = 0;
  for (;;) {
    const { data } = await supabase
      .from('institutional_holdings')
      .select('symbol, name_of_issuer, cusip, value_usd, shares, portfolio_pct')
      .eq('filing_id', filingId)
      .order('cusip', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    const batch = (data as HoldingRow[] | null) ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}

/**
 * Share counts for the handful of positions the takeaway sentence might name,
 * across every quarter on file, newest first. That is what lets it say
 * "trimmed Apple for the third straight quarter" instead of only describing
 * the single most recent move.
 *
 * Deliberately narrow: this reads one indexed row per (filing, cusip) for at
 * most STREAK_CANDIDATES positions, not whole filings. Loading five quarters
 * of holdings in full would be 35,000 rows for a fund like Citadel, to answer
 * a question about one company.
 */
const STREAK_CANDIDATES = 12;

async function fetchSharesHistory(
  supabase: ReturnType<typeof createServerClient>,
  filingRows: FilingRow[],
  currentIndex: number,
  diff: HoldingsDiff | null
): Promise<Record<string, number[]>> {
  if (!diff) return {};

  const olderFilings = filingRows.slice(currentIndex);
  if (olderFilings.length < 3) return {}; // no room for a streak worth naming

  const candidates = [...diff.increased, ...diff.decreased]
    .sort((a, b) => (b.portfolioPct ?? 0) - (a.portfolioPct ?? 0))
    .slice(0, STREAK_CANDIDATES)
    .map((h) => h.cusip);
  if (candidates.length === 0) return {};

  const { data } = await supabase
    .from('institutional_holdings')
    .select('filing_id, cusip, shares')
    .in('filing_id', olderFilings.map((f) => f.id))
    .in('cusip', candidates);

  const byFiling = new Map<string, Map<string, number>>();
  for (const row of (data as Array<{ filing_id: string; cusip: string; shares: number }> | null) ?? []) {
    if (!byFiling.has(row.filing_id)) byFiling.set(row.filing_id, new Map());
    byFiling.get(row.filing_id)!.set(row.cusip, row.shares);
  }

  const history: Record<string, number[]> = {};
  for (const cusip of candidates) {
    // Newest first, stopping at the first quarter the fund didn't hold it —
    // a streak can't run through a gap.
    const series: number[] = [];
    for (const filing of olderFilings) {
      const shares = byFiling.get(filing.id)?.get(cusip);
      if (shares == null) break;
      series.push(shares);
    }
    if (series.length >= 3) history[cusip] = series;
  }
  return history;
}

function toDiffable(row: HoldingRow): DiffableHolding {
  return {
    cusip: row.cusip,
    symbol: row.symbol,
    nameOfIssuer: row.name_of_issuer,
    valueUsd: row.value_usd,
    shares: row.shares,
    portfolioPct: row.portfolio_pct,
  };
}

async function handler(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
  session: { userId: string }
): Promise<NextResponse> {
  const { slug } = await context.params;
  if (!isInstitutionalFundSlug(slug)) {
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'not_found' }, { status: 404 }));
  }

  if (!isPro(await getTier(session.userId))) {
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'pro_required' }, { status: 403 }));
  }

  const requestedQuarter = request.nextUrl.searchParams.get('quarter');
  const cacheKey = `institutions:holdings:${slug}:${requestedQuarter ?? 'latest'}`;
  const cached = await getCached<HoldingsResponse>(cacheKey);
  if (cached) {
    return addSecurityHeaders(NextResponse.json({ success: true, ...cached }));
  }

  try {
    const supabase = createServerClient();
    const { data: investor, error: investorError } = await supabase
      .from('institutional_investors')
      .select('id, slug, display_name, manager_name, description')
      .eq('slug', slug)
      .maybeSingle<{ id: string; slug: string; display_name: string; manager_name: string | null; description: string | null }>();

    if (investorError || !investor) {
      return addSecurityHeaders(NextResponse.json({ success: false, error: 'not_found' }, { status: 404 }));
    }

    const { data: filings } = await supabase
      .from('institutional_filings')
      .select('id, period_of_report, filed_date, total_value_usd, total_positions')
      .eq('investor_id', investor.id)
      .eq('parse_status', 'ok')
      .order('period_of_report', { ascending: false });

    const filingRows = (filings as FilingRow[] | null) ?? [];
    if (filingRows.length === 0) {
      return addSecurityHeaders(NextResponse.json({ success: false, error: 'no_filings_yet' }, { status: 404 }));
    }

    const currentIndex = requestedQuarter
      ? filingRows.findIndex((f) => f.period_of_report === requestedQuarter)
      : 0;
    const currentFiling = filingRows[currentIndex === -1 ? 0 : currentIndex];
    const previousFiling = filingRows[(currentIndex === -1 ? 0 : currentIndex) + 1] ?? null;

    const [currentHoldingsRaw, previousHoldingsRaw] = await Promise.all([
      fetchAllHoldings(supabase, currentFiling.id),
      previousFiling ? fetchAllHoldings(supabase, previousFiling.id) : Promise.resolve(null),
    ]);
    const previousHoldings: DiffableHolding[] | null = previousHoldingsRaw?.map(toDiffable) ?? null;

    const holdings = currentHoldingsRaw.map(toDiffable);
    const diff = computeHoldingsDiff(holdings, previousHoldings);
    const sharesHistory = await fetchSharesHistory(supabase, filingRows, currentIndex === -1 ? 0 : currentIndex, diff);

    const response: HoldingsResponse = {
      fund: {
        slug: investor.slug,
        displayName: investor.display_name,
        managerName: investor.manager_name,
        description: investor.description,
      },
      filing: {
        periodOfReport: currentFiling.period_of_report,
        filedDate: currentFiling.filed_date,
        totalValueUsd: currentFiling.total_value_usd,
        totalPositions: currentFiling.total_positions,
      },
      holdings,
      diff,
      sharesHistory,
      availableQuarters: filingRows.map((f) => f.period_of_report),
    };

    void setCached(cacheKey, slug, 'institutional_holdings', response, CACHE_TTL_SECONDS);
    return addSecurityHeaders(NextResponse.json({ success: true, ...response }));
  } catch (err) {
    console.error(`[institutions/${slug}/holdings] failed:`, err);
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to load holdings' }, { status: 500 })
    );
  }
}

export const GET = withAuth(handler, { rateLimit: { windowMs: 60 * 1000, maxRequests: 30 } });
