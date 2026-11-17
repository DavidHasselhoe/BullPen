import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withRateLimit, addSecurityHeaders, rejectIfTooLarge } from '@/lib/security/api-security';
import { checkQuota } from '@/lib/billing/quotas';
import { classifyAiError } from '@/lib/ai/provider-error';
import { logger } from '@/lib/utils/logger';
import { pickStocksForTheme, AI_THEME_MAX_CHARS } from '@/lib/watchlist/ai-picks';

export const dynamic = 'force-dynamic';

/**
 * POST /api/watchlist/ai-picks { theme, locale } -> { picks }
 * Suggests up to 5 stocks for a theme. Saves nothing: the client shows the
 * picks for review, then creates the list through the normal watchlist routes.
 */
async function handler(req: NextRequest, _ctx: unknown, session: { userId: string }): Promise<NextResponse> {
  const tooLarge = rejectIfTooLarge(req, 4 * 1024);
  if (tooLarge) return tooLarge;

  const body = (await req.json().catch(() => null)) as { theme?: unknown; locale?: unknown } | null;
  const theme = typeof body?.theme === 'string' ? body.theme.replace(/\s+/g, ' ').trim() : '';
  const locale = typeof body?.locale === 'string' ? body.locale : 'en';
  if (theme.length < 3 || theme.length > AI_THEME_MAX_CHARS) {
    return addSecurityHeaders(NextResponse.json({ error: 'invalid_theme' }, { status: 400 }));
  }

  const quota = await checkQuota(session.userId, 'watchlist_ai_fill');
  if (!quota.allowed) {
    return addSecurityHeaders(NextResponse.json({ error: 'quota_exceeded', quota }, { status: 402 }));
  }

  try {
    const picks = await pickStocksForTheme(session.userId, theme, locale);
    return addSecurityHeaders(NextResponse.json({ picks }));
  } catch (err) {
    logger.error('[watchlist/ai-picks]', err);
    const safe = classifyAiError(err);
    return addSecurityHeaders(NextResponse.json({ error: safe.code }, { status: safe.status }));
  }
}

export const POST = withRateLimit(withAuth(handler), { windowMs: 60 * 1000, maxRequests: 6 });
