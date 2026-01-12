/**
 * Search Metrics API Route
 * Tracks search interactions and provides hot picks data
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { cookies } from 'next/headers';

/**
 * POST /api/search/metrics
 * Track a search click/interaction
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ticker } = body;

    if (!ticker || typeof ticker !== 'string' || ticker.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Ticker is required' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Get current user (if authenticated)
    const {
      data: { session },
    } = await supabase.auth.getSession();

    // Insert search metric
    const { error } = await supabase.from('search_metrics').insert({
      ticker: ticker.trim().toUpperCase(),
      user_id: session?.user?.id || null,
    });

    if (error) {
      console.error('Error inserting search metric:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to track search metric' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in search metrics POST:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/search/metrics
 * Get hot picks (most searched stocks)
 */
export async function GET(request: NextRequest) {
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
      console.error('Error getting hot picks:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to get hot picks' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data || [],
    });
  } catch (error) {
    console.error('Error in search metrics GET:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
