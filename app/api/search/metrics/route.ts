/**
 * Hot Picks data API (GET). Popularity is driven by stock detail page visits
 * (see stock_page_visits + get_hot_picks), not search clicks.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { withRateLimit } from '@/lib/security/api-security';

async function getHandler(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const hours = parseInt(searchParams.get('hours') || '168', 10); // Default: 7 days
    const limit = parseInt(searchParams.get('limit') || '10', 10); // Default: 10 results

    const supabase = createServerClient();

    // Call the database function to get hot picks
    const { data, error } = await supabase.rpc('get_hot_picks', {
      time_period_hours: hours,
      limit_count: limit,
    });

    if (error) {
      return NextResponse.json({ success: true, data: [] });
    }

    return NextResponse.json({
      success: true,
      data: data || [],
    });
  } catch {
    return NextResponse.json({ success: true, data: [] });
  }
}

/** GET: rate limited to 30/min */
export const GET = withRateLimit(getHandler, { windowMs: 60 * 1000, maxRequests: 30 });
