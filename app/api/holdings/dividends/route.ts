/**
 * GET /api/holdings/dividends
 *
 * The dividend hub on My holdings. Free: each dividend-paying holding's next
 * payment (ex-date, pay date when known, per share, and the user's amount).
 * Pro (`dividend_hub`): the next 12 calendar months of announced and projected
 * payments across holdings, by month. Projections repeat each holding's last
 * year of real payments; see lib/dividends/dividend-income.ts.
 *
 * Per-symbol schedules are shared and cached (lib/dividends/dividend-schedule.ts);
 * the response itself is per user. Only US listings: a holding pinned to a
 * foreign listing pays in another currency on another schedule.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { getTier } from '@/lib/billing/tier';
import { entitlementsFor } from '@/lib/billing/entitlements';
import { OPEN_POSITION_FILTER } from '@/lib/holdings/open-position';
import { listingMic } from '@/lib/assets/asset-type';
import { todayET } from '@/lib/dates/calendar-format';
import { getDividendSchedules } from '@/lib/dividends/dividend-schedule';
import { incomeMonths, isActivePayer, lastPayment, nextPayment, holdingYear } from '@/lib/dividends/dividend-income';

type HoldingRow = { symbol: string; company_name: string | null; quantity: number | null; mic_code: string | null; trading_currency: string | null };

async function get(_request: NextRequest, _context: unknown, session: { userId: string }): Promise<NextResponse> {
  const supabase = createServerClient();
  const [{ data, error }, tier] = await Promise.all([
    supabase.from('user_holdings').select('symbol, company_name, quantity, mic_code, trading_currency')
      .eq('user_id', session.userId).or(OPEN_POSITION_FILTER),
    getTier(session.userId),
  ]);
  if (error) {
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'holdings_unavailable' }, { status: 500 }));
  }

  // One entry per symbol; lots of the same stock add up. A lot without a share count makes the whole amount unknown.
  const bySymbol = new Map<string, { name: string; shares: number | null }>();
  const excluded = new Set<string>();
  for (const h of (data ?? []) as HoldingRow[]) {
    if (h.symbol.includes('/')) continue;
    const sym = h.symbol.toUpperCase();
    if (listingMic(h.mic_code) || (h.trading_currency ?? 'USD') !== 'USD') {
      excluded.add(sym);
      continue;
    }
    const prev = bySymbol.get(sym);
    const shares = h.quantity == null || (prev && prev.shares == null) ? null : (prev?.shares ?? 0) + h.quantity;
    bySymbol.set(sym, { name: h.company_name || sym, shares });
  }

  const pro = entitlementsFor(tier).can('dividend_hub');
  const today = todayET();
  const { schedules, missing } = await getDividendSchedules([...bySymbol.keys()], 'organic');

  const holdings = [];
  const entries = [];
  for (const [symbol, { name, shares }] of bySymbol) {
    const events = schedules.get(symbol);
    if (!events || !isActivePayer(events, today)) continue;
    const next = nextPayment(events, today);
    holdings.push({ symbol, name, shares, next, last: next ? null : lastPayment(events, today), nextTotal: next && shares != null ? next.amount * shares : null });
    entries.push(...holdingYear(symbol, events, shares, today));
  }
  holdings.sort((a, b) => (a.next?.payDate ?? a.next?.exDate ?? '9999').localeCompare(b.next?.payDate ?? b.next?.exDate ?? '9999'));

  return addSecurityHeaders(NextResponse.json({
    success: true,
    today,
    pro,
    holdings,
    missing,
    // Foreign listings aren't counted; the card says so rather than coming up short.
    excluded: [...excluded],
    // Free gets only how many payments are coming, as the locked card's hook; never the amounts.
    yearPaymentCount: entries.length,
    year: pro ? {
      months: incomeMonths(entries, today),
      total: entries.reduce((s, e) => s + (e.total ?? 0), 0),
      hasProjected: entries.some((e) => e.kind === 'projected'),
      unknownShares: holdings.filter((h) => h.shares == null).map((h) => h.symbol),
    } : null,
  }, { headers: { 'Cache-Control': 'private, no-store' } }));
}

export const GET = withAuth(get, { rateLimit: { windowMs: 60_000, maxRequests: 30 } });
