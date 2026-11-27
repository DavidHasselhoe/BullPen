import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';

/**
 * GET /api/exchanges
 * Fetch all exchanges and their upcoming holidays.
 * Response is cached for 1 hour — exchange schedules change at most annually.
 */
export async function GET(_request: NextRequest) {
  // Include three years of look-back (not just upcoming): the market-movers date
  // label resolves the last trading day after a Friday holiday, and the Market
  // Calendar marks past holidays when you page back. Market-status matches
  // holidays by exact date, so extra past rows are harmless (~50 a year across
  // exchanges, well under PostgREST's 1000-row cap).
  const from = new Date(Date.now() - 1100 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  try {
    const supabase = createServerClient();

    // Run both queries in parallel — they are independent
    const [exchangesResult, holidaysResult] = await Promise.all([
      supabase
        .from('exchanges')
        .select('code, name, country, timezone, open_time, close_time, midday_close_time, midday_open_time')
        .order('country', { ascending: true })
        .order('name', { ascending: true })
        .limit(200),
      supabase
        .from('exchange_holidays')
        .select('id, exchange_code, date, type, early_close_time, description')
        .gte('date', from)
        .order('date', { ascending: true })
        .limit(500),
    ]);

    const exchanges = exchangesResult.error ? [] : (exchangesResult.data || []);
    const holidays = holidaysResult.error ? [] : (holidaysResult.data || []);

    return NextResponse.json(
      { success: true, exchanges, holidays },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
    );
  } catch {
    return NextResponse.json(
      { success: true, exchanges: [], holidays: [] },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
    );
  }
}
