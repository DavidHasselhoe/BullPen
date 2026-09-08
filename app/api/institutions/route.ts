/**
 * GET /api/institutions
 *
 * The fund list for the Discover section and drill-down pages — public, no
 * auth required. Names, managers, descriptions, last-filed date, and
 * position count are the free teaser layer by design; the actual holdings
 * (via /api/institutions/[slug]/holdings) are Pro-gated.
 *
 * institutional_filings is Pro-gated at the RLS layer (migration 127), so
 * this route uses the service-role client to read only safe per-filing
 * aggregates (filed date, position count, and the top-holding / top-five
 * weights the concentration label is computed from) — the underlying
 * holdings stay behind the Pro gate regardless of this route's own access.
 * Those two weights say how lopsided a portfolio is without naming a single
 * position, which is the shape the free teaser layer already advertises.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { getCached, setCached } from '@/lib/cache/market-data-cache';

const CACHE_KEY = 'institutions:fund-list';
const CACHE_TTL_SECONDS = 60 * 60;

export interface InstitutionalFundSummary {
  slug: string;
  displayName: string;
  managerName: string | null;
  logoUrl: string | null;
  description: string | null;
  lastFiledDate: string | null;
  lastPeriodOfReport: string | null;
  totalPositions: number | null;
  /** Largest holding as % of the filing's value; null until parsed. */
  topHoldingPct: number | null;
  /** Five largest holdings as % of the filing's value; null until parsed. */
  top5Pct: number | null;
}

/** Postgres NUMERIC can arrive as a string over PostgREST depending on the
 *  driver path; the concentration thresholds compare with `>`, where a string
 *  would silently compare lexically. */
function asNumber(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

interface InvestorRow {
  slug: string;
  display_name: string;
  manager_name: string | null;
  logo_url: string | null;
  description: string | null;
}

interface FilingAggRow {
  investor_id: string;
  filed_date: string;
  period_of_report: string;
  total_positions: number | null;
  top_holding_pct: number | string | null;
  top5_pct: number | string | null;
  parse_status: string;
}

async function handler(_request: NextRequest): Promise<NextResponse> {
  try {
    const cached = await getCached<InstitutionalFundSummary[]>(CACHE_KEY);
    if (cached) {
      return addSecurityHeaders(NextResponse.json({ success: true, funds: cached }));
    }

    const supabase = createServerClient();
    const { data: investors, error: investorsError } = await supabase
      .from('institutional_investors')
      .select('id, slug, display_name, manager_name, logo_url, description')
      .eq('is_active', true)
      .order('sort_order');

    if (investorsError || !investors) {
      throw new Error(investorsError?.message ?? 'Could not load institutional_investors');
    }

    const investorRows = investors as (InvestorRow & { id: string })[];
    const investorIds = investorRows.map((r) => r.id);

    const { data: filings } = await supabase
      .from('institutional_filings')
      .select('investor_id, filed_date, period_of_report, total_positions, top_holding_pct, top5_pct, parse_status')
      .in('investor_id', investorIds)
      .eq('parse_status', 'ok')
      .order('period_of_report', { ascending: false });

    // Latest 'ok' filing per fund — filings is already ordered newest-first,
    // so the first row seen per investor_id wins.
    const latestByInvestor = new Map<string, FilingAggRow>();
    for (const f of (filings as FilingAggRow[] | null) ?? []) {
      if (!latestByInvestor.has(f.investor_id)) latestByInvestor.set(f.investor_id, f);
    }

    const funds: InstitutionalFundSummary[] = investorRows.map((inv) => {
      const latest = latestByInvestor.get((inv as InvestorRow & { id: string }).id);
      return {
        slug: inv.slug,
        displayName: inv.display_name,
        managerName: inv.manager_name,
        logoUrl: inv.logo_url,
        description: inv.description,
        lastFiledDate: latest?.filed_date ?? null,
        lastPeriodOfReport: latest?.period_of_report ?? null,
        totalPositions: latest?.total_positions ?? null,
        topHoldingPct: asNumber(latest?.top_holding_pct),
        top5Pct: asNumber(latest?.top5_pct),
      };
    });

    void setCached(CACHE_KEY, 'institutions', 'institutional_fund_list', funds, CACHE_TTL_SECONDS);
    return addSecurityHeaders(NextResponse.json({ success: true, funds }));
  } catch (err) {
    console.error('[institutions] failed:', err);
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to load institutional investors' }, { status: 500 })
    );
  }
}

export const GET = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 60 });
