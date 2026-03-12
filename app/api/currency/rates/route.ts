import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/currency/rates
 * Fetch exchange rates (from cache if available, otherwise fetch from Frankfurter API)
 * Frankfurter API updates daily at 1600 CET, so we cache rates to avoid unnecessary API calls
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const searchParams = request.nextUrl.searchParams;
    const base = searchParams.get('base') || 'USD';
    
    // Check if we have today's rates cached
    const today = new Date().toISOString().split('T')[0];
    
    const { data: cachedRates, error: cacheError } = await supabase
      .from('currency_exchange_rates')
      .select('target_currency, rate, date')
      .eq('base_currency', base)
      .eq('date', today);
    
    // If we have cached rates for today, return them
    if (!cacheError && cachedRates && cachedRates.length > 0) {
      const rates: Record<string, number> = {};
      cachedRates.forEach((rate) => {
        rates[rate.target_currency] = Number(rate.rate);
      });
      
      return NextResponse.json({
        success: true,
        base,
        date: today,
        rates,
        cached: true,
      });
    }
    
    // Fetch from Frankfurter API
    const frankfurterUrl = `https://api.frankfurter.dev/v1/latest?base=${base}`;
    const response = await fetch(frankfurterUrl, {
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Frankfurter API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Cache the rates in database
    const ratesToCache = Object.entries(data.rates).map(([currency, rate]) => ({
      base_currency: base,
      target_currency: currency,
      rate: Number(rate),
      date: data.date,
    }));
    
    // Insert rates (ON CONFLICT DO NOTHING since we check date)
    const { error: insertError } = await supabase
      .from('currency_exchange_rates')
      .upsert(ratesToCache, {
        onConflict: 'base_currency,target_currency,date',
      });
    
    if (insertError) {
      logger.error('Error caching exchange rates', insertError);
      // Continue even if caching fails
    }
    
    return NextResponse.json({
      success: true,
      base: data.base,
      date: data.date,
      rates: data.rates,
      cached: false,
    });
  } catch (error) {
    logger.error('Error fetching exchange rates', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
