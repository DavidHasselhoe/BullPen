// API Security Utilities
// Common security middleware and utilities for API routes

import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, getClientIdentifier } from './rate-limiter';
import { validateTicker, validateSearchQuery, validateUUID } from './input-validation';

/**
 * Rate limiting middleware for API routes
 */
export function withRateLimit(
  handler: (request: NextRequest, context?: any) => Promise<NextResponse>,
  options: { windowMs?: number; maxRequests?: number } = {}
) {
  return async (request: NextRequest, context?: any): Promise<NextResponse> => {
    const identifier = getClientIdentifier(request);
    const limit = rateLimit(identifier, {
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
 * Validates search query from request
 */
export function validateSearchQueryParam(query: string | null): { valid: boolean; sanitized?: string; error?: string } {
  if (!query) {
    return { valid: true, sanitized: '' }; // Empty query is valid (returns empty results)
  }

  return validateSearchQuery(query);
}

/**
 * Adds security headers to response
 */
export function addSecurityHeaders(response: NextResponse): NextResponse {
  // Content Security Policy
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:;"
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
