// API Security Utilities
// Common security middleware and utilities for API routes

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIdentifier } from './rate-limiter';
import { validateTicker, validateSearchQuery, validateUUID } from './input-validation';

/**
 * Rate limiting middleware for API routes.
 * Uses Upstash Redis when UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set;
 * otherwise falls back to in-memory (per-instance on serverless).
 *
 * The limit is scoped per route (IP + pathname) so one page load does not consume
 * the budget for unrelated endpoints. Without this, a shared IP bucket caused 429s
 * when any "strict" route's max was exceeded by total traffic across all routes.
 */
export function withRateLimit(
  handler: (request: NextRequest, context?: unknown) => Promise<NextResponse>,
  options: { windowMs?: number; maxRequests?: number; scope?: string } = {}
) {
  return async (request: NextRequest, context?: unknown): Promise<NextResponse> => {
    const routeScope =
      options.scope != null && options.scope !== '' ? options.scope : (request.nextUrl?.pathname || 'api');
    const identifier = `${getClientIdentifier(request)}:${routeScope}`;
    const limit = await checkRateLimit(identifier, {
      windowMs: options.windowMs || 60 * 1000, // 1 minute default
      maxRequests: options.maxRequests || 60, // 60 requests per minute default
    });

    if (!limit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Rate limit exceeded. Please try again later.',
        },
        {
          status: 429,
          headers: {
            'Retry-After': Math.ceil((limit.resetTime - Date.now()) / 1000).toString(),
            'X-RateLimit-Limit': (options.maxRequests || 60).toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(limit.resetTime).toISOString(),
          },
        }
      );
    }

    // Add rate limit headers to response
    const response = await handler(request, context);
    response.headers.set('X-RateLimit-Limit', (options.maxRequests || 60).toString());
    response.headers.set('X-RateLimit-Remaining', limit.remaining.toString());
    response.headers.set('X-RateLimit-Reset', new Date(limit.resetTime).toISOString());

    return response;
  };
}

/**
 * Rejects a request whose declared Content-Length exceeds maxBytes, before
 * the body is parsed. Vercel Functions accept up to 100MB by default — fine
 * for most routes, but AI endpoints turn body size directly into LLM
 * input-token cost, so they need a tighter budget than the platform default.
 * Missing Content-Length (some non-browser clients omit it) falls through to
 * that platform default rather than being blocked outright.
 */
export function rejectIfTooLarge(request: NextRequest, maxBytes: number): NextResponse | null {
  const contentLength = request.headers.get('content-length');
  if (contentLength && Number(contentLength) > maxBytes) {
    return NextResponse.json(
      { error: `Request body too large. Max ${Math.floor(maxBytes / 1024)}KB.` },
      { status: 413 }
    );
  }
  return null;
}

/**
 * Validates ticker parameter from route
 */
export function validateTickerParam(ticker: string | undefined): { valid: boolean; normalized?: string; error?: string } {
  if (!ticker) {
    return { valid: false, error: 'Ticker parameter is required' };
  }

  return validateTicker(ticker);
}

/**
 * Validates companyId (UUID) parameter from route
 */
export function validateCompanyIdParam(companyId: string | undefined): { valid: boolean; error?: string } {
  if (!companyId) {
    return { valid: false, error: 'Company ID parameter is required' };
  }

  if (!validateUUID(companyId)) {
    return { valid: false, error: 'Invalid company ID format' };
  }

  return { valid: true };
}

/**
 * Get session for API routes. Returns userId if authenticated, null otherwise.
 * Use in Route Handlers; never trust client-provided userId.
 */
export async function getSessionForApiRoute(): Promise<{ userId: string } | null> {
  try {
    const { getCurrentUserId } = await import('@/lib/auth/server-session');
    const userId = await getCurrentUserId();
    return userId ? { userId } : null;
  } catch {
    return null;
  }
}

/**
 * Validates search query from request
 */
export function validateSearchQueryParam(query: string | null): { valid: boolean; sanitized?: string; error?: string } {
  if (!query) {
    return { valid: true, sanitized: '' }; // Empty query is valid (returns empty results)
  }

  return validateSearchQuery(query);
}

/**
 * Requires authentication. Returns { userId } or 401 Response.
 * Use at the start of handlers that perform costly operations.
 */
export async function requireAuth(): Promise<{ userId: string } | NextResponse> {
  const session = await getSessionForApiRoute();
  if (!session) {
    return NextResponse.json(
      { success: false, error: 'Authentication required' },
      { status: 401 }
    );
  }
  return session;
}

/**
 * Wraps a handler to require authentication. Returns 401 if not authenticated.
 * Use for costly/protected endpoints (AI, paid APIs). Combine with withRateLimit.
 */
export function withAuth(
  handler: (request: NextRequest, context: unknown, session: { userId: string }) => Promise<NextResponse>,
  options: { rateLimit?: { windowMs?: number; maxRequests?: number } } = {}
) {
  const base = async (request: NextRequest, context?: unknown): Promise<NextResponse> => {
    const session = await getSessionForApiRoute();
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }
    return handler(request, context ?? {}, session);
  };
  return options.rateLimit ? withRateLimit(base, options.rateLimit) : base;
}

/**
 * Adds security headers to response
 */
export function addSecurityHeaders(response: NextResponse): NextResponse {
  // Content Security Policy
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https: wss:;"
  );

  // XSS Protection
  response.headers.set('X-XSS-Protection', '1; mode=block');

  // Prevent MIME sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // Frame protection
  response.headers.set('X-Frame-Options', 'DENY');

  // Referrer policy
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions policy
  response.headers.set(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=()'
  );

  return response;
}
