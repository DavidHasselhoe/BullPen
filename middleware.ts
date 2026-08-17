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

  // CSRF defense-in-depth: the Supabase session cookie is SameSite=Lax
  // (required so the browser client can read it — see @supabase/ssr's
  // DEFAULT_COOKIE_OPTIONS), which already blocks the classic cross-site
  // form-post/fetch CSRF case, but nothing else backstops it. Browsers set
  // Origin on every same-origin AND cross-origin POST/PUT/PATCH/DELETE, so a
  // mismatch here is either a forged cross-site request or a non-browser
  // caller spoofing the header — legitimate non-browser callers (Stripe
  // webhooks, GitHub Actions crons) don't send an Origin header at all, so
  // this only blocks requests that DO send one and it doesn't match.
  const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
  if (isApiRoute && MUTATING_METHODS.has(request.method)) {
    const origin = request.headers.get('origin');
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
    }
  }

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

  // Attribution: first-touch cookie for the shareable-card growth loop.
  // Only set if absent, so a user who visits several shared links before
  // signing up gets credited to whichever one they saw first.
  const shareMatch = request.nextUrl.pathname.match(/^\/share\/([A-Za-z0-9_-]{6,12})$/);
  if (shareMatch && !request.cookies.has('bp_ref')) {
    response.cookies.set('bp_ref', shareMatch[1], {
      maxAge: 60 * 60 * 24 * 30,
      httpOnly: false, // read by client-side signUp()/callback code — see lib/auth/share-attribution.ts
      sameSite: 'lax',
      path: '/',
    });
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
  // 'unsafe-eval' is dev-only (Turbopack/webpack HMR relies on eval() for
  // fast refresh) — production builds don't need it, and it fully defeats
  // CSP's main XSS mitigation, so it must never ship to real users.
  const scriptSrc = process.env.NODE_ENV === 'production'
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-eval' 'unsafe-inline'";
  const csp = [
    "default-src 'self'",
    scriptSrc,
    // app.termly.io: legal policy pages (/privacy, /terms, /accessibility —
    // see components/legal/TermlyEmbed.tsx) render Termly's hosted policy
    // viewer directly in an iframe, not their JS embed script — deliberately,
    // since that script calls eval() internally and 'unsafe-eval' can't be
    // scoped to one script's origin in CSP, so allowing it here would open
    // eval-based XSS for every script on the page, not just Termly's. Only
    // frame-src is needed for this approach; nothing loads from Termly via
    // script-src. frame-src falls back to default-src ('self') when unset,
    // which would otherwise block the iframe.
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
