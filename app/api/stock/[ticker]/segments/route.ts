import { NextRequest, NextResponse, after } from 'next/server';
import { addSecurityHeaders, withRateLimit } from '@/lib/security/api-security';
import { fetchRevenueFacts } from '@/lib/segments/edgar-facts';
import { selectBreakdown } from '@/lib/segments/select-breakdown';
import { getStoredBreakdown, storeBreakdown } from '@/lib/segments/segments-db';
import { slugToSymbol } from '@/lib/assets/asset-type';

/**
 * GET /api/stock/[ticker]/segments
 *
 * The revenue parts for one period, for the Sankey diagram's left edge.
 *
 * A miss never blocks the response: the filing is a multi-megabyte download,
 * so it is fetched after the response goes out and the next view has it. The
 * chart is complete without this, so an empty answer costs the reader nothing.
 *
 * `revenue` is the figure the card already shows. The filing's own
 * consolidated total has to match it, which is how the period is identified
 * despite the sources dating it differently: TwelveData puts Apple's FY2025 at
 * 2025-09-30, the filing says 2025-09-27, and both report 416161000000.
 */

export const dynamic = 'force-dynamic';

const PERIOD_DAYS = { annual: 365, quarterly: 91 } as const;
/** The filing must be describing the same period the card is showing. */
const REVENUE_MATCH_TOLERANCE = 0.005;

async function handler(req: NextRequest, context?: unknown) {
  const { ticker: raw } = await (context as { params: Promise<{ ticker: string }> }).params;
  const ticker = slugToSymbol(String(raw ?? '').trim()).toUpperCase();
  const params = req.nextUrl.searchParams;
  const periodEnd = params.get('periodEnd') ?? '';
  const revenue = Number(params.get('revenue'));
  const period = params.get('period') === 'quarterly' ? 'quarterly' : 'annual';

  const empty = () => addSecurityHeaders(NextResponse.json({ success: true, parts: null, basis: null }));

  if (!/^[A-Z0-9.\-]{1,12}$/.test(ticker)) return empty();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) return empty();
  if (!Number.isFinite(revenue) || revenue <= 0) return empty();

  const stored = await getStoredBreakdown(ticker, periodEnd, period);

  /**
   * The stored parts have to add up to the revenue the card is showing.
   *
   * The background fill below already checks this against the filing, but the
   * cache read did not, and the cache key is (ticker, period_end) with no
   * duration in it. For any company whose fiscal year ends when its fourth
   * quarter does — which is all of them — the annual and quarterly rows want
   * the same key, and one of them wins. Microsoft's fiscal Q4 2026 and its
   * FY2026 both end 2026-06-30, so the quarterly chart was served the annual
   * 10-K breakdown and drew three segments summing to 369% of the quarter's
   * revenue, each one individually larger than the total above it.
   *
   * Checked here rather than trusted from the key, because this is the
   * invariant that actually matters and it holds whatever the source does:
   * parts belong to the revenue they sum to. See the fail-closed design in
   * docs/superpowers/plans/2026-09-18-sankey-revenue-segments.md — a
   * mismatched breakdown must render as no breakdown, never as a wrong one.
   */
  const storedTotal = stored?.breakdown?.total ?? 0;
  const reconciles =
    storedTotal > 0 && Math.abs(storedTotal - revenue) / revenue <= REVENUE_MATCH_TOLERANCE;

  if (stored?.fresh && reconciles) {
    return addSecurityHeaders(
      NextResponse.json({
        success: true,
        parts: stored.breakdown?.parts ?? null,
        basis: stored.breakdown?.basis ?? null,
      }),
    );
  }

  // Fill in the background. This reader gets today's chart; the next view of
  // this stock gets the breakdown.
  after(async () => {
    try {
      const form = period === 'quarterly' ? '10-Q' : '10-K';
      const filing = await fetchRevenueFacts(ticker, form);
      if (!filing) return;

      // Every period in the filing, not just its newest. A 10-K carries three
      // fiscal years of tagged facts and a 10-Q carries the quarter plus the
      // year-ago quarter, so matching only the newest meant four of the five
      // periods the card offers could never fill: asking for 2023 fetched the
      // FY2025 filing, saw the wrong revenue and stored nothing. One download
      // now fills whichever period was asked for.
      const match = filing.facts.find(
        (f) =>
          f.members.length === 0 &&
          Math.abs(f.durationDays - PERIOD_DAYS[period]) <= 20 &&
          Math.abs(f.value - revenue) / revenue <= REVENUE_MATCH_TOLERANCE,
      );
      if (!match) return;

      const breakdown = selectBreakdown(filing.facts, {
        consolidated: match.value,
        // The filing's own date for that period, which is what its facts are
        // tagged with. The cache key stays the date the card asked about:
        // the two differ by a few days and only one of them is ours.
        periodEnd: match.end,
        periodDays: PERIOD_DAYS[period],
      });
      await storeBreakdown(ticker, periodEnd, period, filing.form, filing.accession, breakdown);
    } catch (err) {
      console.error('[segments] background fill failed:', err);
    }
  });

  // A stale breakdown that still adds up is worth showing while the refresh
  // above runs. One that does not add up is not, however fresh it is.
  if (!stored || !reconciles) return empty();
  return addSecurityHeaders(
    NextResponse.json({
      success: true,
      parts: stored.breakdown?.parts ?? null,
      basis: stored.breakdown?.basis ?? null,
    }),
  );
}

export const GET = withRateLimit(handler, { windowMs: 60_000, maxRequests: 60 });
