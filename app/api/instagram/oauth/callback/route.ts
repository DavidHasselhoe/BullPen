/**
 * One-time setup helper for Business Login for Instagram (see
 * docs/instagram-setup.md). Meta's authorization URL redirects here with a
 * `code` query param after the account owner approves the app; this route
 * does the two-step exchange (short-lived token -> long-lived token) and
 * prints the resulting INSTAGRAM_ACCESS_TOKEN / INSTAGRAM_USER_ID so they
 * can be pasted into Vercel env vars. It never stores or forwards the
 * token anywhere else.
 *
 * Needs INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET set (from the Meta App
 * Dashboard) — separate from INSTAGRAM_ACCESS_TOKEN/INSTAGRAM_USER_ID,
 * which this route exists to produce. Also usable to re-run this flow
 * after a token expires (~60 days) since there's no automated refresh yet.
 *
 * The `code` Meta hands back is single-use and expires within minutes, so
 * this only works immediately after the redirect — if it fails, restart
 * from the authorization URL rather than retrying the same code.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function redirectUri(request: NextRequest): string {
  return `${new URL(request.url).origin}/api/instagram/oauth/callback`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get('code');
  const error = request.nextUrl.searchParams.get('error_description') ?? request.nextUrl.searchParams.get('error');
  if (error) {
    return new NextResponse(`Instagram authorization failed: ${error}`, { status: 400 });
  }
  if (!code) {
    return new NextResponse('Missing "code" query param — this route is meant to be hit via Meta\'s OAuth redirect, not visited directly.', { status: 400 });
  }

  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!appId || !appSecret) {
    return new NextResponse('INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET are not set — add them (from the Meta App Dashboard) before starting this flow.', { status: 500 });
  }

  try {
    // Step 1: authorization code -> short-lived access token (+ the
    // Instagram-scoped user id, returned in the same response).
    const codeForm = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri(request),
      code,
    });
    const shortLivedRes = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      body: codeForm,
    });
    const shortLivedJson = await shortLivedRes.json();
    if (!shortLivedRes.ok) {
      return new NextResponse(`Short-lived token exchange failed: ${JSON.stringify(shortLivedJson)}`, { status: 500 });
    }
    const entry = shortLivedJson.data?.[0] ?? shortLivedJson;
    const shortLivedToken = entry.access_token as string | undefined;
    const userId = entry.user_id as string | number | undefined;
    if (!shortLivedToken || !userId) {
      return new NextResponse(`Unexpected response shape from short-lived token exchange: ${JSON.stringify(shortLivedJson)}`, { status: 500 });
    }

    // Step 2: short-lived -> long-lived token (~60 day expiry).
    const longLivedUrl = new URL('https://graph.instagram.com/access_token');
    longLivedUrl.searchParams.set('grant_type', 'ig_exchange_token');
    longLivedUrl.searchParams.set('client_secret', appSecret);
    longLivedUrl.searchParams.set('access_token', shortLivedToken);
    const longLivedRes = await fetch(longLivedUrl.toString());
    const longLivedJson = await longLivedRes.json();
    if (!longLivedRes.ok || !longLivedJson.access_token) {
      return new NextResponse(`Long-lived token exchange failed: ${JSON.stringify(longLivedJson)}`, { status: 500 });
    }

    const expiresInDays = Math.round((longLivedJson.expires_in as number) / 86_400);

    return new NextResponse(
      `Instagram setup succeeded. Add these to Vercel (all environments) and remove them from anywhere else you pasted them:\n\n` +
      `INSTAGRAM_ACCESS_TOKEN=${longLivedJson.access_token}\n` +
      `INSTAGRAM_USER_ID=${userId}\n\n` +
      `This token expires in ~${expiresInDays} days. There's no automated refresh yet — re-run this flow ` +
      `(visit the authorization URL again) before then, or call ` +
      `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=<current token> directly.`,
      { status: 200, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new NextResponse(`OAuth exchange failed: ${message}`, { status: 500 });
  }
}
