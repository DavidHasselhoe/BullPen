import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';

/**
 * GET /api/exchanges
 * Fetch all exchanges and their holidays
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();

    // Fetch exchanges
    const { data: exchanges, error: exchangesError } = await supabase
      .from('exchanges')
      .select('*')
      .order('country', { ascending: true })
      .order('name', { ascending: true });

    if (exchangesError) {
      console.error('Error fetching exchanges:', exchangesError);
      return NextResponse.json(
        { success: false, error: exchangesError.message },
        { status: 500 }
      );
    }

    // Fetch holidays
    const { data: holidays, error: holidaysError } = await supabase
      .from('exchange_holidays')
      .select('*')
      .gte('date', new Date().toISOString().split('T')[0]) // Only future holidays
      .order('date', { ascending: true });

    if (holidaysError) {
      console.error('Error fetching holidays:', holidaysError);
      return NextResponse.json(
        { success: false, error: holidaysError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      exchanges: exchanges || [],
      holidays: holidays || [],
    });
  } catch (error) {
    console.error('Error in exchanges GET:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
