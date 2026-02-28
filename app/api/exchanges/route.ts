import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';

/**
 * GET /api/exchanges
 * Fetch all exchanges and their upcoming holidays.
 * Response is cached for 1 hour — exchange schedules change at most annually.
 */
export async function GET(request: NextRequest) {
  const today = new Date().toISOString().split('T')[0];

  try {
    const supabase = createServerClient();

    // Run both queries in parallel — they are independent
    const [exchangesResult, holidaysResult] = await Promise.all([
      supabase
        .from('exchanges')
        .select('code, name, country, timezone, open_time, close_time')
        .order('country', { ascending: true })
        .order('name', { ascending: true })
        .limit(200),
      supabase
        .from('exchange_holidays')
        .select('id, exchange_code, date, type, early_close_time, description')
        .gte('date', today)
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
