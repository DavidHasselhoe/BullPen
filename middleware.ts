// Next.js Middleware
// Runs on page requests (locale, Supabase session refresh, attribution cookies)
// and on API requests that carry an Origin header (the CSRF check). Security
// headers are in next.config.ts.

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
  // The one-click unsubscribe target is POSTed by mail providers (RFC 8058),
  // some with their own Origin; it carries a signed token, not a cookie, so
  // there is no session to forge.
  if (isApiRoute && MUTATING_METHODS.has(request.method) && request.nextUrl.pathname !== '/api/email/unsubscribe') {
    const origin = request.headers.get('origin');
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // No Supabase auth cookie (logged-out visitors, crawlers): nothing to refresh.
  const hasSession = request.cookies.getAll().some((c) => c.name.startsWith('sb-'));
  if (!isApiRoute && hasSession && supabaseUrl && supabaseAnonKey) {
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

  // Personal invite links (/invite/<code>) set their first-touch bp_inv cookie
  // from the page itself (InviteLanding), which only renders for a code that
  // belongs to an account. Set here, any 10 hex characters claimed the cookie
  // for 30 days, so a mistyped link blocked the real one opened later.

  return response;
}

export const config = {
  matcher: [
    // Pages: everything except API routes and static files.
    '/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)).*)',
    // API: only requests with an Origin header, which is all the CSRF check
    // needs. Browsers send Origin on every POST/PUT/PATCH/DELETE but not on
    // the app's own same-origin GETs, so the GET calls behind each page view
    // (quotes, sparklines, the notification count) skip middleware.
    { source: '/api/:path*', has: [{ type: 'header', key: 'origin' }] },
  ],
};
