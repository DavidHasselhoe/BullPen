// Next.js Middleware
// Runs on every request - add security headers, rate limiting, Supabase session refresh.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { isSupportedLanguage, isValidLocale } from './lib/i18n/language-names';

const LOCALE_COOKIE = 'bp_lang';
const LOCALE_HEADER = 'x-bp-locale';
const PATHNAME_HEADER = 'x-bp-pathname';
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/**
 * Resolves the request's locale without a DB round-trip: the `bp_lang`
 * cookie (written from `users.settings.language`, the canonical source, on
 * every settings save and on post-auth reconciliation — see
 * components/i18n/LanguageProvider.tsx) if present, else a same-request
 * Accept-Language guess, else 'en'. Supabase is never queried here — that
 * would add a DB call to every single request just to render `<html lang>`.
 */
function resolveLocale(request: NextRequest): string {
  // isValidLocale (not isSupportedLanguage) so the dev-only 'qa' pseudo-locale
  // cookie works for the un-extracted-string sweep (see lib/i18n/language-names.ts) —
  // real users only ever have a SUPPORTED_LANGUAGES value here since that's
  // all the Settings dropdown can write.
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  if (cookieLocale && isValidLocale(cookieLocale)) return cookieLocale;

  const acceptLanguage = request.headers.get('accept-language');
  if (acceptLanguage) {
    const primary = acceptLanguage.split(',')[0]?.split('-')[0]?.trim().toLowerCase();
    if (primary && isSupportedLanguage(primary)) return primary;
  }

  return 'en';
}

export async function middleware(request: NextRequest) {
  // API routes authenticate themselves per-request (getSessionForApiRoute →
  // cookie-based getSession(), no network call) and don't rely on middleware
  // to refresh the session cookie. Skipping the network round-trip to
  // Supabase's auth server here removes ~50-150ms of TTFB from every single
  // API call. Pages/Server Components still get the refresh below, since they
  // read the session from the cookie without re-verifying it themselves.
  const isApiRoute = request.nextUrl.pathname.startsWith('/api/');

  // Locale resolution (pages only — API routes have no <html lang> to serve
  // and don't need the header). Forwarded via a request header so
  // app/layout.tsx can read it with headers() without re-parsing cookies.
  let locale: string | null = null;
  let requestHadLocaleCookie = true;
  if (!isApiRoute) {
    requestHadLocaleCookie = request.cookies.has(LOCALE_COOKIE);
    locale = resolveLocale(request);
  }

  const requestHeaders = new Headers(request.headers);
  if (locale) {
    requestHeaders.set(LOCALE_HEADER, locale);
    // Next.js Server Components have no direct access to the request path;
    // app/layout.tsx (a Server Component) needs it to preload the right
    // namespace via namespacesForPath() — see lib/i18n/server.ts.
    requestHeaders.set(PATHNAME_HEADER, request.nextUrl.pathname);
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // First request with no saved preference: seed the cookie so subsequent
  // requests (and the client-side i18next instance) agree with what the
  // server just rendered, instead of re-guessing from Accept-Language every
  // time. Once Settings saves a real preference this is overwritten from
  // users.settings.language — see components/i18n/LanguageProvider.tsx.
  if (locale && !requestHadLocaleCookie) {
    response.cookies.set(LOCALE_COOKIE, locale, {
      maxAge: LOCALE_COOKIE_MAX_AGE,
      httpOnly: false, // read by client-side i18next init — see lib/i18n/config.ts
      sameSite: 'lax',
      path: '/',
    });
  }

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
  // PostHog's array.js loader lazy-loads its config plus recorder/surveys/
  // web-vitals sub-bundles from this asset host at init time regardless of
  // which features are actually enabled — same-origin script-src alone
  // blocks that fetch outright (not just the unused extras), so it needs an
  // explicit allowance rather than a client-side config flag.
  const scriptSrc = process.env.NODE_ENV === 'production'
    ? "script-src 'self' 'unsafe-inline' https://us-assets.i.posthog.com"
    : "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://us-assets.i.posthog.com";
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
