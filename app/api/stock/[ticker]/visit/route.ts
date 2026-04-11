import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/logger';
import { withRateLimit, validateTickerParam, getSessionForApiRoute } from '@/lib/security/api-security';

/**
 * POST /api/stock/[ticker]/visit
 * Records one Hot Picks "visit" when the stock detail page is opened.
 */
async function handler(
  _request: NextRequest,
  context: { params: Promise<{ ticker: string }> }
): Promise<NextResponse> {
  try {
    const params = await context.params;
    const raw = params.ticker?.toUpperCase();
    const { valid, normalized, error: validateError } = validateTickerParam(raw);
    if (!valid || !normalized) {
      return NextResponse.json(
        { success: false, error: validateError || 'Invalid ticker' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const session = await getSessionForApiRoute();
    const userId = session?.userId ?? null;

    const sb = supabase as unknown as {
      from: (t: string) => { insert: (row: object) => Promise<{ error: { message: string } | null }> };
    };
    const { error } = await sb.from('stock_page_visits').insert({
      ticker: normalized,
      user_id: userId,
    });

    if (error) {
      logger.error('[stock-visit] insert failed', error);
      return NextResponse.json(
        { success: false, error: 'Failed to record visit' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    logger.error('[stock-visit]', e);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withRateLimit(handler, {
  windowMs: 60 * 1000,
  maxRequests: 120,
});
