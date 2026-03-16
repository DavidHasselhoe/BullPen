/**
 * Search Metrics API Route
 * Tracks search interactions and provides hot picks data.
 * Rate limited and validated to prevent abuse.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/logger';
import { withRateLimit } from '@/lib/security/api-security';
import { validateTicker } from '@/lib/security/input-validation';

/**
 * POST /api/search/metrics
 * Track a search click/interaction
 */
async function postHandler(request: NextRequest) {
  try {
    const body = await request.json();
    const { ticker } = body;

    if (!ticker || typeof ticker !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Ticker is required' },
        { status: 400 }
      );
    }

    const { valid, normalized, error: validateError } = validateTicker(ticker);
    if (!valid || !normalized) {
      return NextResponse.json(
        { success: false, error: validateError || 'Invalid ticker format' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Get current user (if authenticated)
    const {
      data: { session },
    } = await supabase.auth.getSession();

    // Insert search metric (validated ticker)
    const { error } = await supabase.from('search_metrics').insert({
      ticker: normalized,
      user_id: session?.user?.id || null,
    });

    if (error) {
      logger.error('Error inserting search metric', error);
      return NextResponse.json(
        { success: false, error: 'Failed to track search metric' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error in search metrics POST', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/** POST: rate limited to 60/min to prevent search_metrics flooding */
export const POST = withRateLimit(postHandler, { windowMs: 60 * 1000, maxRequests: 60 });

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
