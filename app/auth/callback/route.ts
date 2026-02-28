// OAuth Callback Handler
// Handles OAuth redirects from providers (e.g., Google)
// Based on Supabase docs: https://supabase.com/docs/guides/auth/social-login/auth-google
// Uses PKCE flow for secure authentication

// OAuth Callback Handler
// Handles OAuth redirects from providers (e.g., Google)
// Based on Supabase docs: https://supabase.com/docs/guides/auth/social-login/auth-google
// Note: For client-side OAuth flow, the browser client will automatically handle the session
// This route is mainly for PKCE flow support

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');
  const next = requestUrl.searchParams.get('next') || '/';
  const origin = requestUrl.origin;

  // Handle OAuth errors
  if (error) {
    const errorMessage = errorDescription || error;
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(errorMessage)}`
    );
  }

  // For implicit flow, the browser client handles the session automatically
  // For PKCE flow, the code exchange happens client-side
  // Just redirect to the next page - the session should be available
  return NextResponse.redirect(`${origin}${next}`);
}
