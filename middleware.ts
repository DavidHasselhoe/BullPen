// Next.js Middleware
// Runs on every request - add security headers, rate limiting, Supabase session refresh.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request,
  });

  // API routes authenticate themselves per-request (getSessionForApiRoute →
  // cookie-based getSession(), no network call) and don't rely on middleware
  // to refresh the session cookie. Skipping the network round-trip to
  // Supabase's auth server here removes ~50-150ms of TTFB from every single
  // API call. Pages/Server Components still get the refresh below, since they
  // read the session from the cookie without re-verifying it themselves.
  const isApiRoute = request.nextUrl.pathname.startsWith('/api/');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!isApiRoute && supabaseUrl && supabaseAnonKey) {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    });
    // Refresh session so Server Actions and Server Components see it
    await supabase.auth.getUser();
  }

  // Security Headers (OWASP recommended)
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=()'
  );
  // Isolates the browsing context from cross-origin popups/openers — required
  // for window.crossOriginIsolated and blocks a class of cross-window attacks.
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');

  // Content Security Policy (adjust as needed for your app)
  const csp = [
    "default-src 'self'",
    // app.termly.io: the official Termly embed script for self-updating legal
    // policy pages (Terms of Service) — see app/terms/page.tsx. The embed
    // script renders via an internal iframe (with iFrameResizer for auto
    // height), so it needs both script-src (to load the script) and
    // frame-src (to render the iframe it creates) — frame-src falls back to
    // default-src when unset, which is 'self' and would otherwise block it.
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://app.termly.io",
    "frame-src https://app.termly.io",
    "style-src 'self' 'unsafe-inline'", // Tailwind requires unsafe-inline
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https: wss:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  response.headers.set('Content-Security-Policy', csp);

  // HSTS (HTTP Strict Transport Security) - only on HTTPS
  if (request.nextUrl.protocol === 'https:') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Remove server information
  response.headers.delete('X-Powered-By');

  return response;
}

// Only run middleware on API routes and pages (not static assets)
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)).*)',
  ],
};
