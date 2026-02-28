import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';

async function handler(request: NextRequest) {
  try {
    const supabase = createServerClient();

    const { count, error: countError } = await supabase
      .from('investing_quotes')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, quote: null })
      );
    }

    if (!count || count === 0) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, quote: null })
      );
    }

    // Get a random quote by selecting a random offset
    const randomOffset = Math.floor(Math.random() * count);
    const { data, error } = await supabase
      .from('investing_quotes')
      .select('quote_text, author')
      .range(randomOffset, randomOffset)
      .limit(1);

    if (error) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, quote: null })
      );
    }

    if (!data || data.length === 0) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, quote: null })
      );
    }

    return addSecurityHeaders(
      NextResponse.json({
        success: true,
        quote: data[0],
      })
    );
  } catch {
    return addSecurityHeaders(
      NextResponse.json({ success: false, quote: null })
    );
  }
}

// Apply rate limiting: 60 requests per minute
export const GET = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 60 });
